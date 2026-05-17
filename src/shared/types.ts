// ─── RPC Config ────────────────────────────────────────────────────────────────

export interface RPCConfig {
  host: string
  port: number
  username: string
  password: string
}

export const DEFAULT_RPC_CONFIG: RPCConfig = {
  host: '127.0.0.1',
  port: 8545,
  username: 'zerc',
  password: '',
}

// ─── Wallet Data ────────────────────────────────────────────────────────────────

export interface WalletBalance {
  transparent: number
  private: number
  total: number
}

export interface ZercAddress {
  address: string
  type: 'transparent' | 'shielded'
  balance: number
  label?: string
}

export interface Transaction {
  txid: string
  amount: number
  fee?: number
  error?: string
  confirmations: number
  blocktime?: number
  address?: string
  fromAddress?: string | null
  toAddress?: string | null
  memo?: string
  type: 'send' | 'receive' | 'shielded'
  category: string
  isShielded?: boolean
}

export interface NodeInfo {
  version: string
  protocolversion: number
  blocks: number
  connections: number
  difficulty: number
  testnet: boolean
  syncing: boolean
  syncProgress?: number
}

export interface MarketPrice {
  symbol: 'ZERC'
  currency: 'USD'
  price: number | null
  source: 'explorer'
  updatedAt: string
  error?: string
}

export interface NodeHealth {
  checkedAt: string
  rpc: {
    ok: boolean
    host: string
    port: number
    error?: string
  }
  process: {
    available: boolean
    running: boolean
    startedByUs: boolean
    path: string | null
    platform: string
  }
  local: {
    version?: string
    protocolversion?: number
    blocks?: number
    headers?: number
    connections?: number
    difficulty?: number
    syncing?: boolean
    syncProgress?: number
  }
  explorer: {
    ok: boolean
    height?: number
    hash?: string
    time?: string
    error?: string
  }
  lagBlocks?: number
  addressIndex: boolean
}

export interface AddressEvent {
  txid: string
  kind: 'in' | 'out'
  value: number
  height?: number
  time?: string
}

export interface AddressDetails {
  address: string
  source: 'explorer' | 'local'
  balance: number
  receivedTotal?: number
  sentTotal?: number
  txCount?: number
  firstSeenTime?: string
  lastSeenTime?: string
  lastSeenHeight?: number
  events: AddressEvent[]
  error?: string
}

// ─── IPC Channels ─────────────────────────────────────────────────────────────

export const IPC = {
  // Node
  GET_NODE_INFO:          'wallet:getNodeInfo',
  GET_NODE_HEALTH:        'node:getHealth',
  // Wallet
  GET_BALANCE:            'wallet:getBalance',
  GET_ADDRESSES:          'wallet:getAddresses',
  GET_ADDRESS_DETAILS:    'wallet:getAddressDetails',
  GET_TRANSACTIONS:       'wallet:getTransactions',
  GET_MARKET_PRICE:       'wallet:getMarketPrice',
  NEW_ADDRESS:            'wallet:newAddress',
  ESTIMATE_FEE:           'wallet:estimateFee',
  SEND_TX:                'wallet:sendTransaction',
  // Keys & Backup
  DUMP_PRIVKEY:           'keys:dumpPrivkey',
  Z_EXPORT_KEY:           'keys:zExportKey',
  Z_EXPORT_VIEWING_KEY:   'keys:zExportViewingKey',
  IMPORT_PRIVKEY:         'keys:importPrivkey',
  Z_IMPORT_KEY:           'keys:zImportKey',
  Z_IMPORT_VIEWING_KEY:   'keys:zImportViewingKey',
  BACKUP_WALLET:          'keys:backupWallet',
  // Config
  GET_CONFIG:             'config:get',
  SET_CONFIG:             'config:set',
  // App
  OPEN_EXTERNAL:          'app:openExternal',
} as const

// ─── API Response types ────────────────────────────────────────────────────────

export interface RPCResponse<T = unknown> {
  result: T | null
  error: { code: number; message: string } | null
  id: string | number
}

export interface SendTxParams {
  fromAddress: string
  toAddress: string
  amount: number
  fee?: number
  memo?: string
}

export interface FeeEstimate {
  fee: number
  source: 'estimatefee' | 'fallback'
  blocks: number
  error?: string
}
