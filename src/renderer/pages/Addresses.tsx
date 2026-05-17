import React, { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { AddressDetails, ZercAddress } from '@shared/types'

interface Props {
  addresses: ZercAddress[]
  onRefresh: () => Promise<void>
  onNavigate: (page: 'receive' | 'send') => void
}

const LABELS_KEY = 'zerc-wallet.address-labels.v1'
const EXPLORER_ADDRESS_URL = 'https://explorer.zeroclassic.org/address/'

export function Addresses({ addresses, onRefresh, onNavigate }: Props) {
  const [creating, setCreating] = useState(false)
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null)
  const [selectedAddress, setSelectedAddress] = useState(addresses[0]?.address ?? '')
  const [details, setDetails] = useState<AddressDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [labels, setLabels] = useState<Record<string, string>>(() => loadLabels())

  const selected = useMemo(
    () => addresses.find(a => a.address === selectedAddress) ?? addresses[0] ?? null,
    [addresses, selectedAddress]
  )
  const tAddrs = addresses.filter(a => a.type === 'transparent')
  const zAddrs = addresses.filter(a => a.type === 'shielded')

  useEffect(() => {
    if (!selectedAddress && addresses[0]) setSelectedAddress(addresses[0].address)
  }, [addresses, selectedAddress])

  useEffect(() => {
    if (!selected) {
      setDetails(null)
      return
    }
    let cancelled = false
    setDetailsLoading(true)
    window.zerc.getAddressDetails(selected.address)
      .then(d => { if (!cancelled) setDetails(d) })
      .catch(err => {
        if (!cancelled) setDetails({
          address: selected.address,
          source: 'local',
          balance: selected.balance,
          events: [],
          error: err.message ?? 'Unable to load address details',
        })
      })
      .finally(() => { if (!cancelled) setDetailsLoading(false) })
    return () => { cancelled = true }
  }, [selected?.address])

  function saveLabel(address: string, value: string) {
    const next = { ...labels, [address]: value.trim() }
    if (!next[address]) delete next[address]
    setLabels(next)
    localStorage.setItem(LABELS_KEY, JSON.stringify(next))
  }

  async function createAddress(type: 'transparent' | 'shielded') {
    setCreating(true)
    try {
      await window.zerc.newAddress(type)
      await onRefresh()
    } finally {
      setCreating(false)
    }
  }

  function copyAddr(addr: string) {
    navigator.clipboard.writeText(addr)
    setCopiedAddr(addr)
    setTimeout(() => setCopiedAddr(null), 1800)
  }

  function openExplorer(addr: string) {
    window.zerc.openExternal(EXPLORER_ADDRESS_URL + addr)
  }

  return (
    <div style={{ padding: '28px 32px', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }} className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Addresses</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {addresses.length} addresses - {tAddrs.length} transparent - {zAddrs.length} shielded
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ActionButton label="+ T-addr" color="var(--accent-light)" disabled={creating} onClick={() => createAddress('transparent')} />
          <ActionButton label="+ Z-addr" color="var(--violet)" disabled={creating} onClick={() => createAddress('shielded')} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(420px, 1.35fr)', gap: 18, minHeight: 0, flex: 1 }}>
        <div style={{ overflowY: 'auto', paddingRight: 4 }}>
          <AddressSection title="Transparent" color="var(--accent-light)" addrs={tAddrs} labels={labels} selected={selectedAddress} onSelect={setSelectedAddress} />
          <div style={{ height: 18 }} />
          <AddressSection title="Shielded" color="var(--violet)" addrs={zAddrs} labels={labels} selected={selectedAddress} onSelect={setSelectedAddress} />
        </div>

        <AddressDetail
          address={selected}
          label={selected ? labels[selected.address] ?? '' : ''}
          details={details}
          loading={detailsLoading}
          copied={selected ? copiedAddr === selected.address : false}
          onLabelChange={saveLabel}
          onCopy={copyAddr}
          onExplorer={openExplorer}
          onSend={() => onNavigate('send')}
          onReceive={() => onNavigate('receive')}
        />
      </div>
    </div>
  )
}

