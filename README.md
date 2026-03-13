# 💕 CHAOS DATE  v2.0
> The world's best game for long-distance couples

No app download. No install. Just share a link and play together.

## Quick Start

```bash
npm install
npm start
# → http://localhost:3000
```

## Free Hosting Solutions

### 1. Railway (Easiest)
```bash
npm install -g @railway/cli
railway login
railway init && railway up
```
Or: railway.app → New Project → Deploy from GitHub (auto-detects Node.js)

### 2. Render.com (No CLI)
1. Push to GitHub
2. render.com → New Web Service → connect repo
3. Build: `npm install` / Start: `npm start`
4. Free URL: https://your-app.onrender.com

### 3. Fly.io (Best performance)
```bash
curl -L https://fly.io/install.sh | sh
fly auth login
fly launch && fly deploy
```

### 4. Glitch.com (Browser-only, no setup)
glitch.com → New Project → Import from GitHub

### 5. ngrok (Instant, no deploy)
```bash
npm start           # in terminal 1
ngrok http 3000     # in terminal 2 — share the https URL
```

## Features v2.0
- 👧👦🌈 Gender + outfit colour selection
- 💕 Shared love meter (fills as you play together)
- 🤗 Proximity hearts when standing close
- 🐾 Pet renaming from the pet panel
- 5 Mini-games: Heart Collector, Push Arena, Draw & Guess, Love Quiz, Memory Match
- 📱 Mobile landscape + portrait optimised
- 🎮 Keyboard + touch joystick crossplay
- 💬 Chat bubbles, sticky notes, reactions, virtual hugs
- 🔧 Stable state machine — no more stuck screens after mini-games
