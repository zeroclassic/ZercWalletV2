export interface Contact {
  id: string
  name: string
  address: string
  note: string
  favorite: boolean
  createdAt: number
  updatedAt: number
}

export const CONTACTS_KEY = 'zerc-wallet.contacts.v1'

export function loadContacts(): Contact[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTACTS_KEY) ?? '[]') as Contact[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveContacts(contacts: Contact[]) {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts))
  window.dispatchEvent(new CustomEvent('zerc:contacts-updated'))
}

export function makeContact(input: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Contact {
  const now = Date.now()
  return {
    ...input,
    id: `${now}-${Math.random().toString(36).slice(2)}`,
    createdAt: now,
    updatedAt: now,
  }
}

export function isLikelyZercAddress(value: string) {
  const trimmed = value.trim()
  return /^t[a-zA-Z0-9]{25,}$/.test(trimmed) || /^z[a-zA-Z0-9]{25,}$/.test(trimmed)
}

export function shortAddress(address: string) {
  return address.length > 22 ? `${address.slice(0, 14)}...${address.slice(-8)}` : address
}

