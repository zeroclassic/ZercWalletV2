import React, { useEffect, useState } from 'react'
import type { ZercAddress, WalletBalance } from '@shared/types'
import { type Contact, loadContacts, makeContact, saveContacts, shortAddress } from '../lib/contacts'

interface Props {
  addresses: ZercAddress[]
  balance: WalletBalance | null
  onRefresh: () => Promise<void>
}

type SendStatus = 'idle' | 'confirming' | 'sending' | 'waiting' | 'success' | 'error'

const FALLBACK_FEE = 0.0001
const ZATOSHIS = 100_000_000

export function Send({ addresses, onRefresh }: Props) {
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [status, setStatus] = useState<SendStatus>('idle')
  const [resultTxid, setResultTxid] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [opStatus, setOpStatus] = useState('')
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts())
  const [saveRecipient, setSaveRecipient] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [estimatedFee, setEstimatedFee] = useState(FALLBACK_FEE)
  const [feeSource, setFeeSource] = useState<'estimatefee' | 'fallback'>('fallback')
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeError, setFeeError] = useState('')

  const selected = addresses.find(a => a.address === fromAddress)
  const parsedAmount = parseAmount(amount)
  const validationErrors = validateSend(selected, toAddress, parsedAmount, estimatedFee)
  const isShielded = fromAddress.startsWith('z') || toAddress.startsWith('z')
  const feeUnits = toUnits(estimatedFee)
  const amountUnits = toUnits(parsedAmount)
  const balanceUnits = selected ? toUnits(selected.balance) : 0
  const totalUnits = amountUnits + feeUnits
  const remainingUnits = selected ? balanceUnits - totalUnits : 0
  const maxSpendable = selected ? fromUnits(Math.max(0, balanceUnits - feeUnits)) : 0
  const trimmedRecipient = toAddress.trim()
  const knownRecipient = contacts.find(c => c.address === trimmedRecipient)
  const canSaveRecipient = isLikelyAddress(toAddress) && !knownRecipient

  useEffect(() => {
    const applyPendingRecipient = () => {
      const pending = localStorage.getItem('zerc-wallet.pending-recipient')
      if (!pending) return
      setToAddress(pending)
      localStorage.removeItem('zerc-wallet.pending-recipient')
    }
    const refreshContacts = () => setContacts(loadContacts())

    applyPendingRecipient()
    window.addEventListener('zerc:contacts-updated', refreshContacts)
    window.addEventListener('storage', refreshContacts)
    return () => {
      window.removeEventListener('zerc:contacts-updated', refreshContacts)
      window.removeEventListener('storage', refreshContacts)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!fromAddress) {
      setEstimatedFee(FALLBACK_FEE)
      setFeeSource('fallback')
      setFeeError('')
      setFeeLoading(false)
      return
    }

    setFeeLoading(true)
    window.zerc.estimateFee(6)
      .then(result => {
        if (cancelled) return
        setEstimatedFee(result.fee)
        setFeeSource(result.source)
        setFeeError(result.error ?? '')
      })
      .catch(err => {
        if (cancelled) return
        setEstimatedFee(FALLBACK_FEE)
        setFeeSource('fallback')
        setFeeError(err?.message ?? 'estimatefee unavailable')
      })
      .finally(() => {
        if (!cancelled) setFeeLoading(false)
      })

    return () => { cancelled = true }
  }, [fromAddress])

  async function pollOpStatus(opid: string) {
    setStatus('waiting')
    setOpStatus('Submitted to node')
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const res = await window.zerc.getOperationStatus(opid)
        if (!res) continue
        if (res.status === 'success') {
          setResultTxid(res.result?.txid ?? opid)
          setStatus('success')
          await onRefresh()
          return
        }
        if (res.status === 'failed') {
          setErrMsg(res.error?.message ?? JSON.stringify(res.error) ?? 'Operation failed')
          setStatus('error')
          return
        }
        setOpStatus(`Node status: ${res.status}`)
      } catch {
        setOpStatus('Waiting for operation status')
      }
    }
    setResultTxid(opid)
    setStatus('success')
  }

  function reviewTransaction() {
    setErrMsg('')
    if (validationErrors.length > 0) {
      setErrMsg(validationErrors[0])
      setStatus('error')
      return
    }
    setStatus('confirming')
  }

  async function handleSend() {
    if (validationErrors.length > 0) {
      setErrMsg(validationErrors[0])
      setStatus('error')
      return
    }
    setStatus('sending')
    setErrMsg('')
    setOpStatus('')
    try {
      const result = await window.zerc.sendTransaction({
        fromAddress,
        toAddress: toAddress.trim(),
        amount: parsedAmount,
        fee: estimatedFee,
        memo: memo || undefined,
      })
      const opid = result.txid ?? result.opid ?? ''
      setResultTxid(opid)
      maybeSaveRecipient()
      await pollOpStatus(opid)
    } catch (err: any) {
      setErrMsg(err.message)
      setStatus('error')
    }
  }

  function reset() {
    setFromAddress('')
    setToAddress('')
    setAmount('')
    setMemo('')
    setStatus('idle')
    setResultTxid('')
    setErrMsg('')
    setOpStatus('')
    setSaveRecipient(false)
    setNewContactName('')
  }

  function maybeSaveRecipient() {
    const address = toAddress.trim()
    const name = newContactName.trim()
    if (!saveRecipient || !name || !isLikelyAddress(address) || contacts.some(c => c.address === address)) return

    const next = [...contacts, makeContact({ name, address, note: '', favorite: false })]
    setContacts(next)
    saveContacts(next)
    setSaveRecipient(false)
    setNewContactName('')
  }

  if (status === 'success') {
    return (
      <Centered>
        <div style={{ fontSize: 48, marginBottom: 16, color: 'var(--green)' }}>OK</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>Transaction submitted</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 18, textAlign: 'center' }}>
          The node accepted the operation and returned a transaction id or operation id.
        </p>
        <IdBox label="Transaction / operation id" value={resultTxid} />
        <button onClick={reset} style={btnStyle('var(--accent-light)')}>Send another</button>
      </Centered>
    )
  }

  if (status === 'waiting' || status === 'sending') {
    return (
      <Centered>
        <Spinner />
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          {status === 'sending' ? 'Submitting transaction' : 'Processing transaction'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
          Shielded operations can take time. Keep the wallet open while the node reports status.
        </p>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '8px 14px', borderRadius: 8 }}>
          {opStatus || 'Submitting to node'}
        </div>
        {resultTxid && <IdBox label="Operation id" value={resultTxid} />}
      </Centered>
    )
  }

  if (status === 'confirming' && selected) {
    return (
      <div style={{ padding: '28px 32px', overflowY: 'auto', height: '100%' }} className="animate-fadeIn">
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Confirm transaction</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
          Review every field carefully before broadcasting.
        </p>
        <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Warning text="Transactions are irreversible once accepted by the node. Verify the recipient address and amount." />
          <ConfirmPanel>
            <ConfirmRow label="Type" value={isShielded ? 'Shielded operation' : 'Transparent operation'} />
            <ConfirmRow label="From" value={fromAddress} mono />
            <ConfirmRow label="To" value={toAddress.trim()} mono />
            {knownRecipient && <ConfirmRow label="Contact" value={knownRecipient.name} />}
            <ConfirmRow label="Amount" value={`${fmtZerc(parsedAmount)} ZERC`} accent="var(--accent-light)" />
            <ConfirmRow label="Network fee" value={`${fmtZerc(estimatedFee)} ZERC (${feeSource})`} />
            <ConfirmRow label="Total required" value={`${fmtZerc(fromUnits(totalUnits))} ZERC`} accent="var(--gold)" />
            <ConfirmRow label="Remaining" value={`${fmtZerc(fromUnits(Math.max(0, remainingUnits)))} ZERC`} />
            {memo && <ConfirmRow label="Memo" value={memo} />}
          </ConfirmPanel>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={handleSend} style={btnStyle('var(--green)')}>Broadcast transaction</button>
            <button onClick={() => setStatus('idle')} style={btnStyle('var(--text-muted)')}>Back to edit</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto', height: '100%' }} className="animate-fadeIn">
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Send ZERC</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 28 }}>
        Validate and review transaction details before broadcasting.
      </p>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Field label="From address">
          <select value={fromAddress} onChange={e => setFromAddress(e.target.value)} style={selectStyle}>
            <option value="">Select an address...</option>
            {addresses.map(a => (
              <option key={a.address} value={a.address}>
                [{a.type === 'shielded' ? 'z' : 't'}] {a.address.slice(0, 20)}...{a.address.slice(-10)} - {fmtZerc(a.balance)} ZERC
              </option>
            ))}
          </select>
          {selected && <Hint>Available: <Mono>{fmtZerc(selected.balance)} ZERC</Mono> - max after fee: <Mono>{fmtZerc(maxSpendable)} ZERC</Mono></Hint>}
          {selected && (
            <Hint>
              Fee: <Mono>{feeLoading ? 'estimating...' : `${fmtZerc(estimatedFee)} ZERC`}</Mono>
              {' '}({feeSource}{feeError ? `: ${feeError}` : ''})
            </Hint>
          )}
        </Field>

        <Field label="Recipient address">
          {contacts.length > 0 && (
            <select
              value=""
              onChange={e => {
                if (e.target.value) setToAddress(e.target.value)
              }}
              style={{ ...selectStyle, marginBottom: 8 }}
            >
              <option value="">Choose saved contact...</option>
              {contacts.map(contact => (
                <option key={contact.id} value={contact.address}>
                  {contact.favorite ? '* ' : ''}{contact.name} - {shortAddress(contact.address)}
                </option>
              ))}
            </select>
          )}
          <input value={toAddress} onChange={e => setToAddress(e.target.value)} placeholder="t1... or z..." style={inputStyle} className="selectable" />
          {knownRecipient && <Hint>Saved contact: <Mono>{knownRecipient.name}</Mono></Hint>}
          {canSaveRecipient && (
            <div style={{ marginTop: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={saveRecipient} onChange={e => setSaveRecipient(e.target.checked)} />
                Save recipient as contact
              </label>
              {saveRecipient && (
                <input
                  value={newContactName}
                  onChange={e => setNewContactName(e.target.value)}
                  placeholder="Contact name"
                  style={{ ...inputStyle, marginTop: 10, fontFamily: 'var(--font-ui)' }}
                />
              )}
            </div>
          )}
        </Field>

        <Field label="Amount (ZERC)">
          <div style={{ position: 'relative' }}>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(',', '.'))} placeholder="0.00000000" style={{ ...inputStyle, paddingRight: 80 }} className="selectable" />
            {selected && (
              <button
                onClick={() => setAmount(fmtZerc(maxSpendable))}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--accent-light)', fontFamily: 'var(--font-ui)', letterSpacing: '0.06em' }}
              >
                MAX
              </button>
            )}
          </div>
          {selected && amount && (
            <Hint>After network fee: <Mono>{fmtZerc(fromUnits(Math.max(0, remainingUnits)))} ZERC remaining</Mono></Hint>
          )}
        </Field>

        {isShielded && (
          <Field label="Memo (optional - shielded only)">
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="Encrypted message..." style={inputStyle} className="selectable" />
          </Field>
        )}

        {status === 'error' && <ErrorBox text={errMsg} />}
        {validationErrors.length > 0 && status !== 'error' && <Warning text={validationErrors[0]} />}

        <button
          onClick={reviewTransaction}
          disabled={!fromAddress || !toAddress || !amount || validationErrors.length > 0}
          style={{
            ...btnStyle('var(--accent-light)'),
            opacity: (!fromAddress || !toAddress || !amount || validationErrors.length > 0) ? 0.5 : 1,
            cursor: (!fromAddress || !toAddress || !amount || validationErrors.length > 0) ? 'not-allowed' : 'pointer',
          }}
        >
          Review transaction
        </button>
      </div>
    </div>
  )
}

