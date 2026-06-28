import { app, BrowserWindow, ipcMain, shell } from 'electron'
import axios from 'axios'
import { nodeManager } from './nodeManager'
import path from 'path'
import { RpcClient } from './rpc'
import { ConfigManager } from './config'
import { IPC } from '../shared/types'
import type { AddressDetails, FeeEstimate, MarketPrice, NodeHealth, RPCConfig, SendTxParams } from '../shared/types'

const isDev = process.env.NODE_ENV === 'development'
  || !require('fs').existsSync(require('path').join(__dirname, '..', 'renderer', 'index.html'))

let mainWindow: BrowserWindow | null = null
let rpc: RpcClient
let hasAddressIndex = false // détecté au démarrage
const EXPLORER_API_URL = 'https://explorer.zeroclassic.org/api.php'
const FALLBACK_FEE = 0.0001
const ZATOSHIS = 100_000_000
const BURN_RATE = 0.01
const fs = require('fs')
const os = require('os')
const SEND_JOURNAL_FILE = path.join(os.homedir(), '.zerc-wallet', 'send-journal.json')

interface SendJournalEntry {
  opid: string
  txid?: string
  fromAddress: string
  toAddress: string
  amount: number
  memo?: string
  createdAt: number
  status: 'submitted' | 'success' | 'failed'
  error?: string
}

function loadSendJournal(): SendJournalEntry[] {
  try {
    if (!fs.existsSync(SEND_JOURNAL_FILE)) return []
    return JSON.parse(fs.readFileSync(SEND_JOURNAL_FILE, 'utf-8')) as SendJournalEntry[]
  } catch {
    return []
  }
}

function saveSendJournal(entries: SendJournalEntry[]) {
  const dir = path.dirname(SEND_JOURNAL_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SEND_JOURNAL_FILE, JSON.stringify(entries.slice(-250), null, 2), 'utf-8')
}

function upsertSendJournal(entry: SendJournalEntry) {
  const entries = loadSendJournal()
  const idx = entries.findIndex(e => e.opid === entry.opid)
  if (idx >= 0) entries[idx] = { ...entries[idx], ...entry }
  else entries.push(entry)
  saveSendJournal(entries)
}

function updateSendJournal(opid: string, patch: Partial<SendJournalEntry>) {
  const entries = loadSendJournal()
  const idx = entries.findIndex(e => e.opid === opid)
  if (idx === -1) return
  entries[idx] = { ...entries[idx], ...patch }
  saveSendJournal(entries)
}

function toUnits(value: number) {
  return Math.round(value * ZATOSHIS)
}

function fromUnits(value: number) {
  return value / ZATOSHIS
}

function calculateBurnUnits(amountUnits: number) {
  return Math.ceil(amountUnits * BURN_RATE)
}

function formatZerc(value: number) {
  return fromUnits(toUnits(value)).toFixed(8)
}

async function getSpendableBalance(address: string): Promise<number> {
  if (address.startsWith('z')) {
    return await rpc.call<number>('z_getbalance', [address]).catch(() => 0)
  }

  const utxos = await rpc.call<any[]>('listunspent', [1, 9999999, [address]]).catch(() => [])
  return utxos.reduce((sum, utxo) => sum + (Number(utxo.amount) || 0), 0)
}

function applyOperationToJournal(opid: string, result: any) {
  if (!result) return
  if (result.status === 'success') {
    updateSendJournal(opid, { status: 'success', txid: result.result?.txid })
  }
  if (result.status === 'failed') {
    updateSendJournal(opid, { status: 'failed', error: result.error?.message ?? JSON.stringify(result.error) })
  }
}

async function syncSendJournal() {
  const submitted = loadSendJournal().filter(entry => entry.status === 'submitted')
  for (const entry of submitted) {
    try {
      const status = await rpc.call('z_getoperationstatus', [[entry.opid]]).catch(() => [])
      if (status?.length > 0) {
        applyOperationToJournal(entry.opid, status[0])
        continue
      }

      const results = await rpc.call('z_getoperationresult', [[entry.opid]]).catch(() => [])
      if (results?.length > 0) applyOperationToJournal(entry.opid, results[0])
    } catch {
      // Keep the submitted state when the node cannot answer.
    }
  }
}

