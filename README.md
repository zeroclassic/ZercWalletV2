# ZercWallet v2.0

Desktop wallet for **ZeroClassic (ZERC)** — compatible avec le node v5.0.0.  
Construit avec Electron 28 + React 18 + TypeScript. Tourne sur **Windows**, **Linux** et **macOS**.

---

## Features

- 🔵 **Adresses transparentes** (T-addr) — transactions standard
- 🔒 **Adresses shieldées** (Z-addr) — privées via zk-SNARKs
- 📊 **Dashboard** — solde, stats node, transactions récentes
- ↑ **Send** — envoi transparent & shielded avec support memo
- ↓ **Receive** — affichage adresse avec QR code + copie
- 📋 **Transactions** — historique complet avec filtres
- ⊞ **Addresses** — gestion T et Z addresses
- ⚙ **Settings** — connexion RPC configurable avec test live
- 🔄 **Auto-refresh** toutes les 15 secondes

---

## Prérequis

| Outil | Version |
|-------|---------|
| Node.js | ≥ 18.x |
| npm | ≥ 9.x |
| zeroclassicd | 5.0.0 |

> **Windows** : Télécharger Node.js sur https://nodejs.org (prendre la version LTS).  
> Vérifier l'installation : `node -v` et `npm -v` dans PowerShell.

---

## Configuration du node

Dans `%APPDATA%\ZeroClassic\zeroclassic.conf` (créer si absent) :

```conf
rpcuser=zerc
rpcpassword=motdepassefort
rpcport=8545
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
```

> ZercWallet **détecte automatiquement** ce fichier au premier lancement et pré-remplit les Settings.

---

## Développement

### Windows (PowerShell ou CMD)

```powershell
# Cloner / extraire le projet, puis :
cd zerc-wallet
npm install

# Terminal 1 — compiler main process + renderer en watch
npm run dev

# Terminal 2 — lancer Electron
npm run electron:dev
```

> ⚠️ Il faut **deux terminaux séparés** sous Windows.  
> Dans le terminal 1, attendre que Vite affiche `ready in Xms` avant de lancer le terminal 2.

### Linux / macOS

```bash
npm install
npm run dev &
npm run electron:dev
```

---

## Build & distribution

```powershell
# Windows — génère un installeur .exe (NSIS) + un .exe portable dans release/
npm run dist:win
```

L'installeur Windows (`ZercWallet Setup 2.0.0.exe`) sera dans `release/`.  
Il créé un raccourci Bureau et menu Démarrer, et permet de choisir le répertoire d'installation.

```bash
npm run dist:linux   # .AppImage + .deb
npm run dist:mac     # .dmg
```

---

## Dossier de config (Windows)

ZercWallet stocke sa config dans :
```
%APPDATA%\zerc-wallet\config.json
```
soit typiquement `C:\Users\VotreNom\AppData\Roaming\zerc-wallet\config.json`.

---

## Structure du projet

```
zerc-wallet/
├── src/
│   ├── main/                 ← Electron main process (Node.js)
│   │   ├── main.ts           ← Entry point + IPC handlers
│   │   ├── rpc.ts            ← Client JSON-RPC pour zeroclassicd
│   │   ├── config.ts         ← Gestionnaire de config + auto-détection
│   │   └── preload.ts        ← Bridge sécurisé → window.zerc
│   ├── renderer/             ← Interface React
│   │   ├── App.tsx           ← Composant racine + routing
│   │   ├── hooks/
│   │   │   └── useWallet.ts  ← Fetch des données + polling 15s
│   │   ├── components/
│   │   │   ├── TitleBar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── ErrorScreen.tsx
│   │   │   └── LoadingScreen.tsx
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── Send.tsx
│   │       ├── Receive.tsx
│   │       ├── Transactions.tsx
│   │       ├── Addresses.tsx
│   │       └── Settings.tsx
│   └── shared/
│       └── types.ts          ← Types TypeScript partagés + constantes IPC
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.main.json
└── package.json
```

---

## Sécurité

- **Context isolation** activé — le renderer n'a aucun accès direct à Node.js
- Tous les appels IPC passent par l'API typée `window.zerc` (bridge preload)
- Credentials RPC stockés localement dans `%APPDATA%\zerc-wallet\config.json`
- Aucune télémétrie, aucune connexion externe

---

## License

MIT — ZeroClassic Community
