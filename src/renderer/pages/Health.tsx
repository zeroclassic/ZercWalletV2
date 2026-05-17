import React, { useEffect, useMemo, useState } from 'react'
import type { NodeHealth } from '@shared/types'

interface Props {
  onRefreshWallet: () => Promise<void>
}

export function Health({ onRefreshWallet }: Props) {
  const [health, setHealth] = useState<NodeHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checks, setChecks] = useState(0)

  async function refresh(showSpinner = true) {
    if (showSpinner) setLoading(true)
    setError('')
    try {
      setHealth(await window.zerc.getNodeHealth())
      setChecks(x => x + 1)
    } catch (err: any) {
      setError(err.message ?? 'Unable to load node health')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    const ready = Boolean(health?.rpc.ok && health?.explorer.ok)
    const delay = ready ? 30_000 : 3_000
    const interval = setInterval(() => refresh(false), delay)
    return () => clearInterval(interval)
  }, [health?.rpc.ok, health?.explorer.ok])

  useEffect(() => {
    if (!health?.rpc.ok && checks > 0) {
      setLoading(false)
    }
  }, [])

  const summary = useMemo(() => getSummary(health), [health])
  const rpcLabel = getRpcLabel(health, loading)
  const syncState = getSyncState(health)

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto', height: '100%' }} className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Node & Sync Health</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            Diagnose RPC, local node status, explorer height, and transaction indexing.
          </p>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            {health ? `Last check: ${new Date(health.checkedAt).toLocaleTimeString()}` : 'First check in progress'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={() => refresh()} disabled={loading} style={btnStyle('var(--accent-light)')}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button onClick={onRefreshWallet} style={btnStyle('var(--violet)')}>
            Refresh wallet
          </button>
        </div>
      </div>

      {error && <Notice color="var(--red)" text={error} />}

      <div style={{
        padding: '16px 18px',
        background: `${summary.color}12`,
        border: `1px solid ${summary.color}55`,
        borderRadius: 8,
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: summary.color, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          {summary.label}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {summary.detail}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
        <Metric title="RPC" value={rpcLabel.label} color={rpcLabel.color} />
        <Metric title="Local height" value={fmtInt(health?.local.blocks)} />
        <Metric title="Explorer height" value={fmtInt(health?.explorer.height)} color={health?.explorer.ok ? 'var(--text-primary)' : 'var(--gold)'} />
        <Metric title="Lag" value={health?.lagBlocks === undefined ? '-' : `${health.lagBlocks.toLocaleString()} blocks`} color={(health?.lagBlocks ?? 0) > 20 ? 'var(--gold)' : 'var(--green)'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, maxWidth: 980 }}>
        <Panel title="Connection">
          <Row label="RPC endpoint" value={health ? `${health.rpc.host}:${health.rpc.port}` : '-'} />
          <Row label="RPC status" value={rpcLabel.detail} color={rpcLabel.color} />
          <Row label="RPC error" value={health?.rpc.error ?? '-'} />
          <Row label="Peers" value={fmtInt(health?.local.connections)} />
          <Row label="Last check" value={health ? new Date(health.checkedAt).toLocaleString() : '-'} />
        </Panel>

        <Panel title="Node process">
          <Row label="zerod found" value={health?.process.available ? 'Yes' : 'No'} color={health?.process.available ? 'var(--green)' : 'var(--gold)'} />
          <Row label="Process running" value={health?.process.running ? 'Yes' : 'No'} color={health?.process.running ? 'var(--green)' : 'var(--red)'} />
          <Row label="Started by wallet" value={health?.process.startedByUs ? 'Yes' : 'No'} />
          <Row label="Platform" value={health?.process.platform ?? '-'} />
          <Row label="Path" value={health?.process.path ?? '-'} mono />
        </Panel>

        <Panel title="Synchronization">
          <Row label="Local blocks" value={fmtInt(health?.local.blocks)} />
          <Row label="Local headers" value={fmtInt(health?.local.headers)} />
          <Row label="Explorer blocks" value={fmtInt(health?.explorer.height)} />
          <Row label="Sync progress" value={health?.local.syncProgress === undefined ? '-' : `${Math.round(health.local.syncProgress * 100)}%`} />
          <Row label="Sync state" value={syncState.label} color={syncState.color} />
        </Panel>

        <Panel title="Indexing & explorer">
          <Row label="Address index" value={health?.addressIndex ? 'Enabled' : 'Standard mode'} color={health?.addressIndex ? 'var(--green)' : 'var(--gold)'} />
          <Row label="Explorer API" value={health?.explorer.ok ? 'Available' : 'Unavailable'} color={health?.explorer.ok ? 'var(--green)' : 'var(--red)'} />
          <Row label="Explorer error" value={health?.explorer.error ?? '-'} />
          <Row label="Explorer hash" value={health?.explorer.hash ?? '-'} mono />
          <Row label="Explorer time" value={health?.explorer.time ?? '-'} />
        </Panel>
      </div>
    </div>
  )
}