function journalToTransactions(): any[] {
  return loadSendJournal().map(entry => ({
    txid: entry.txid ?? entry.opid,
    amount: -Math.abs(entry.amount),
    fee: undefined,
    confirmations: entry.status === 'success' && entry.txid ? 1 : 0,
    blocktime: Math.floor(entry.createdAt / 1000),
    address: entry.fromAddress,
    fromAddress: entry.fromAddress,
    toAddress: entry.toAddress,
    memo: entry.memo,
    error: entry.error,
    type: 'send',
    category: entry.status === 'failed' ? 'failed' : 'send',
    isShielded: entry.fromAddress.startsWith('z') || entry.toAddress.startsWith('z'),
    sourceRank: 0,
    localJournal: true,
  }))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 720, minWidth: 900, minHeight: 600,
    frame: false, titleBarStyle: 'hidden',
    backgroundColor: '#0d0b14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../resources/icon.png'),
  })
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  let config = ConfigManager.load()
  const configPath = path.join(require('os').homedir(), '.zerc-wallet', 'config.json')
  if (!require('fs').existsSync(configPath)) {
    const detected = ConfigManager.detectNodeConfig()
    if (Object.keys(detected).length > 0) {
      config = { rpc: { ...config.rpc, ...detected } }
      ConfigManager.save(config)
    }
  }
  rpc = new RpcClient(config.rpc)

  // Auto-start zerod if not already running
  const isReachable = await rpc.isReachable()
  if (!isReachable) {
    if (nodeManager.isAvailable()) {
      console.log('[Main] Node unreachable — attempting to start zerod automatically')
      const result = nodeManager.start()
      if (result.ok) {
        // Wait up to 30s for the node to be ready
        console.log('[Main] zerod started, waiting for RPC...')
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000))
          if (await rpc.isReachable()) {
            console.log('[Main] Node is ready!')
            break
          }
        }
      } else {
        console.warn('[Main] Could not start zerod:', result.error)
      }
    } else {
      console.log('[Main] zerod not found — user must start it manually')
    }
  } else {
    console.log('[Main] Node already running')
  }

  // Détecte si addressindex est activé sur ce node
  try {
    // Prend une adresse depuis listaddressgroupings (plus fiable)
    const groups: any[][] = await rpc.call('listaddressgroupings').catch(() => [])
    const testAddr = groups.flat()?.[0]?.[0] ?? null
    if (testAddr) {
      await rpc.call('getaddressbalance', [{ addresses: [testAddr] }])
      hasAddressIndex = true
      console.log('[Main] addressindex detected — using fast indexed queries')
    }
  } catch {
    hasAddressIndex = false
    console.log('[Main] addressindex not available — using listtransactions')
  }

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  // Stop zerod only if we started it
  if (nodeManager.wasStartedByUs()) {
    nodeManager.stop()
  }
  if (process.platform !== 'darwin') app.quit()
})

// ─── Node log streaming ──────────────────────────────────────────────────────
nodeManager.on('log', (msg: string) => {
  mainWindow?.webContents.send('node:log', msg)
})
nodeManager.on('stopped', (code: number) => {
  mainWindow?.webContents.send('node:stopped', code)
})

// ─── Node management ─────────────────────────────────────────────────────────
ipcMain.handle('node:status', () => ({
  available: nodeManager.isAvailable(),
  running: nodeManager.isRunning(),
  startedByUs: nodeManager.wasStartedByUs(),
  path: nodeManager.getPath(),
  platform: process.platform,
  placeholder: process.platform === 'win32'
    ? 'e.g. C:\\ZeroClassic\\zerod.exe'
    : 'e.g. /usr/local/bin/zerod',
  logs: nodeManager.getLogs(),
}))

ipcMain.handle('node:start', async () => {
  const result = nodeManager.start()
  if (result.ok) {
    // Wait up to 30s
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000))
      if (await rpc.isReachable()) return { ok: true }
    }
    return { ok: false, error: 'Node started but RPC not responding after 30s' }
  }
  return result
})

ipcMain.handle('node:stop', () => {
  nodeManager.stop()
  return { ok: true }
})

ipcMain.handle('node:setPath', (_, p: string) => {
  nodeManager.setPath(p)
  return { ok: true }
})