function AddressSection({ title, color, addrs, labels, selected, onSelect }: {
  title: string
  color: string
  addrs: ZercAddress[]
  labels: Record<string, string>
  selected: string
  onSelect: (address: string) => void
}) {
  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</h2>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{addrs.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {addrs.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
            No {title.toLowerCase()} address.
          </div>
        ) : addrs.map(addr => (
          <button
            key={addr.address}
            onClick={() => onSelect(addr.address)}
            style={{
              textAlign: 'left',
              padding: '11px 12px',
              borderRadius: 8,
              border: `1px solid ${selected === addr.address ? color + '88' : 'var(--border)'}`,
              background: selected === addr.address ? `${color}12` : 'var(--bg-surface)',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {addr.address}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: addr.balance > 0 ? 'var(--text-primary)' : 'var(--text-muted)', flexShrink: 0 }}>
                {addr.balance.toFixed(8)}
              </span>
            </div>
            {labels[addr.address] && (
              <div style={{ marginTop: 5, fontSize: 11, color }}>
                {labels[addr.address]}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

function AddressDetail({ address, label, details, loading, copied, onLabelChange, onCopy, onExplorer, onSend, onReceive }: {
  address: ZercAddress | null
  label: string
  details: AddressDetails | null
  loading: boolean
  copied: boolean
  onLabelChange: (address: string, value: string) => void
  onCopy: (address: string) => void
  onExplorer: (address: string) => void
  onSend: () => void
  onReceive: () => void
}) {
  const [draftLabel, setDraftLabel] = useState(label)

  useEffect(() => setDraftLabel(label), [label, address?.address])

  if (!address) {
    return (
      <div style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Select an address
      </div>
    )
  }

  const color = address.type === 'shielded' ? 'var(--violet)' : 'var(--accent-light)'
  const balance = details?.balance ?? address.balance

  return (
    <section style={{ overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 18 }}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginBottom: 18 }}>
        <div style={{ background: '#fff', padding: 10, borderRadius: 8, display: 'inline-flex', flexShrink: 0 }}>
          <QRCodeSVG value={address.address} size={126} level="M" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            {address.type === 'shielded' ? 'Shielded address' : 'Transparent address'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all', lineHeight: 1.6 }} className="selectable">
            {address.address}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <ActionButton label={copied ? 'Copied' : 'Copy'} color="var(--accent-light)" onClick={() => onCopy(address.address)} />
            <ActionButton label="Receive" color="var(--violet)" onClick={onReceive} />
            <ActionButton label="Send" color="var(--green)" onClick={onSend} />
            {address.type === 'transparent' && <ActionButton label="Explorer" color="var(--text-muted)" onClick={() => onExplorer(address.address)} />}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 18 }}>
        <input
          value={draftLabel}
          onChange={e => setDraftLabel(e.target.value)}
          placeholder="Address label, e.g. Mining, Exchange, Cold wallet"
          style={inputStyle}
          className="selectable"
        />
        <ActionButton label="Save label" color={color} onClick={() => onLabelChange(address.address, draftLabel)} />
      </div>

      {details?.error && (
        <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'var(--red-glow)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)', fontSize: 12 }}>
          {details.error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 18 }}>
        <Stat label="Balance" value={`${balance.toFixed(8)} ZERC`} color={color} />
        <Stat label="Received" value={fmtAmount(details?.receivedTotal)} />
        <Stat label="Sent" value={fmtAmount(details?.sentTotal)} />
        <Stat label="Tx count" value={details?.txCount === undefined ? '-' : String(details.txCount)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        <InfoRow label="First seen" value={formatDate(details?.firstSeenTime)} />
        <InfoRow label="Last used" value={formatDate(details?.lastSeenTime)} />
        <InfoRow label="Last height" value={details?.lastSeenHeight === undefined ? '-' : details.lastSeenHeight.toLocaleString()} />
        <InfoRow label="Source" value={loading ? 'Loading...' : details?.source ?? 'local'} />
      </div>

      <h3 style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Recent address history
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <Empty text="Loading address history..." />
        ) : !details?.events.length ? (
          <Empty text={address.type === 'shielded' ? 'Shielded history is private and only available through local wallet transactions.' : 'No explorer history available.'} />
        ) : details.events.slice(0, 20).map(event => (
          <div key={`${event.txid}-${event.kind}-${event.value}`} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
              <span style={{ color: event.kind === 'in' ? 'var(--green)' : 'var(--red)', fontSize: 12, fontWeight: 700 }}>
                {event.kind === 'in' ? 'Received' : 'Sent'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: event.kind === 'in' ? 'var(--green)' : 'var(--red)' }}>
                {event.kind === 'in' ? '+' : '-'}{event.value.toFixed(8)} ZERC
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {event.txid}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                {formatDate(event.time)} {event.height ? `- #${event.height.toLocaleString()}` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ActionButton({ label, color, disabled, onClick }: { label: string; color: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: '8px 13px', background: `${color}14`, border: `1px solid ${color}44`, borderRadius: 8, color, cursor: disabled ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-ui)', opacity: disabled ? 0.6 : 1 }}>
      {label}
    </button>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: color ?? 'var(--text-secondary)', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 22, border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>{text}</div>
}

function loadLabels(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LABELS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function fmtAmount(value: number | undefined) {
  return value === undefined ? '-' : `${value.toFixed(8)} ZERC`
}

function formatDate(value: string | undefined) {
  return value ? new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toLocaleString() : '-'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'var(--font-ui)',
  fontSize: 12,
}
