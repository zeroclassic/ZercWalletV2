import type { WalletBalance, ZercAddress, Transaction, NodeInfo, NodeHealth, AddressDetails, RPCConfig, SendTxParams, FeeEstimate, MarketPrice } from '@shared/types'

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
      getNodeHealth: () => Promise<NodeHealth>
      // Wallet
      getBalance: () => Promise<WalletBalance>
      getAddresses: () => Promise<ZercAddress[]>
      getAddressDetails: (address: string) => Promise<AddressDetails>
      getTransactions: () => Promise<Transaction[]>
      getMarketPrice: () => Promise<MarketPrice>
      newAddress: (type: 'transparent' | 'shielded') => Promise<string>
      estimateFee: (blocks?: number) => Promise<FeeEstimate>
      sendTransaction: (params: SendTxParams) => Promise<{ txid?: string; opid?: string; type: string }>
      getOperationStatus: (opid: string) => Promise<any>
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