// ─── Node info ────────────────────────────────────────────────────────────────
ipcMain.handle(IPC.GET_NODE_INFO, async () => {
  try {
    const [info, blockchainInfo] = await Promise.all([
      rpc.call('getinfo'),
      rpc.call('getblockchaininfo').catch(() => null),
    ])
    return {
      version: info.build ?? `v${Math.floor(info.version/1000000)}.${Math.floor((info.version%1000000)/10000)}.${Math.floor((info.version%10000)/100)}`,
      protocolversion: info.protocolversion,
      blocks: info.blocks,
      connections: info.connections,
      difficulty: info.difficulty,
      testnet: info.testnet ?? false,
      syncing: blockchainInfo ? (blockchainInfo.headers - blockchainInfo.blocks) > 10 : false,
      syncProgress: blockchainInfo?.verificationprogress,
    }
  } catch (err: any) {
    throw new Error(`Cannot connect to ZERC node: ${err.message}`)
  }
})

// ─── Balance ──────────────────────────────────────────────────────────────────
ipcMain.handle(IPC.GET_NODE_HEALTH, async (): Promise<NodeHealth> => {
  const config = ConfigManager.load().rpc
  const processStatus = {
    available: nodeManager.isAvailable(),
    running: nodeManager.isRunning(),
    startedByUs: nodeManager.wasStartedByUs(),
    path: nodeManager.getPath(),
    platform: process.platform,
  }

  const [localResult, explorerResult] = await Promise.allSettled([
    Promise.all([
      rpc.call('getinfo'),
      rpc.call('getblockchaininfo').catch(() => null),
    ]),
    axios.get(EXPLORER_API_URL, {
      params: { action: 'height' },
      timeout: 8_000,
    }),
  ])

  const health: NodeHealth = {
    checkedAt: new Date().toISOString(),
    rpc: {
      ok: localResult.status === 'fulfilled',
      host: config.host,
      port: config.port,
      error: localResult.status === 'rejected' ? String(localResult.reason?.message ?? localResult.reason) : undefined,
    },
    process: processStatus,
    local: {},
    explorer: { ok: false },
    addressIndex: hasAddressIndex,
  }

  if (localResult.status === 'fulfilled') {
    const [info, blockchainInfo] = localResult.value
    health.local = {
      version: info.build ?? `v${Math.floor(info.version / 1000000)}.${Math.floor((info.version % 1000000) / 10000)}.${Math.floor((info.version % 10000) / 100)}`,
      protocolversion: info.protocolversion,
      blocks: info.blocks,
      headers: blockchainInfo?.headers,
      connections: info.connections,
      difficulty: info.difficulty,
      syncing: blockchainInfo ? (blockchainInfo.headers - blockchainInfo.blocks) > 10 : false,
      syncProgress: blockchainInfo?.verificationprogress,
    }
  }

  if (explorerResult.status === 'fulfilled' && explorerResult.value.data?.ok) {
    const data = explorerResult.value.data.data ?? {}
    const height = Number(data.height)
    health.explorer = {
      ok: true,
      height: Number.isFinite(height) ? height : undefined,
      hash: data.hash ?? data.best_block_hash,
      time: data.time,
    }
  } else {
    health.explorer = {
      ok: false,
      error: explorerResult.status === 'rejected'
        ? String(explorerResult.reason?.message ?? explorerResult.reason)
        : String(explorerResult.value?.data?.error ?? 'Explorer returned an invalid response'),
    }
  }

  if (typeof health.local.blocks === 'number' && typeof health.explorer.height === 'number') {
    health.lagBlocks = Math.max(0, health.explorer.height - health.local.blocks)
  }

  return health
})

ipcMain.handle(IPC.GET_BALANCE, async () => {
  const transparent = await rpc.call<number>('getbalance')
  const zTotal = await rpc.call<{ transparent: string; private: string; total: string }>('z_gettotalbalance').catch(() => null)
  const private_bal = zTotal ? parseFloat(zTotal.private) : 0
  return { transparent, private: private_bal, total: transparent + private_bal }
})

