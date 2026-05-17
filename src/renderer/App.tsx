import React, { useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar, type Page } from './components/Sidebar'
import { LoadingScreen } from './components/LoadingScreen'
import { ErrorScreen } from './components/ErrorScreen'
import { Dashboard } from './pages/Dashboard'
import { Send } from './pages/Send'
import { Receive } from './pages/Receive'
import { Transactions } from './pages/Transactions'
import { Addresses } from './pages/Addresses'
import { Contacts } from './pages/Contacts'
import { Settings } from './pages/Settings'
import { Keys } from './pages/Keys'
import { Tools } from './pages/Tools'
import { Health } from './pages/Health'
import { useWallet } from './hooks/useWallet'

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem('zerc-wallet.privacy-mode') === '1')
  const wallet = useWallet()

  const navigate = (p: Page) => setPage(p)
  const togglePrivacy = () => {
    setPrivacyMode(value => {
      const next = !value
      localStorage.setItem('zerc-wallet.privacy-mode', next ? '1' : '0')
      return next
    })
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
      background: 'var(--bg-base)',
    }}>
      {/* Custom title bar (drag region + status + window controls) */}
      <TitleBar status={wallet.status} />

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar — always visible even on error so user can go to Settings */}
        <Sidebar
          current={page}
          onNavigate={navigate}
          nodeInfo={wallet.nodeInfo}
        />

        {/* Content area */}
        <main style={{
          flex: 1, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)',
        }}>
          {/* Loading state */}
          {wallet.loading && page !== 'settings' && page !== 'health' && page !== 'contacts' && (
            <LoadingScreen />
          )}

          {/* Error state — but still allow Settings */}
          {!wallet.loading && wallet.status === 'error' && page !== 'settings' && page !== 'health' && page !== 'contacts' && (
            <ErrorScreen
              message={wallet.errorMsg ?? 'Unknown error'}
              onRetry={wallet.refresh}
              onSettings={() => navigate('settings')}
            />
          )}

          {/* Normal pages — render when connected OR on settings */}
          {(!wallet.loading && (wallet.status === 'connected' || page === 'settings' || page === 'health' || page === 'contacts')) && (
            <>
              {page === 'dashboard' && (
                <Dashboard
                  balance={wallet.balance}
                  transactions={wallet.transactions}
                  nodeInfo={wallet.nodeInfo}
                  privacyMode={privacyMode}
                  onTogglePrivacy={togglePrivacy}
                  onNavigate={p => navigate(p as Page)}
                />
              )}
              {page === 'send' && (
                <Send
                  addresses={wallet.addresses}
                  balance={wallet.balance}
                  onRefresh={wallet.refresh}
                />
              )}
              {page === 'receive' && (
                <Receive
                  addresses={wallet.addresses}
                  onRefresh={wallet.refresh}
                />
              )}
              {page === 'transactions' && (
                <Transactions
                  transactions={wallet.transactions}
                  privacyMode={privacyMode}
                />
              )}
              {page === 'addresses' && (
                <Addresses
                  addresses={wallet.addresses}
                  onRefresh={wallet.refresh}
                  onNavigate={p => navigate(p as Page)}
                />
              )}
              {page === 'contacts' && (
                <Contacts onNavigate={p => navigate(p as Page)} />
              )}
              {page === 'keys' && (
                <Keys
                  addresses={wallet.addresses}
                  onRefresh={wallet.refresh}
                />
              )}
              {page === 'tools' && (
                <Tools
                  addresses={wallet.addresses}
                  onRefresh={wallet.refresh}
                />
              )}
              {page === 'health' && (
                <Health onRefreshWallet={wallet.refresh} />
              )}
              {page === 'settings' && (
                <Settings onRefresh={wallet.refresh} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
