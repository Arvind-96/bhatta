# Bhatta Cloud — Brick Kiln Management SaaS

Cloud-based, local-sync brick kiln (bhatta) management platform with a premium,
Stripe/Vercel-style dashboard — covering the full ground-level workflow from
soil procurement to fired brick, not just "production + stock".

- **Full implementation plan & architecture**: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- `backend/` — Express + Socket.io + MongoDB (Mongoose) API, JWT auth, multi-kiln — runs on any host with Node.js, no cloud lock-in
- `frontend/` — Vite + React + Tailwind + shadcn-style dashboard: live charts, People/Ledger, Soil & Logistics, Pathai (molding), Stacking (Bharai) with a live chamber map, face-scan + geofenced attendance kiosk, Hindi/English UI
- `sync-engine/` — Offline-first local sync service (SQLite → server) for the kiln site

An owner can run **multiple bhattas** from one account (kiln switcher in the
sidebar). Login is only for Owner/Manager/Munim — drivers, suppliers, labour
contractors, thekedars, partners, workers, helpers, and landowners are
tracked as records (with a DUE/PAID ledger) rather than accounts. See
[docs/IMPLEMENTATION_PLAN.md §2](docs/IMPLEMENTATION_PLAN.md#2-people-model--who-uses-this-software).

The soil-to-brick pipeline (khet → tractor trips → pathai molding → drying
wastage → gang-wise stacking into kiln chambers) is fully modeled, with an
automatic **reconciliation check** that flags a molded-vs-stacked count
mismatch before it's written off as normal loss. See
[docs/IMPLEMENTATION_PLAN.md §6](docs/IMPLEMENTATION_PLAN.md#6-soil-to-brick-production-pipeline).

Every cross-entity reference (a trip's landowner, a stacking entry's gang, a
ledger entry's person) is validated against the current kiln and expected
type before it's written — see
[§7 Data Integrity](docs/IMPLEMENTATION_PLAN.md#7-data-integrity--every-reference-is-verified-not-trusted).
Every API route is wrapped so a single bug returns an error response instead
of crashing the server — see
[§8 Crash Safety](docs/IMPLEMENTATION_PLAN.md#8-crash-safety).

Portable by design: the exact same build runs as a **hosted SaaS** (cloud VPS +
MongoDB Atlas) or entirely on a **client's own server** (their machine +
locally installed MongoDB) — only `.env` values change. See
[§16 Deployment Models](docs/IMPLEMENTATION_PLAN.md#16-deployment-models--portability).

Kept lightweight on purpose: face-api.js (used for face-scan attendance) is
dynamically imported only inside the Kiosk / enroll-face screens, so it never
loads on the main dashboard — verified via `npm run build` (see
[§1](docs/IMPLEMENTATION_PLAN.md#1-product-overview)).

## Quick start

No Docker needed. `MONGODB_URI` can point at a free
[MongoDB Atlas](https://mongodb.com/atlas) cluster, or any MongoDB you already
have running (VPS or a client's own server).

```bash
cd backend && cp .env.example .env   # set MONGODB_URI
npm install && npm run dev

cd frontend && cp .env.example .env && npm install && npm run dev
```

Open http://localhost:5173 and click **"New bhatta? Set one up"** to register
the first owner account — this also creates your `Kiln`. Then, in Settings,
set the chamber count and the attendance geofence, and in People add your
landowners/drivers/workers before using Soil, Molding, or Stacking.

To connect the on-site sync engine, register a second (MUNIM) account
scoped to that same kiln, then put its credentials in
`sync-engine/.env` as `SYNC_EMAIL` / `SYNC_PASSWORD`. Full steps in
[docs/IMPLEMENTATION_PLAN.md §15](docs/IMPLEMENTATION_PLAN.md#15-getting-started).

```bash
cd sync-engine && cp .env.example .env && npm install && npm run dev
```

The demo generator will start pushing simulated production/stock entries
within a few seconds, and the dashboard updates live via Socket.io.

For face-scan attendance, download the face-api.js model weight files into
`frontend/public/models/` — see
[docs/IMPLEMENTATION_PLAN.md §15](docs/IMPLEMENTATION_PLAN.md#15-getting-started).