// ─── Addresses ────────────────────────────────────────────────────────────────
ipcMain.handle(IPC.GET_ADDRESSES, async () => {
  const groups: any[][] = await rpc.call('listaddressgroupings').catch(() => [])
  const tAddressMap = new Map<string, { balance: number; label: string }>()
  for (const group of groups) {
    for (const entry of group) {
      const addr: string = entry[0]
      const balance: number = entry[1] ?? 0
      const label: string = entry[2] ?? ''
      if (!tAddressMap.has(addr) || balance > (tAddressMap.get(addr)?.balance ?? 0)) {
        tAddressMap.set(addr, { balance, label })
      }
    }
  }
  const allTAddrs: string[] = await rpc.call('getaddressesbyaccount', ['']).catch(() => [])
  for (const addr of allTAddrs) {
    if (!tAddressMap.has(addr)) tAddressMap.set(addr, { balance: 0, label: '' })
  }
  const tBalances = Array.from(tAddressMap.entries()).map(([address, { balance, label }]) => ({
    address, type: 'transparent' as const, balance, label,
  }))
  const zAddrs: string[] = await rpc.call('z_listaddresses').catch(() => [])
  const zBalances = await Promise.all(
    zAddrs.map(async addr => {
      const balance = await rpc.call<number>('z_getbalance', [addr]).catch(() => 0)
      return { address: addr, type: 'shielded' as const, balance, label: '' }
    })
  )
  return [...tBalances, ...zBalances]
})

// ─── Transactions ─────────────────────────────────────────────────────────────

async function getWalletAddresses(): Promise<Set<string>> {
  const [tAddrs, zAddrs] = await Promise.all([
    rpc.call('getaddressesbyaccount', ['']).catch(() => [] as string[]),
    rpc.call('z_listaddresses').catch(() => [] as string[]),
  ])
  return new Set([...tAddrs, ...zAddrs])
}

async function resolveFromAddress(txid: string, vout: number): Promise<string | null> {
  try {
    const prevTx = await rpc.call('getrawtransaction', [txid, 1])
    return prevTx?.vout?.[vout]?.scriptPubKey?.addresses?.[0] ?? null
  } catch { return null }
}

async function getWalletTransactionMeta(txid: string): Promise<any | null> {
  try {
    return await rpc.call('gettransaction', [txid])
  } catch {
    return null
  }
}

function explorerTimeToBlocktime(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const normalized = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined
}

async function getExplorerAddressTransactions(addresses: string[], currentHeight: number): Promise<any[]> {
  const unique = Array.from(new Set(addresses)).slice(0, 30)
  const results = await Promise.all(unique.map(async address => {
    try {
      const response = await axios.get(EXPLORER_API_URL, {
        params: { action: 'address', addr: address, limit: 80, offset: 0 },
        timeout: 10_000,
      })
      if (!response.data?.ok) return []

      const events = [
        ...(response.data.data?.events ?? []),
        ...(response.data.data?.out_events ?? []),
      ]
      const seenEvents = new Set<string>()
      return events.map((event: any) => {
        const key = `${event.txid}:${event.kind}:${event.value}:${event.height}`
        if (seenEvents.has(key)) return null
        seenEvents.add(key)
        const height = typeof event.height === 'number' ? event.height : Number(event.height)
        const blocktime = explorerTimeToBlocktime(event.time)
        const isSend = event.kind === 'out'
        return {
          txid: event.txid,
          amount: isSend ? -Math.abs(Number(event.value) || 0) : Number(event.value) || 0,
          fee: undefined,
          confirmations: Number.isFinite(height) && height > 0 ? Math.max(0, currentHeight - height + 1) : 0,
          blocktime,
          address,
          fromAddress: isSend ? address : null,
          toAddress: isSend ? null : address,
          memo: undefined,
          type: isSend ? 'send' : 'receive',
          category: isSend ? 'send' : 'receive',
          isShielded: false,
          height,
          sourceRank: 0,
        }
      }).filter(Boolean)
    } catch (err: any) {
      console.warn(`[TX] explorer address lookup failed for ${address}:`, err.message)
      return []
    }
  }))
  return results.flat()
}