function parseAmount(value: string) {
  const parsed = parseFloat(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function toUnits(value: number) {
  return Math.round(value * ZATOSHIS)
}

function fromUnits(value: number) {
  return value / ZATOSHIS
}

function fmtZerc(value: number) {
  return fromUnits(toUnits(value)).toFixed(8)
}

function isLikelyAddress(value: string) {
  const trimmed = value.trim()
  return /^t[a-zA-Z0-9]{25,}$/.test(trimmed) || /^z[a-zA-Z0-9]{25,}$/.test(trimmed)
}

function validateSend(selected: ZercAddress | undefined, toAddress: string, amount: number, fee: number) {
  const errors: string[] = []
  if (!selected) errors.push('Select a source address.')
  if (!toAddress.trim()) errors.push('Enter a recipient address.')
  else if (!isLikelyAddress(toAddress)) errors.push('Recipient address format looks invalid.')
  if (!amount || amount <= 0) errors.push('Enter an amount greater than zero.')
  if (selected && toUnits(amount) + toUnits(fee) > toUnits(selected.balance)) {
    errors.push(`Insufficient balance for amount plus ${fmtZerc(fee)} ZERC network fee.`)
  }
  return errors
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }} className="animate-fadeIn">{children}</div>
}

function Spinner() {
  return <div style={{ width: 56, height: 56, borderRadius: '50%', border: '3px solid rgba(107,79,216,0.2)', borderTop: '3px solid var(--accent-light)', animation: 'spin 1s linear infinite', marginBottom: 24 }} />
}

function IdBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ width: '100%', maxWidth: 480, margin: '16px 0 24px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-light)', background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, wordBreak: 'break-all' }} className="selectable">{value}</div>
    </div>
  )
}

function ConfirmPanel({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
}

function ConfirmRow({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 12, color: accent ?? 'var(--text-secondary)', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)', wordBreak: 'break-all', lineHeight: 1.5 }} className="selectable">{value}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>{children}</div>
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{children}</span>
}

function Warning({ text }: { text: string }) {
  return <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', color: 'var(--gold)', fontSize: 12 }}>{text}</div>
}

function ErrorBox({ text }: { text: string }) {
  return <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--red-glow)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{text}</div>
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  transition: 'border-color var(--t-fast)',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\'%3E%3Cpath fill=\'%235a4d7a\' d=\'M7 10l5 5 5-5z\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 36,
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '12px 24px',
    background: `${color}22`,
    border: `1px solid ${color}60`,
    borderRadius: 8,
    cursor: 'pointer',
    color,
    fontFamily: 'var(--font-ui)',
    fontWeight: 600,
    fontSize: 14,
    letterSpacing: '0.04em',
    transition: 'all var(--t-fast)',
    alignSelf: 'flex-start',
  }
}
