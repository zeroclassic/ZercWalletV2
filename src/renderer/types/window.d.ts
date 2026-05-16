import type { WalletBalance, ZercAddress, Transaction, NodeInfo, RPCConfig, SendTxParams } from '@shared/types'

declare module '*.png' {
  const src: string
  export default src
}

declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}

declare global {
  const __APP_VERSION__: string
  const __TARGET_NODE__: string

  interface Window {
    zerc: {
      // Node
      getNodeInfo: () => Promise<NodeInfo>
      // Wallet
      getBalance: () => Promise<WalletBalance>
      getAddresses: () => Promise<ZercAddress[]>
      getTransactions: () => Promise<Transaction[]>
      newAddress: (type: 'transparent' | 'shielded') => Promise<string>
      sendTransaction: (params: SendTxParams) => Promise<{ txid?: string; opid?: string; type: string }>
      // Keys & Backup
      dumpPrivkey: (address: string) => Promise<string>
      zExportKey: (address: string) => Promise<string>
      zExportViewingKey: (address: string) => Promise<string>
      importPrivkey: (key: string, label: string, rescan: boolean) => Promise<{ ok: boolean }>
      zImportKey: (key: string, rescan: string) => Promise<{ ok: boolean }>
      zImportViewingKey: (key: string, rescan: string) => Promise<{ ok: boolean }>
      backupWallet: (destination: string) => Promise<{ ok: boolean }>
      // Config
      getConfig: () => Promise<{ rpc: RPCConfig }>
      setConfig: (config: { rpc: RPCConfig }) => Promise<{ ok: boolean }>
      // Misc
      openExternal: (url: string) => Promise<void>
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}

export {}