ipcMain.handle(IPC.GET_ADDRESS_DETAILS, async (_, address: string): Promise<AddressDetails> => {
  if (!address || address.startsWith('z')) {
    const balance = address
      ? await rpc.call<number>('z_getbalance', [address]).catch(() => 0)
      : 0
    return { address, source: 'local', balance, events: [] }
  }

  try {
    const response = await axios.get(EXPLORER_API_URL, {
      params: { action: 'address', addr: address, limit: 80, offset: 0 },
      timeout: 10_000,
    })
    if (!response.data?.ok) throw new Error(response.data?.error ?? 'Explorer returned an error')

    const data = response.data.data ?? {}
    const stats = data.address ?? {}
    const events = (data.events ?? []).map((event: any) => ({
      txid: String(event.txid ?? ''),
      kind: event.kind === 'out' ? 'out' as const : 'in' as const,
      value: Number(event.value) || 0,
      height: event.height === null || event.height === undefined ? undefined : Number(event.height),
      time: event.time,
    }))

    return {
      address,
      source: 'explorer',
      balance: Number(stats.real_balance ?? stats.balance) || 0,
      receivedTotal: stats.received_total === undefined ? undefined : Number(stats.received_total),
      sentTotal: stats.sent_total === undefined ? undefined : Number(stats.sent_total),
      txCount: stats.tx_count === undefined ? undefined : Number(stats.tx_count),
      firstSeenTime: stats.first_seen_time,
      lastSeenTime: stats.last_seen_time,
      lastSeenHeight: stats.last_seen_height === undefined ? undefined : Number(stats.last_seen_height),
      events,
    }
  } catch (err: any) {
    return {
      address,
      source: 'local',
      balance: 0,
      events: [],
      error: err.message ?? 'Explorer lookup failed',
    }
  }
})