function getSummary(health: NodeHealth | null) {
  if (!health) return { label: 'Checking', detail: 'Loading current node diagnostics.', color: 'var(--accent-light)' }
  if (!health.rpc.ok && health.process.running) return { label: 'Starting node', detail: 'zerod is running, but RPC is not ready yet. This is normal just after startup; the wallet will retry automatically.', color: 'var(--gold)' }
  if (!health.rpc.ok && health.process.available) return { label: 'Waiting for RPC', detail: 'zerod was found, but the wallet cannot reach RPC yet. Start the node or wait for it to finish initializing.', color: 'var(--gold)' }
  if (!health.rpc.ok) return { label: 'Action needed', detail: 'The wallet cannot reach the local RPC node and zerod was not found automatically. Check the executable path and RPC settings.', color: 'var(--red)' }
  if (!health.explorer.ok) return { label: 'Local mode', detail: 'The local node is reachable, but the explorer API is unavailable. Wallet data can still load from RPC, with less external validation.', color: 'var(--gold)' }
  if ((health.lagBlocks ?? 0) > 20) return { label: 'Syncing', detail: `Your node is ${health.lagBlocks?.toLocaleString()} blocks behind the explorer. Transactions may appear late until sync catches up.`, color: 'var(--gold)' }
  return { label: 'Healthy', detail: 'RPC is connected, the explorer is reachable, and the local chain height is aligned.', color: 'var(--green)' }
}

function getRpcLabel(health: NodeHealth | null, loading: boolean) {
  if (!health) return { label: loading ? 'Checking' : 'Unknown', detail: 'Checking RPC', color: 'var(--accent-light)' }
  if (health.rpc.ok) return { label: 'Online', detail: 'Connected', color: 'var(--green)' }
  if (health.process.running) return { label: 'Starting', detail: 'Waiting for RPC', color: 'var(--gold)' }
  if (health.process.available) return { label: 'Waiting', detail: 'Node available, RPC offline', color: 'var(--gold)' }
  return { label: 'Offline', detail: 'Disconnected', color: 'var(--red)' }
}

function getSyncState(health: NodeHealth | null) {
  if (!health) return { label: 'Checking', color: 'var(--accent-light)' }
  if (!health.rpc.ok) return { label: health.process.running ? 'Waiting for RPC' : 'Unavailable', color: health.process.running ? 'var(--gold)' : 'var(--red)' }
  if (health.local.syncing) return { label: 'Syncing', color: 'var(--gold)' }
  if ((health.lagBlocks ?? 0) > 20) return { label: 'Behind explorer', color: 'var(--gold)' }
  return { label: 'Up to date', color: 'var(--green)' }
}

function Notice({ color, text }: { color: string; text: string }) {
  return <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: `${color}14`, border: `1px solid ${color}44`, color, fontSize: 12, fontFamily: 'var(--font-mono)' }}>{text}</div>
}

function Metric({ title, value, color }: { title: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '14px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px' }}>
      <h2 style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 14px', fontWeight: 700 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{children}</div>
    </section>
  )
}

function Row({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 10, alignItems: 'start' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 11, color: color ?? 'var(--text-secondary)', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)', wordBreak: 'break-all', lineHeight: 1.5 }}>{value}</span>
    </div>
  )
}

function fmtInt(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : '-'
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '9px 16px',
    background: `${color}14`,
    border: `1px solid ${color}44`,
    borderRadius: 8,
    color,
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    fontWeight: 700,
  }
}
