import React, { useEffect, useState } from 'react'
import logo from '../assets/logo.png'

export function LoadingScreen() {
  const [dots, setDots] = useState('.')

  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 500)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 28,
    }}>
      {/* Spinning ring around logo */}
      <div style={{ position: 'relative', width: 88, height: 88 }}>
        <svg width={88} height={88} viewBox="0 0 88 88" fill="none"
          style={{ position: 'absolute', inset: 0, animation: 'spin 2.5s linear infinite' }}>
          <circle cx="44" cy="44" r="40" stroke="rgba(107,79,216,0.15)" strokeWidth="2"/>
          <circle cx="44" cy="44" r="40" stroke="url(#purpleGrad)" strokeWidth="2.5"
            strokeDasharray="251" strokeDashoffset="190" strokeLinecap="round"/>
          <defs>
            <linearGradient id="purpleGrad" x1="0" y1="0" x2="88" y2="88" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#44318d"/>
              <stop offset="100%" stopColor="#8b6ef5"/>
            </linearGradient>
          </defs>
        </svg>
        <img
          src={logo}
          alt="ZERC"
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 52, height: 52,
            borderRadius: 10,
          }}
        />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 22, fontWeight: 800, letterSpacing: '0.1em', marginBottom: 8,
        }}>
          ZERC<span style={{ color: 'var(--accent-light)', fontWeight: 400 }}>WALLET</span>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          Connecting to node{dots}
        </div>
      </div>
    </div>
  )
}