ipcMain.handle(IPC.GET_TRANSACTIONS, async () => {
  const allTxs: any[] = []
  await syncSendJournal()
  allTxs.push(...journalToTransactions())
  const walletAddrs = await getWalletAddresses()
  const tWalletAddrs = Array.from(walletAddrs).filter(a => !a.startsWith('z'))
  const currentInfo = await rpc.call('getinfo').catch(() => ({ blocks: 0 }))
  const currentHeight = Number(currentInfo?.blocks ?? 0)
  allTxs.push(...await getExplorerAddressTransactions(tWalletAddrs, currentHeight))

  if (hasAddressIndex) {
    // ── Mode rapide : addressindex disponible ────────────────────────────────
    // Récupère les txids des 100 dernières tx via getaddresstxids par adresse
    try {
      const info = currentInfo?.blocks ? currentInfo : await rpc.call('getinfo')
      const startBlock = Math.max(0, info.blocks - 2000)
      const tAddrs = tWalletAddrs

      if (tAddrs.length > 0) {
        const txids: string[] = await rpc.call('getaddresstxids', [{
          addresses: tAddrs,
          start: startBlock,
          end: info.blocks,
        }]).catch(() => [])

        const seen = new Set<string>()
        // Prend les 100 derniers txids
        for (const txid of txids.slice(-100).reverse()) {
          if (seen.has(txid)) continue
          seen.add(txid)
          try {
            const tx = await rpc.call('gettransaction', [txid])
            for (const d of (tx.details ?? [])) {
              allTxs.push({
                txid: tx.txid, amount: d.amount, fee: tx.fee,
                confirmations: tx.confirmations,
                blocktime: tx.blocktime ?? tx.time,
                address: d.address, fromAddress: null, toAddress: null,
                memo: undefined, type: d.amount < 0 ? 'send' : 'receive',
                category: d.category, isShielded: (d.address ?? '').startsWith('z'),
              })
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      console.warn('[TX] addressindex query failed:', e.message)
    }
  } else {
    // ── Mode standard : listtransactions ────────────────────────────────────
    try {
      // Récupère 500 entrées et trie par blocktime pour avoir les vraiment récentes
      const txList = await rpc.call('listtransactions', ['*', 500, 0], true)
      const sorted = (txList ?? []).sort((a: any, b: any) =>
        (b.blocktime ?? b.time ?? 0) - (a.blocktime ?? a.time ?? 0)
      )
      const seen = new Set<string>()
      for (const tx of sorted) {
        const key = tx.txid + (tx.address ?? '') + tx.category
        if (seen.has(key)) continue
        seen.add(key)
        allTxs.push({
          txid: tx.txid, amount: tx.amount, fee: tx.fee,
          confirmations: tx.confirmations, blocktime: tx.blocktime ?? tx.time,
          address: tx.address, fromAddress: null, toAddress: null,
          memo: tx.memo, type: tx.amount < 0 ? 'send' : 'receive',
          category: tx.category, isShielded: (tx.address ?? '').startsWith('z'),
        })
        if (allTxs.length >= 100) break // Limite à 100 après tri
      }
    } catch (e: any) {
      console.warn('[TX] listtransactions failed:', e.message)
      // Fallback : listsinceblock
      try {
        const info = await rpc.call('getinfo')
        const recentHeight = Math.max(0, info.blocks - 1000)
        const blockHash = await rpc.call('getblockhash', [recentHeight])
        const result = await rpc.call('listsinceblock', [blockHash, 1], true)
        const seen = new Set<string>()
        for (const tx of (result.transactions ?? [])) {
          const key = tx.txid + (tx.address ?? '') + tx.category
          if (seen.has(key)) continue
          seen.add(key)
          allTxs.push({
            txid: tx.txid, amount: tx.amount, fee: tx.fee,
            confirmations: tx.confirmations, blocktime: tx.blocktime ?? tx.time,
            address: tx.address, fromAddress: null, toAddress: null,
            memo: tx.memo, type: tx.amount < 0 ? 'send' : 'receive',
            category: tx.category, isShielded: (tx.address ?? '').startsWith('z'),
          })
        }
      } catch { /* ignore */ }
    }
  }

  // Z-addresses via z_listreceivedbyaddress
  try {
    const zAddrs: string[] = await rpc.call('z_listaddresses').catch(() => [])
    for (const zaddr of zAddrs) {
      try {
        const zReceived = await rpc.call('z_listreceivedbyaddress', [zaddr, 0], true)
        for (const r of (zReceived ?? []).slice(-20)) {
          // Evite les doublons avec listtransactions
          if (allTxs.some(t => t.txid === r.txid && t.address === zaddr)) continue
          const txMeta = await getWalletTransactionMeta(r.txid)
          allTxs.push({
            txid: r.txid, amount: r.amount, fee: undefined,
            confirmations: txMeta?.confirmations ?? r.confirmations ?? 0,
            blocktime: txMeta?.blocktime ?? txMeta?.time,
            address: zaddr, fromAddress: null, toAddress: null,
            memo: r.memo, type: 'receive', category: 'receive', isShielded: true,
            height: txMeta?.blockindex,
            sourceRank: 2,
          })
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // Déduplique et trie
  const seen2 = new Set<string>()
  const deduped = allTxs
    .filter(tx => {
      const key = tx.txid + (tx.address ?? '') + tx.type
      if (seen2.has(key)) return false
      seen2.add(key)
      return true
    })
    .sort((a, b) => {
      const byTime = (b.blocktime ?? 0) - (a.blocktime ?? 0)
      if (byTime !== 0) return byTime
      const byHeight = (b.height ?? 0) - (a.height ?? 0)
      if (byHeight !== 0) return byHeight
      return (a.sourceRank ?? 9) - (b.sourceRank ?? 9)
    })
    .slice(0, 100)

  // Résout from/to
  for (const tx of deduped) {
    if (tx.isShielded) {
      tx.fromAddress = tx.fromAddress ?? (tx.type === 'receive' ? 'Shielded address' : tx.address)
      tx.toAddress   = tx.toAddress ?? (tx.type === 'receive' ? tx.address : 'Shielded address')
      continue
    }
    if (tx.category === 'generate') {
      tx.fromAddress = 'Coinbase (mining reward)'
      tx.toAddress   = tx.address
      continue
    }
    try {
      const raw = await rpc.call('getrawtransaction', [tx.txid, 1]).catch(() => null)
      if (raw?.vin?.some((vin: any) => vin.coinbase)) {
        tx.fromAddress = 'Coinbase (mining reward)'
        tx.toAddress = tx.address
        tx.category = 'generate'
        continue
      }
      if (!raw) { tx.fromAddress = '—'; tx.toAddress = tx.address; continue }
      if (tx.type === 'receive') {
        const vin = raw.vin?.[0]
        tx.fromAddress = vin?.txid ? await resolveFromAddress(vin.txid, vin.vout) : '—'
        tx.toAddress   = tx.address
      } else {
        tx.fromAddress = tx.address
        const ext = raw.vout?.filter((v: any) => {
          const a = v.scriptPubKey?.addresses?.[0]
          return a && !walletAddrs.has(a)
        }) ?? []
        tx.toAddress = ext.length > 0 ? ext[0].scriptPubKey.addresses[0] : tx.address
      }
    } catch { tx.fromAddress = '—'; tx.toAddress = tx.address }
  }

  return deduped
})

// ─── New address ──────────────────────────────────────────────────────────────
ipcMain.handle(IPC.GET_MARKET_PRICE, async (): Promise<MarketPrice> => {
  try {
    const response = await axios.get('https://explorer.zeroclassic.org/api.php', {
      params: { action: 'price' },
      timeout: 10_000,
    })
    const data = response.data?.data ?? response.data
    const rawPrice = data?.last_price ?? data?.price ?? data?.usd
    const price = Number(rawPrice)
    return {
      symbol: 'ZERC',
      currency: 'USD',
      price: Number.isFinite(price) ? price : null,
      source: 'explorer',
      updatedAt: new Date().toISOString(),
      error: Number.isFinite(price) ? undefined : 'Explorer price unavailable',
    }
  } catch (err: any) {
    return {
      symbol: 'ZERC',
      currency: 'USD',
      price: null,
      source: 'explorer',
      updatedAt: new Date().toISOString(),
      error: err?.message ?? 'Explorer price unavailable',
    }
  }
})

ipcMain.handle(IPC.NEW_ADDRESS, async (_, type: 'transparent' | 'shielded') => {
  if (type === 'shielded') return rpc.call('z_getnewaddress')
  return rpc.call('getnewaddress')
})

ipcMain.handle(IPC.ESTIMATE_FEE, async (_, blocks = 6): Promise<FeeEstimate> => {
  const targetBlocks = Number.isFinite(Number(blocks)) && Number(blocks) > 0 ? Number(blocks) : 6
  try {
    const fee = await rpc.call<number>('estimatefee', [targetBlocks])
    if (Number.isFinite(fee) && fee > 0) {
      return { fee, source: 'estimatefee', blocks: targetBlocks }
    }
    return { fee: FALLBACK_FEE, source: 'fallback', blocks: targetBlocks, error: `estimatefee returned ${fee}` }
  } catch (err: any) {
    return { fee: FALLBACK_FEE, source: 'fallback', blocks: targetBlocks, error: err?.message ?? 'estimatefee unavailable' }
  }
})

// ─── Send transaction ─────────────────────────────────────────────────────────
ipcMain.handle(IPC.SEND_TX, async (_, params: SendTxParams) => {
  const { fromAddress, toAddress, memo } = params
  const amount = typeof params.amount === 'string'
    ? parseFloat((params.amount as string).replace(',', '.'))
    : params.amount
  if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount')
  const fee = typeof params.fee === 'string'
    ? parseFloat((params.fee as string).replace(',', '.'))
    : params.fee
  const normalizedFee = Number.isFinite(fee) && fee && fee > 0 ? fee : undefined
  const networkFee = normalizedFee ?? FALLBACK_FEE
  const amountUnits = toUnits(amount)
  const networkFeeUnits = toUnits(networkFee)
  const burnUnits = calculateBurnUnits(amountUnits)
  const totalRequiredUnits = amountUnits + networkFeeUnits + burnUnits
  const isShielded = fromAddress.startsWith('z') || toAddress.startsWith('z')
  try {
    const spendableBalance = await getSpendableBalance(fromAddress)
    const spendableUnits = toUnits(spendableBalance)
    if (spendableUnits < totalRequiredUnits) {
      throw new Error(
        `Insufficient balance. Required ${formatZerc(fromUnits(totalRequiredUnits))} ZERC ` +
        `(amount ${formatZerc(amount)} + network fee ${formatZerc(networkFee)} + burn fee ${formatZerc(fromUnits(burnUnits))}), ` +
        `available ${formatZerc(spendableBalance)} ZERC.`
      )
    }

    const recipients: any[] = [{ address: toAddress, amount }]
    if (memo) recipients[0].memo = memo
    const args = normalizedFee ? [fromAddress, recipients, 1, normalizedFee] : [fromAddress, recipients, 1]
    const opid = await rpc.call('z_sendmany', args)
    upsertSendJournal({
      opid,
      fromAddress,
      toAddress,
      amount,
      memo,
      createdAt: Date.now(),
      status: 'submitted',
    })
    return { opid, type: isShielded ? 'shielded' : 'transparent' }
  } catch (err: any) {
    const msg = err?.message ?? 'Transaction failed'
    const rpcMatch = msg.match(/RPC Error \[-?\d+\]: (.+)/)
    throw new Error(rpcMatch ? rpcMatch[1] : msg)
  }
})

// ─── Operation status ─────────────────────────────────────────────────────────
ipcMain.handle('wallet:getOperationStatus', async (_, opid: string) => {
  const results = await rpc.call('z_getoperationresult', [[opid]]).catch(() => [])
  if (results?.length > 0) {
    const result = results[0]
    applyOperationToJournal(opid, result)
    return result
  }
  const status = await rpc.call('z_getoperationstatus', [[opid]]).catch(() => [])
  if (status?.length > 0) {
    const result = status[0]
    applyOperationToJournal(opid, result)
    return result
  }
  return null
})

// ─── Tools ────────────────────────────────────────────────────────────────────
ipcMain.handle('tools:shieldCoinbase', async (_, fromAddress: string, toAddress: string, fee: number, limit: number) => {
  return rpc.call('z_shieldcoinbase', [fromAddress, toAddress, fee, limit ?? 0])
})

ipcMain.handle('tools:mergeToAddress', async (_, fromAddresses: string[], toAddress: string, fee: number, tLimit: number, zLimit: number) => {
  return rpc.call('z_mergetoaddress', [fromAddresses, toAddress, fee, tLimit, zLimit], true)
})

ipcMain.handle('tools:getWalletInfo', async () => {
  const info = await rpc.call('getwalletinfo')
  const [utxos, notes] = await Promise.all([
    rpc.call('listunspent', [0, 9999999]).then((u: any[]) => u.length).catch(() => 0),
    rpc.call('z_listunspent', [0]).then((u: any[]) => u.length).catch(() => 0),
  ])
  return { ...info, utxoCount: utxos, noteCount: notes }
})

// ─── Keys & Backup ────────────────────────────────────────────────────────────
ipcMain.handle(IPC.DUMP_PRIVKEY,         async (_, address: string) => rpc.call('dumpprivkey', [address]))
ipcMain.handle(IPC.Z_EXPORT_KEY,         async (_, address: string) => rpc.call('z_exportkey', [address]))
ipcMain.handle(IPC.Z_EXPORT_VIEWING_KEY, async (_, address: string) => rpc.call('z_exportviewingkey', [address]))
ipcMain.handle(IPC.IMPORT_PRIVKEY,       async (_, key: string, label: string, rescan: boolean) => {
  await rpc.call('importprivkey', [key, label, rescan], rescan)
  return { ok: true }
})
ipcMain.handle(IPC.Z_IMPORT_KEY,         async (_, key: string, rescan: string) => {
  await rpc.call('z_importkey', [key, rescan], rescan === 'yes')
  return { ok: true }
})
ipcMain.handle(IPC.Z_IMPORT_VIEWING_KEY, async (_, key: string, rescan: string) => {
  await rpc.call('z_importviewingkey', [key, rescan], rescan === 'yes')
  return { ok: true }
})
ipcMain.handle(IPC.BACKUP_WALLET, async (_, destination: string) => {
  await rpc.call('backupwallet', [destination])
  return { ok: true }
})

// Node capabilities
ipcMain.handle('node:capabilities', () => ({
  addressIndex: hasAddressIndex,
}))

// ─── Config ───────────────────────────────────────────────────────────────────
ipcMain.handle(IPC.GET_CONFIG, () => ConfigManager.load())
ipcMain.handle(IPC.SET_CONFIG, (_, config: { rpc: RPCConfig }) => {
  ConfigManager.save(config)
  rpc = new RpcClient(config.rpc)
  return { ok: true }
})
ipcMain.handle(IPC.OPEN_EXTERNAL, (_, url: string) => shell.openExternal(url))

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize() })
ipcMain.on('window:close', () => mainWindow?.close())
