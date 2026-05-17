import React, { useMemo, useState } from 'react'
import { Contact, isLikelyZercAddress, loadContacts, makeContact, saveContacts, shortAddress } from '../lib/contacts'

interface Props {
  onNavigate: (page: 'send') => void
}

const emptyForm = { name: '', address: '', note: '', favorite: false }

export function Contacts({ onNavigate }: Props) {
  const [contacts, setContacts] = useState<Contact[]>(() => sortContacts(loadContacts()))
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q)
      || c.address.toLowerCase().includes(q)
      || c.note.toLowerCase().includes(q)
    )
  }, [contacts, search])

  function persist(next: Contact[]) {
    const sorted = sortContacts(next)
    setContacts(sorted)
    saveContacts(sorted)
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
  }

  function submit() {
    const name = form.name.trim()
    const address = form.address.trim()
    const note = form.note.trim()
    if (!name) {
      setError('Contact name is required.')
      return
    }
    if (!isLikelyZercAddress(address)) {
      setError('Address format looks invalid.')
      return
    }
    const duplicate = contacts.find(c => c.address === address && c.id !== editingId)
    if (duplicate) {
      setError(`This address is already saved as ${duplicate.name}.`)
      return
    }
    if (editingId) {
      persist(contacts.map(c => c.id === editingId ? { ...c, name, address, note, favorite: form.favorite, updatedAt: Date.now() } : c))
    } else {
      persist([...contacts, makeContact({ name, address, note, favorite: form.favorite })])
    }
    resetForm()
  }

  function edit(contact: Contact) {
    setEditingId(contact.id)
    setForm({ name: contact.name, address: contact.address, note: contact.note, favorite: contact.favorite })
    setError('')
  }

  function remove(id: string) {
    persist(contacts.filter(c => c.id !== id))
    if (editingId === id) resetForm()
  }

  function toggleFavorite(contact: Contact) {
    persist(contacts.map(c => c.id === contact.id ? { ...c, favorite: !c.favorite, updatedAt: Date.now() } : c))
  }

  function copy(address: string) {
    navigator.clipboard.writeText(address)
    setCopied(address)
    setTimeout(() => setCopied(''), 1600)
  }

  return (
    <div style={{ padding: '28px 32px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Contacts</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Save recipient addresses locally and reuse them from the Send screen.
          </p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts..."
          style={{ ...inputStyle, width: 240 }}
          className="selectable"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.85fr) minmax(420px, 1.3fr)', gap: 18, flex: 1, minHeight: 0 }}>
        <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <h2 style={sectionTitle}>{editingId ? 'Edit contact' : 'New contact'}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Name">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} className="selectable" />
            </Field>
            <Field label="Address">
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} style={inputStyle} className="selectable" />
            </Field>
            <Field label="Note">
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} className="selectable" />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.favorite} onChange={e => setForm(f => ({ ...f, favorite: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} />
              Favorite
            </label>
            {error && <div style={errorStyle}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={submit} style={btnStyle('var(--accent-light)')}>{editingId ? 'Save changes' : 'Add contact'}</button>
              {editingId && <button onClick={resetForm} style={btnStyle('var(--text-muted)')}>Cancel</button>}
            </div>
          </div>
        </section>

        <section style={{ overflowY: 'auto', paddingRight: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
              {contacts.length === 0 ? 'No contacts yet.' : 'No matching contacts.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(contact => (
                <div key={contact.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '13px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <button title="Favorite" onClick={() => toggleFavorite(contact)} style={starStyle(contact.favorite)}>
                          {contact.favorite ? '*' : '+'}
                        </button>
                        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{contact.name}</strong>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }} className="selectable">
                        {contact.address}
                      </div>
                      {contact.note && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{contact.note}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <SmallButton label={copied === contact.address ? 'Copied' : 'Copy'} onClick={() => copy(contact.address)} />
                      <SmallButton label="Send" onClick={() => {
                        localStorage.setItem('zerc-wallet.pending-recipient', contact.address)
                        onNavigate('send')
                      }} />
                      <SmallButton label="Edit" onClick={() => edit(contact)} />
                      <SmallButton label="Delete" onClick={() => remove(contact.id)} danger />
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                    {shortAddress(contact.address)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function sortContacts(contacts: Contact[]) {
  return [...contacts].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name))
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7 }}>{label}</label>
      {children}
    </div>
  )
}

function SmallButton({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} style={btnStyle(danger ? 'var(--red)' : 'var(--accent-light)', true)}>{label}</button>
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
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

const errorStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 8,
  background: 'var(--red-glow)',
  border: '1px solid rgba(248,113,113,0.3)',
  color: 'var(--red)',
  fontSize: 12,
}

function btnStyle(color: string, small = false): React.CSSProperties {
  return {
    padding: small ? '6px 9px' : '9px 14px',
    background: `${color}14`,
    border: `1px solid ${color}44`,
    borderRadius: 7,
    color,
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontSize: small ? 11 : 12,
    fontWeight: 700,
  }
}

function starStyle(active: boolean): React.CSSProperties {
  return {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: active ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
    color: active ? 'var(--gold)' : 'var(--text-muted)',
    cursor: 'pointer',
    fontWeight: 700,
  }
}

