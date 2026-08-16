# Bhatta Cloud — Brick Kiln Management SaaS
## Implementation Plan

## 1. Product Overview

Cloud-based + local-sync management software for brick kilns (bhatta). Owners dashboard se apne saare bhatte (ek se zyada ho sakte hain) live manage kar sakein — mitti procurement se lekar pakki eent tak ka poora cycle, poori team (drivers, labour, supplier, workers) ki ledger/attendance — chahe internet ho ya na ho.

**Design language**: Stripe / Vercel jaisa — dark-first, glassmorphism cards, generous whitespace, subtle motion, monospace numerics for stats, no clutter.

**Portability by design**: stack sirf Node.js + Express + MongoDB par based hai — koi cloud-vendor-specific SDK, koi Docker dependency nahi. Isliye yeh Hostinger VPS, kisi bhi doosre VPS/cloud, ya client ke apne on-premise server par bina code change ke chal jaata hai — sirf `.env` values badalti hain. Detail: [§16 Deployment Models](#16-deployment-models--portability).

**Kept lightweight on purpose**: the only heavy dependency (face-api.js + its ~6-7MB model weights, for face-scan attendance) is dynamically `import()`-ed only inside the Kiosk and "enroll face" screens — Vite code-splits it into its own chunk, so it never loads on first paint or affects the main dashboard's bundle size. Verify with `cd frontend && npm run build` and check `dist/assets/` — the face-api chunk is separate from the main entry chunk.

## 2. People Model — who uses this software

Two different kinds of "people" in the system, and they're modeled differently:

| | Login users | Tracked entities |
|---|---|---|
| Who | **Owner, Manager, Munim** | Driver, Labour Contractor, Supplier, Thekedar, Partner, Worker, Helper, Landowner |
| Access | Sign in with email/password, JWT session, use the dashboard | No login — records managed *by* a login user |
| Why | These are the people who actually operate the software day to day | The rest (drivers, labourers, suppliers, khet malik…) are referenced in transactions — a soil trip has a landowner, a dispatch has a driver, a wage entry has a worker — but don't need their own account |
| Model | `User` + `KilnMembership` (§3) | `Person` (type-discriminated) + `LedgerEntry` + `Attendance` (§10) |

A person can hold multiple roles across different bhattas (e.g. OWNER at their own kiln, MANAGER at a family member's) — membership is per (user, kiln) pair, not a single global role.

## 3. Multi-Kiln Architecture

An owner can run **more than one bhatta**, so a user's access to a kiln is a
**membership**, not a fixed field on the account:

- `User` — just identity (name, email, password hash). No role, no kiln.
- `Kiln` — one bhatta (name, location, geofence for attendance — see §5).
- `KilnMembership` — join table: `{ userId, kilnId, role }`. An owner has one
  membership per bhatta they run; a manager/munim typically has exactly one.

The JWT only carries `{ id }` — it never encodes which kiln, since an owner's
kiln list can change without forcing a re-login. Every kiln-scoped API
request instead carries an **`X-Kiln-Id` header** naming the active bhatta;
`middleware/resolveKiln` looks up the membership and 403s if the user doesn't
belong to that kiln. The frontend's kiln switcher (sidebar) sets the active
kiln, which flows into every API call and into the Socket.io handshake — the
server re-verifies membership before joining that kiln's live-update room, so
one bhatta's dashboard can never see another's data even if the browser tab
is compromised into requesting it.

Adding another bhatta later is `POST /api/kilns` (authenticated) — creates a
new `Kiln` + an OWNER membership for the caller, no new account needed.

## 4. Architecture

```
                    ┌─────────────────────────┐
                    │   Cloud/Server (MongoDB  │
                    │   + Express API + Socket)│
                    └────────────┬─────────────┘
                                 │ HTTPS / WSS (X-Kiln-Id scoped)
                 ┌───────────────┼───────────────┐
                 │                               │
        ┌────────▼────────┐            ┌─────────▼─────────┐
        │  Owner Dashboard  │           │  Kiln-site Sync    │
        │  (React/Vite)     │           │  Engine (Node +    │
        │  anywhere, online │           │  local SQLite)     │
        └───────────────────┘           └─────────┬──────────┘
                                                    │ works offline
                                          ┌─────────▼──────────┐
                                          │ Local Terminal UI   │
                                          │ (munim/operator)   │
                                          └─────────────────────┘
```

- **Backend server**: source of truth. MongoDB (Atlas, a self-hosted instance, or one installed on the client's own server) + Express REST API + Socket.io for live push to dashboards.
- **Sync engine**: Node service jo bhatta site par chalti hai, ek munim/owner account se authenticate hoti hai. Local SQLite me writes turant save hote hain (offline-safe), phir background me queue se server ko push karta hai. Conflict resolution: idempotent upsert via `localId` + `version` counter per document.
- **Frontend dashboard**: Socket.io client se subscribe karta hai active kiln ke room (`kiln:<id>`, membership-verified); har naya production/stock/ledger/attendance/stacking event live turant reflect hota hai.

## 5. Attendance — face scan + geofence

Worker/Helper attendance is captured at a kiosk (a tablet/laptop kept at the
site), not self-reported:

1. `Kiln.latitude` / `Kiln.longitude` / `Kiln.radiusMeters` define the site's
   geofence (set once from Settings → "Use my current location").
2. Each Worker/Helper is **enrolled** once (People page → Enroll face):
   the browser captures a face descriptor (a 128-number vector from
   face-api.js, run entirely client-side — no photo ever leaves the device)
   and stores it on their `Person` record.
3. At the kiosk, a worker looks at the camera and taps "Scan". The browser
   sends `{ descriptor, latitude, longitude }` to
   `POST /api/attendance/face-checkin`. The server:
   - rejects if the coordinates fall outside `radiusMeters` of the kiln
     (Haversine distance, `backend/src/utils/geo.ts`),
   - finds the closest enrolled descriptor among that kiln's workers/helpers
     (Euclidean distance) and rejects if even the closest match is too far
     to trust (`FACE_MATCH_THRESHOLD` in `attendance.service.ts`),
   - marks that person present for today — no name/ID selection needed.

**Known limitation (documented, not solved here)**: this has no liveness
detection, so a photo of a photo could in principle spoof a match. Adequate
for reducing buddy-punching in a low-tech site; add a liveness check
(blink/head-turn prompt) before relying on it for anything higher-stakes.

## 6. Soil-to-Brick Production Pipeline

The real ground-level workflow is longer than "production + stock" — it
starts in a farmer's field and ends with a fired brick. Each stage below is
its own module, and each one posts money movements straight to the
`LedgerEntry` for the person responsible, so the munim never re-enters the
same number twice.

### A. Soil procurement (`SoilTrip`, `Expense`)

- A `Person` of type `LANDOWNER` represents a khet malik — `khetLocation`,
  `khetArea`/`khetAreaUnit` (bigha/acre) capture the field itself.
- Each tractor-trolley load is one `SoilTrip`: landowner, optional driver,
  tractor number, trolley count, `ratePerTrolley` (snapshotted on the trip,
  not read live from the person, so a later rate change doesn't rewrite
  history). Saving a trip immediately posts a `DUE` ledger entry to the
  landowner (`trolleyCount × ratePerTrolley`), and to the driver too if
  `driverRatePerTrolley` is given (drivers paid per-trip vs. salaried are
  both real arrangements on-site).
- A trip has a lightweight status: `ARRIVED → WEATHERING → READY`, tracking
  the "let the soil rest and even out before it's usable" step described on
  site as weathering.
- `Expense` covers the surrounding costs that don't belong to a person —
  JCB/excavator rental, mining royalty/challan, tubewell diesel/electricity,
  water — one model with a `category` field rather than one model per
  category, since they're all just "kiln spent ₹X on date Y", optionally
  linked back to the `SoilTrip` that triggered it (e.g. a per-trip royalty
  challan).

### B. Molding / Pathai (`MoldingEntry`)

- One entry per pathaiwal (a `Person` of type `WORKER`) per day: bricks
  molded, `ratePerThousand` (piece-rate, not daily wage — this is the
  standard pay structure for molding). Posts `DUE` to the worker's ledger
  automatically.
- `washedOut: true` marks a day rain destroyed the kacchi bricks before they
  dried — the count is still logged for the production record, but **no
  wage is posted**, matching how it's actually settled on-site (no one gets
  paid for a batch that never became sellable).

### C. Drying & wastage (`WastageLog`)

- Kacchi bricks dry in the field for several days and get turned
  ("paltai") partway through; a sudden storm can warp or ruin them before
  they're ever loaded.
- `WastageLog` records a loss by `type` (`SOIL` or `KACCHI_BRICK`) and
  `cause` (`RAIN`, `TRANSPORT`, `OTHER`) with a quantity — this feeds
  directly into the reconciliation check below instead of just being a
  free-floating note.

### D. Stacking / Bharai (`Gher`, `StackingEntry`) — where the money is actually made or lost

This is the most technical and highest-stakes step, so it gets its own
dashboard page (Sidebar → "Stacking (Bharai)"):

- **Chambers (`Gher`)**: a Bull's Trench Kiln (the standard Indian bhatta
  shape) is one large oval divided into 20-30 chambers. Different chambers
  are at different stages simultaneously — some firing, some being
  stacked, some just emptied — so each `Gher` tracks its own status:
  `EMPTY → STACKING → FIRING → READY → EMPTY` (the cycle repeats after
  unloading). The owner sets the chamber count once from Settings
  (`POST /api/ghers/setup`); it only ever adds new chambers, never resets
  an existing one's status.
- **Live oval map**: the dashboard renders the chambers as an actual oval
  (`components/stacking/GherMap.tsx`, plain SVG + trigonometry — no chart
  library needed for this one), color-coded by status, click-to-advance —
  so the owner sees the same shape they'd see walking the site, not a
  generic list.
- **Gang-wise entries (`StackingEntry`)**: bharai is done by a gang
  (jatha/toli) of 4-6 labourers, but paid as one lump sum to the gang head
  — which is exactly what the `LABOUR_CONTRACTOR` person type already
  models, so no separate "Gang" entity was needed. A `WORKER` acting as
  their own small gang's jamadaar works too — `gangId` accepts either type.
  Each entry: which chamber, which gang, bricks stacked, `damageCount`
  (breakage caught right at loading — see below), `ratePerThousand`, and a
  `qualityRating` (Good/Average/Poor) so a supervisor can flag a badly-set
  chamber before it's fired and the flaw becomes expensive. Saving an entry
  posts `DUE` to the gang's ledger and flips the chamber to `STACKING`
  automatically.
- **Damage tracking**: on-site, 2-5% of bricks break in transit from field
  to chamber. `damageCount` on the stacking entry captures this at the
  exact point it happens, rather than requiring a separate wastage entry
  every time.

### E. Reconciliation — the fraud/dispute check

The classic bhatta dispute: a pathaiwal claims 1,00,000 bricks molded, but
only 90,000 ever show up stacked. Some of the gap is legitimate (reported
wastage); anything beyond that is unexplained.

`GET /api/reconciliation` (`reconciliation.service.ts`) computes, over a
date range:

```
fieldStock = totalMolded − (totalStacked + totalDamaged + totalWastage)
```

`fieldStock` is what *should* still be sitting in the field awaiting
stacking. A large negative number, or a mismatch beyond a 5% threshold,
sets `alert: true` — the Stacking page shows this as a red banner up top,
prompting the owner to ask questions before writing the gap off as normal
loss.

### F. Land measurement, advance recovery, yard capacity & legal compliance

Four more ground-level risk points, each reusing existing infrastructure
rather than adding a heavyweight new subsystem:

- **Depth/measurement disputes**: `Person.agreedDepthFeet` (on a
  `LANDOWNER`) records the agreement's excavation limit; `SoilTrip.depthFeet`
  records what was actually dug on a given trip. The Soil page shows an
  inline warning when actual exceeds agreed — a judgment call for the owner
  to resolve with the landowner, not something the software blocks outright.
- **Advance (peshgi) recovery & absconding risk**: no new ledger concept was
  needed — an advance paid to a worker/gang is just a `PAID` ledger entry
  (money the kiln handed over before it was earned); wages are `DUE` entries
  as always. The existing `balance = sum(DUE) − sum(PAID)` formula falls out
  correctly: a **negative** balance means the person has been paid more than
  they've earned back, i.e. an outstanding advance. `GET /api/people/advances`
  lists everyone in that state, surfaced as a warning banner at the top of
  the People page — this is the "Sardar/Jamadaar ledger" the ground reality
  calls for, without a parallel bookkeeping system. `Person.status` adds an
  `ABSCONDED` flag (People page → click their status badge) so a labourer
  who left mid-season with an unpaid advance stays visible as an outstanding
  loss instead of quietly disappearing from an "active" list.
- **Drying yard (patheri) capacity**: `Kiln.yardCapacityBricks` (set once in
  Settings) is compared against the same `fieldStock` figure the
  reconciliation check already computes — when it crosses 85% of capacity,
  `yardFullWarning: true` shows on the Stacking page, flagging that new
  molding will have nowhere to go until stacking catches up.
- **Legal/PCB compliance renewals**: `ComplianceDocument` (PCB consent to
  operate, mining royalty license, Zig-Zag certificate, environmental
  clearance) stores a `title` + `expiryDate`; Settings → "Legal & compliance
  documents" lists them with a days-remaining badge (red once expired,
  amber inside 30 days) so a renewal never lapses unnoticed and turns into a
  fine or a sealed kiln.
- **Machinery & petty-cash cost visibility**: `Expense` gained an optional
  `hours` field (for JCB rental and tubewell diesel/electricity) so a
  per-hour cost is visible — the "diesel generator costs 3× grid power"
  comparison ground reality asked for — plus five new categories:
  `MOLD_SAND`, `TARPAULIN`, `LABOR_COLONY`, `LOCAL_CHANDA`, and `PETTY_CASH`
  (the munim's daily roznamcha — chai-pani, a puncture repair, informal
  local payments) so none of these end up buried in "Other" or left
  untracked entirely.

### G. Dispatch, Customer Credit & Thekedar-contract firing

Two more links from the finished-goods side back into the same `Person`
infrastructure, rather than new subsystems — later extended into a full
dispatch-to-delivery module once the customer/credit/fraud reality of the
gate came into scope:

- **Dispatch → Driver**: `Dispatch` (customer, bricks, amount) can name the
  `driverId` who carried the load — previously only a schema existed with no
  API or UI behind it; it now has a full page (Sidebar → Dispatch) and the
  Overview "Dispatched (7d)" stat reads real totals instead of a placeholder
  number.
- **ProductionLog → Thekedar**: a fired batch can be linked to a `THEKEDAR`
  contract via `thekedarId`. Saving it posts `DUE` to the thekedar's ledger
  automatically using their `Person.contractRate` (₹ per 1,000 bricks) — the
  same auto-ledger pattern as molding and stacking. The sync-engine's
  idempotency guard (`version === 1`) is reused here too, so a retried
  offline push can never double-charge a contract firing.
- **Customer as a `Person` type, ledger polarity flipped in the UI only**:
  `CUSTOMER` joined the existing `Person` types instead of a parallel
  "Customer" model. The same `LedgerEntry`/`balance = ΣDUE − ΣPAID` formula
  already used for labor/suppliers naturally produces "what the customer
  owes" once a sale is logged as `DUE` and a payment as `PAID` — no schema
  change, only `LedgerModal.tsx` swapping its labels and quick-action button
  (single "Record Payment Received") when `person.type === "CUSTOMER"`. This
  is documented in code (`Person.ts`, `dispatch.service.ts`) since the same
  direction label means the opposite real-world thing depending on who it's
  attached to.
- **Gate pass / slip number, grade, transport, payment mode**: every
  `Dispatch` now carries a unique `slipNumber` (auto-generated,
  `GP-<timestamp36>-<random4>`), `grade` (A1/Jhama/Pela — dispatch reduces
  that specific finished-goods stock line, not a generic "bricks" bucket),
  `paymentMode` (Cash/Bank/UPI/GST Invoice — the cash-vs-GST split the
  dual-accounting reality demands is at least visible per transaction), and
  `transportCost`/`transportPaidBy` (owner or customer bears the freight).
- **Delivery adjustments (`recordDeliveryAdjustment`)**: breakage and
  customer-site returns/rejections are entered against an existing dispatch
  after the fact. It computes the per-brick price from the original sale,
  refunds the customer's ledger proportionally, and adds any returned
  (undamaged) bricks back into finished-goods stock — so a partial return
  doesn't just vanish from both the money and the stock count, which is
  exactly where "partial-return fraud" hides.
- **Palledar loading count (`LoadingEntry`)**: a separate record of what the
  loading gang (palledar) claims to have loaded, independent of the
  dispatch's own `bricksCount`. When linked to a dispatch,
  `createLoadingEntry` flags `countMismatch` if the logged load exceeds the
  dispatch count by more than 2% — the software-visible version of "palledar
  claims he carried more than what actually left," which otherwise only
  surfaces as an unexplained wage dispute.
- **Customer credit aging (`customerCreditAging`)**: mirrors the existing
  outstanding-advances panel but for the sell side — every customer with a
  positive ledger balance, `daysPending` since the oldest unpaid sale, and
  `overLimit` if the balance exceeds their `Person.creditLimit`. Surfaced as
  a banner on the People page, clickable straight into that customer's
  ledger — the answer to "who owes us and for how long" without a separate
  aging report to run.

### H. Firing (Pakayi) — Sidebar → Firing

The kacchi-to-pakki transformation: the highest-stakes, highest-cost phase,
covered as its own module (`Firing.tsx`, four tabs) rather than folded into
Stacking:

- **Fire movement & round speed**: `updateGherStatus` already flips a
  chamber to `FIRING` when its turn comes (§6.D); every such transition now
  also writes a `FireMovementLog` row, so `GET /api/ghers/round-speed`
  can report chambers/day — the "1 to 1.5 Gher per day is healthy" metric
  quoted on-site, and the chamber the fire is currently at.
- **Multi-fuel purchases with weighbridge fraud detection**
  (`FuelPurchase`): every fuel delivery records both `invoicedWeightKg` and
  `actualWeightKg` (what the weighbridge actually showed) — the gap between
  them is exactly the classic "truck billed for 20 tons, delivered 18"
  short-weighing fraud. A >3% shortfall is flagged inline at entry time,
  not discovered later.
- **Daily feeding (`FuelLog`)**: coal/pet coke/biomass fed into a specific
  chamber on a specific day. Fuel stock on hand (`GET
  /api/fuel-purchases/stock-balance`) is simply purchases-in minus
  logged-out per fuel type — no separate inventory ledger needed.
- **Fuel efficiency & high-consumption alert**
  (`firingEfficiency.service.ts`): kg of fuel per 1,000 A-1 bricks over a
  recent window, compared against a trailing 30-day baseline — >20% above
  baseline flags `highConsumptionAlert`, the practical signal that a leak
  or overfeeding is wasting fuel before it eats a season's margin.
- **Chamber grading / yield (`ChamberGrading`)** — the core deliverable of
  this phase: when a cooled chamber opens, the munim records the A-1,
  Jhama (over-baked), Pela/Seem (under-baked), and Roda (broken) counts.
  Saving it:
  1. auto-creates `StockEntry` (finished-goods) rows per grade — this is
     the *only* thing that ever adds finished-goods stock, so it's always
     traceable back to a specific chamber and date;
  2. computes `recoveryPercent = a1Count / stackedCount`, where
     `stackedCount` sums this chamber's `StackingEntry` rows since
     `Gher.cycleStartedAt` (reset every time the chamber last started a
     fresh STACKING cycle — see §6.D) rather than its entire multi-season
     history;
  3. flips the chamber back to `EMPTY`, ready for the next cycle.
- **Fitter (Ostad) shifts (`FiringShift`)**: a new `FITTER` person type —
  skilled firing labor, paid monthly salary (settled as ordinary ledger
  `PAID` entries, same as any wage) plus OT/performance bonus, which posts
  `DUE` automatically. Each shift entry carries `handoverNotes` — fire
  position and coal fed, the thing that goes missing when a night-shift
  fitter falls asleep and nobody wrote anything down.
- **Kiln incidents (`KilnIncident`)**: one model covers three different
  narrated emergencies — chamber crack/air-leakage patchwork, rain
  flooding a firing chamber (thermal shock), and transformer/motor
  burnout — because all three have the same shape: something broke, it
  cost money to fix, it may have cost bricks. The repair cost auto-posts
  to `Expense` (category `MACHINERY_REPAIR`) so it still rolls into normal
  cost totals, while the incident record keeps the root cause an owner
  would otherwise have to guess at weeks later ("why did coal consumption
  spike that week?").
- **Finished-goods reconciliation (`reconcileFinishedGoods`)** — the
  "blind dispatch" / gate-bypass check: `totalA1Produced − totalDispatched
  − currentStock` should net to ~0. A gap beyond 5% is the software-only
  answer to munim-and-driver collusion moving stock out without ever
  logging a `Dispatch` — it can't stop someone from simply not creating a
  record, but it makes the resulting mismatch between production and
  warehouse counts visible on the Dispatch page instead of invisible.
- **Kharchi & medical advance** — no new backend at all; the existing
  `LedgerEntry` (`PAID`, reason pre-filled) already models a weekly petty
  cash draw or an emergency hospital advance exactly the way an advance
  works — quick-action buttons on the ledger modal (People page) cover
  it. Not building a parallel system for something the ledger already
  handles correctly is the point.

### I. Fleet (Vehicles & Machines) — Sidebar → Fleet

Tractors, trucks, JCB, Pug Mill, molding machine, weighbridge, generator,
pump, blower — every powered asset on-site, tracked as its own thing rather
than folded into `Expense` categories, because "which machine is costing us
money" is a different question from "how much did we spend":

- **`Machine` registry**: name, `type`, optional registration/identifier,
  `active` flag — created once from the Fleet page, then referenced by every
  fuel/maintenance log.
- **Fuel & electricity logs (`MachineFuelLog`)**: quantity (litres or kWh)
  and optional hours-run per entry, per machine. `createMachineFuelLog`
  computes `ratePerHour` and compares it against *that same machine's* own
  trailing 30-day baseline — not a fleet-wide average, since a JCB and a
  water pump have nothing in common — and flags `consumptionAlert` if it's
  more than 30% over baseline. This is the direct software answer to diesel
  siphoning: not proof, but the same kind of "worth checking" flag as the
  weighbridge and fuel-efficiency alerts elsewhere in the system.
- **Maintenance & breakdown logs (`MachineMaintenanceLog`)**: description,
  repair cost, downtime hours. A cost > 0 auto-posts to `Expense` (category
  `MACHINERY_REPAIR`), same pattern as `KilnIncident` — so machinery spend
  still rolls into the normal expense totals without being entered twice.

### J. Physical stock audit — Settings → Physical stock audit

`StockAudit`: a munim hand-counts an item (usually finished-goods bricks)
and enters the `physicalCount`; the server reads the live `registerCount`
from the same stock snapshot the dashboard uses and computes `variance`.
This is the season-end (or spot-check) answer to "does the register match
what's actually in the yard" — the same reconciliation idea as §6.E and the
finished-goods check in §6.H, but comparing the system's own number against
a manual count instead of against another derived number, which is what
catches errors *within* the system (a missed entry, a double-counted
dispatch) rather than fraud between two independently-tracked numbers.

### K. Financial reporting — Overview season summary + per-chamber cost

Two read-only report endpoints, deliberately kept simple rather than
attempting a full accounting engine:

- **`seasonFinancialSummary`** (Overview page card): revenue = sum of
  `Dispatch.amount` in the window; costs = sum of `Expense.amount` +
  sum of non-customer `LedgerEntry` `DUE` entries (labor/contractor wages);
  `netProfit = revenue − totalCosts`. The card explicitly labels itself
  "simplified" — it does not allocate soil/molding cost per batch, doesn't
  depreciate machinery, and doesn't split partner profit shares. Building
  that properly needs a real cost-allocation model (see backlog below); a
  false-precision P&L would be worse than an honest simplified one.
- **`chamberCostReport`** (used from Firing's per-Gher context): fuel cost
  for *this chamber's current cycle only* (via `Gher.cycleStartedAt`, same
  cycle-scoping as `ChamberGrading.recoveryPercent`) at the average ₹/kg
  paid across `FuelPurchase` records, plus that cycle's stacking wage cost.
  Deliberately does not attempt to allocate molding or soil cost across
  chambers — there's no clean way to split a shared soil pile across
  chambers without an arbitrary rule, so it's left out rather than
  invented.

## 7. Data Integrity — every reference is verified, not trusted

Every model that links to another (a `SoilTrip`'s `landownerId`, a
`StackingEntry`'s `gangId`/`gherId`, a `MoldingEntry`'s `workerId`, a
`Person`'s `contractorId`, a ledger entry's `personId`, an `Expense`'s
`soilTripId`) is validated **before** the write happens, not just assumed
correct:

- `person.service.assertPersonOfType(kilnId, personId, allowedTypes)` is the
  shared check — confirms the referenced `Person` exists, belongs to *this*
  kiln (not some other bhatta), and is one of the expected types (e.g. a
  `StackingEntry.gangId` must be a `LABOUR_CONTRACTOR` or `WORKER`, never a
  `SUPPLIER`). Every service that accepts a personId from client input runs
  this first.
- `ledger.service.addLedgerEntry` — the single choke point every ledger
  write goes through — independently re-checks the person exists in that
  kiln, since a wrong balance is the worst possible place for a silent bug.
- `soilTrip`, `stacking`, `expense` services apply the equivalent check for
  their own foreign keys (`Gher`, `SoilTrip`).

Without this, a stale ID, a typo, or a cross-kiln ID would silently create a
ledger entry or attendance record against the wrong person (or nothing at
all) — the kind of bug that only surfaces weeks later when the money
doesn't add up. Failing loudly at write time with a clear error is the
alternative.

## 8. Crash Safety

Express 4 does **not** automatically catch a rejected promise from an
`async` route handler — an uncaught one becomes an unhandled rejection,
which can crash the entire Node process over a single bad request instead
of just failing it. Every route in this codebase is wrapped:

- `middleware/asyncHandler.ts` — wraps every controller at the point of
  route registration (`router.post("/", asyncHandler(create))`), catching
  any rejection and forwarding it to `errorMiddleware`, which returns
  `{ error: message }` as JSON instead of taking the server down.
- `resolveKiln` (async middleware, not a controller) has its own
  `try/catch` for the same reason.
- `index.ts` adds a last-resort `process.on("unhandledRejection")` /
  `process.on("uncaughtException")` pair that logs and **does not exit** —
  a safety net for anything that still slips past the above (a bug in a
  socket handler, a stray unawaited promise), so a single bug produces a
  logged error, not downtime.
- The sync-engine's own loop (`syncQueue.ts`) already catches push failures
  and retries instead of crashing — same principle, offline-first side.

## 9. Multi-language Support (Hindi / English)

A lightweight, dependency-free i18n layer — deliberately not a library like
`i18next`, since the app only needs a couple of languages and pulling in an
i18n runtime would work against the "keep it light" goal (§1):

- `lib/i18n/translations.ts` — a flat `key → { en, hi }` dictionary.
  Extending to a third language is one new column; nothing else changes.
- `store/locale.store.ts` — current locale, persisted to `localStorage`,
  defaulting to the browser's language (`navigator.language`).
- `hooks/useTranslation.ts` — `const { t } = useTranslation()`; `t(key)`
  looks up the current locale, falling back to English if a key is missing
  in a language (so a partial translation never renders blank).
- `components/layout/LanguageSwitcher.tsx` — the EN/हिंदी toggle, present
  on both the Login screen and the dashboard Topbar.

**Coverage so far**: the app shell (sidebar nav, topbar, login, stat card
labels, section titles) is fully wired. Extending coverage to the rest of a
screen (a modal's field labels, a table's column headers) is mechanical —
add a key to the dictionary, wrap the string in `t("namespace.key")` — but
hasn't been done exhaustively across every modal in this pass; treat the
infrastructure as complete and the translation coverage as a to-do you can
extend incrementally per screen.

## 10. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React 18 + TypeScript | Fast dev/build, lightweight bundle vs Next.js for a dashboard app |
| Styling | Tailwind CSS + shadcn/ui (Radix) | Utility-first + accessible primitives, easy glassmorphism |
| Charts | Recharts | Composable, good with Tailwind theme tokens |
| State | Zustand | Minimal boilerplate for live socket-driven state |
| i18n | Custom (no library) | Two locales don't justify an i18n runtime in the bundle — see §9 |
| Face recognition | face-api.js (client-side, lazy-loaded) | No cloud face-recognition API cost/dependency; code-split so it never touches the main bundle (§1) |
| Backend | Node.js + Express | Simple, battle-tested REST + middleware; runs on any host with Node |
| Realtime | Socket.io (server + client) | Room-based broadcast per kiln, membership-verified, auto-reconnect |
| DB (server) | MongoDB + Mongoose ODM | No native install lock-in — runs on Atlas, any VPS, or a client's own on-premise machine; document model fits variable per-kiln fields without migrations |
| DB (local) | SQLite (better-sqlite3) | Zero-config offline store on the kiln-site machine, works fully without internet |
| Auth | JWT + per-kiln membership | Stateless identity; kiln access resolved per-request via `X-Kiln-Id` (§3) |
| Deployment | See §16 — same build, two modes: hosted SaaS or client's own server | No code changes needed to relocate |

## 11. Core Data Model (MongoDB via Mongoose)

- `User` — login identity (name, email, password hash)
- `KilnMembership` — `{ userId, kilnId, role: OWNER\|MANAGER\|MUNIM }`
- `Kiln` — bhatta profile + geofence (`latitude`, `longitude`, `radiusMeters`)
- `Person` — the 9 tracked roles, one collection with a `type` discriminator (`DRIVER`, `LABOUR_CONTRACTOR`, `SUPPLIER`, `THEKEDAR`, `PARTNER`, `WORKER`, `HELPER`, `LANDOWNER`, `FITTER`) plus a `faceDescriptor` for Worker/Helper
- `LedgerEntry` — `DUE`/`PAID` money movements against a `Person`; balance = sum(DUE) − sum(PAID)
- `Attendance` — one record per `(personId, date)`, `PRESENT`/`ABSENT`/`HALF_DAY`
- `SoilTrip` — one tractor-trolley load: landowner, driver, rate, actual dig depth, status (§6.A, §6.F)
- `Expense` — JCB/tubewell (with optional `hours`), royalty/challan, water, molds/sand, tarpaulin, labor colony, local chanda, petty cash/roznamcha (§6.A, §6.F)
- `MoldingEntry` — pathai hazri, piece-rate, per worker per day (§6.B)
- `WastageLog` — soil/kacchi-brick loss by cause (§6.C)
- `Gher` — kiln chamber, status cycle (§6.D)
- `StackingEntry` — gang-wise bharai into a chamber, damage + quality tracked (§6.D)
- `ComplianceDocument` — PCB/royalty/Zig-Zag certificates with an expiry date (§6.F)
- `FireMovementLog` — one row per chamber-to-FIRING transition, basis for round-speed reporting (§6.H)
- `FuelPurchase` — coal/pet coke/biomass delivery, invoiced vs. actual weighbridge weight (§6.H)
- `FuelLog` — daily fuel fed into a chamber (§6.H)
- `ChamberGrading` — A-1/Jhama/Pela/Roda breakdown on chamber opening, drives finished-goods stock (§6.H)
- `FiringShift` — fitter (Ostad) shift/handover log, OT + bonus (§6.H)
- `KilnIncident` — chamber crack, weather flooding, or electrical failure; auto-posts to `Expense` (§6.H)
- `ProductionLog` — fired/finished brick output (batch, quantity, quality grade), optional `thekedarId` (§6.G)
- `StockEntry` — raw material (coal, clay) in + finished goods stock
- `Dispatch` — outgoing sales/truck loads, optional `driverId` (§6.G)
- `SyncLog` — append-only change log used to audit local ↔ server reconciliation

`Person` also carries `status` (`ACTIVE`/`ABSCONDED`) and `agreedDepthFeet`
(landowners); `Kiln` also carries `yardCapacityBricks` (§6.F).

Schemas: [backend/src/models/](../backend/src/models/)

## 12. Real-time Flow

1. Munim local terminal se production entry karta hai → sync-engine turant SQLite me likhta hai + UI ko confirm karta hai (offline bhi kaam karega).
2. Sync-engine background loop (every few seconds, jab network ho) unsynced rows `POST /api/sync/push` par bhejta hai (`X-Kiln-Id` header ke saath).
3. Server row ko MongoDB me upsert karta hai (`localId` = idempotency key, retry-safe), `SyncLog` me record karta hai, aur `io.to("kiln:<id>").emit("production:update", payload)` karta hai.
4. Sabhi connected dashboards (owner ka phone/laptop, kahin bhi, membership-verified) ko event turant milta hai → Zustand store update → chart/stat card re-render, koi page refresh nahi. Same pattern `stock:update`, `ledger:update`, `attendance:update`, `soilTrip:update`, `expense:update`, `molding:update`, `wastage:update`, `gher:update`, `stacking:update`, `compliance:update`, `person:update`, `dispatch:update` ke liye bhi — every module that writes data emits its own event, and every corresponding page subscribes via a shared `useKilnEvent(event, refresh)` hook (`frontend/src/hooks/useKilnEvent.ts`).

### Socket identity survives a kiln switch

An owner with multiple bhattas can switch the active kiln without leaving
the page they're on. The Socket.io **client instance is never destroyed and
recreated** for this — `lib/socket.ts`'s `reconnectSocket()` calls
`.disconnect()` then `.connect()` on the *same* object, whose `auth`
callback re-reads the current `activeKilnId` from the store on every
(re)connection attempt. This matters because every page's `useKilnEvent`
listener is attached to that one persistent instance at mount time; if the
client were torn down and rebuilt on each switch (an earlier version of
this code did exactly that), every listener already registered on a page
the user hadn't navigated away from would silently stop receiving events
after the first kiln switch — a bug that only shows up multi-kiln, past the
first session, which is exactly the kind of thing that's easy to miss
without deliberately testing that path. `destroySocket()` (full teardown)
is reserved for logout, where starting the next login with a clean client
is what you actually want.

## 13. Folder Structure

```
JVS/
├── backend/
│   └── src/
│       ├── config/             # env, MongoDB connection, socket setup
│       ├── models/             # User, KilnMembership, Kiln, Person, LedgerEntry, Attendance,
│       │                       # SoilTrip, Expense, MoldingEntry, WastageLog, Gher, StackingEntry,
│       │                       # ComplianceDocument, FireMovementLog, FuelPurchase, FuelLog,
│       │                       # ChamberGrading, FiringShift, KilnIncident,
│       │                       # ProductionLog, StockEntry, Dispatch, SyncLog
│       ├── routes/             # REST endpoints
│       ├── controllers/        # request handlers
│       ├── services/           # business logic — includes assertPersonOfType (§7) and reconciliation (§6.E)
│       ├── sockets/            # socket event registration
│       ├── middleware/         # requireAuth, resolveKiln, asyncHandler (§8), error handling
│       ├── utils/geo.ts        # Haversine distance, face-descriptor distance
│       └── index.ts            # app entrypoint + process-level crash safety net
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ui/             # shadcn-style primitives (card, badge, button)
│       │   ├── layout/         # sidebar, topbar, kiln switcher, language switcher
│       │   ├── dashboard/      # StatCard, ProductionChart, StockOverview, LiveFeed
│       │   ├── people/         # add-person modal, ledger modal, enroll-face modal
│       │   └── stacking/       # GherMap (oval chamber visualization)
│       ├── hooks/               # useSocket, useLiveProduction, useTranslation, useKilnEvent
│       ├── lib/                 # api client, socket client, face.ts (lazy face-api), i18n/, utils
│       ├── store/                # zustand: auth, dashboard, ui (view switch), locale
│       └── pages/               # Dashboard (shell), Overview, People, Soil, Molding, Stacking,
│                                 # Firing, Dispatch, Fleet, Kiosk, Settings, Login
├── sync-engine/                # Runs on-site at the kiln; offline-first writer
│   └── src/
│       ├── localDb.ts          # SQLite schema + helpers
│       ├── syncQueue.ts        # push/retry reconciliation loop
│       └── cloudClient.ts      # HTTP client — logs in once, resolves its kiln membership
└── docs/
    └── IMPLEMENTATION_PLAN.md  # this file
```

## 14. Build Roadmap

1. **Phase 1 — Foundation**: DB schema, REST skeleton, socket wiring, dashboard shell with live production/stock charts. ✅
2. **Phase 2 — Auth & Multi-kiln**: JWT login, per-kiln membership, kiln switcher for owners with multiple bhattas. ✅
3. **Phase 3 — People, Ledger & Attendance**: driver/supplier/labour/thekedar/partner/worker/helper records, DUE/PAID ledger, face-scan + geofenced attendance kiosk. ✅
4. **Phase 4 — Soil-to-Brick Pipeline**: soil procurement + JCB/royalty/tubewell expenses, pathai piece-rate molding, drying wastage, gang-wise bharai into kiln chambers with a live oval map, molded-vs-stacked reconciliation/dispute alert. ✅
5. **Phase 5 — Reliability**: referential-integrity checks on every cross-entity reference, crash-safe async error handling, Hindi/English UI. ✅
6. **Phase 6 — Land, Advances & Legal Risk**: khet depth-dispute tracking, advance/peshgi recovery + absconding flag, drying-yard capacity warning, PCB/royalty/Zig-Zag renewal alerts, JCB/tubewell per-hour cost + petty-cash (roznamcha) categories. ✅
7. **Phase 7 — Dispatch & Thekedar contracts**: Dispatch module built out (it was schema-only before — no API/UI existed), linked to a Driver; ProductionLog linked to a Thekedar contract with auto-ledger via `contractRate`; Overview's stat cards wired to real data (two were hardcoded placeholders before this pass). ✅
8. **Phase 8 — Reliability audit**: swept every prior request against the actual code — found and fixed a Mongoose `id`/`_id` JSON-serialization bug (`ProductionLog`, only surfaced once a real payload was traced through, not caught by type-checking), missing real-time listeners on 6 pages (backend emitted the events, nothing subscribed), missing kiln-switch refetching on 8 data-fetching effects, and a socket-identity bug where switching kilns would silently orphan every live listener. Full findings below and in the conversation summary. ✅
9. **Phase 9 — Firing (Pakayi)**: fire round-speed tracking, multi-fuel purchase with weighbridge fraud detection, daily feeding + efficiency/high-consumption alert, chamber grading (A-1/Jhama/Pela/Roda) driving finished-goods stock + recovery %, fitter shift/handover log with OT/bonus, kiln incident log (crack/weather/electrical) auto-posting to Expense, finished-goods (blind-dispatch) reconciliation, Kharchi/medical-advance quick actions on the existing ledger. ✅
10. **Phase 10 — Dispatch-to-delivery, Customer credit, Fleet & Financial Reporting**: `CUSTOMER` person type with credit-aging panel + polarity-aware ledger UI; gate-pass slip number, grade, payment mode, transport cost on every dispatch; delivery-adjustment (breakage/return) flow that refunds the customer ledger and restocks finished goods; palledar loading-count entries with count-mismatch fraud flag; `Machine` fleet registry (tractors/JCB/Pug Mill/generators/pumps/…) with per-machine fuel-consumption baseline alert and maintenance/downtime logging auto-posting to Expense; physical stock audit (register vs. hand-count variance); simplified season financial summary (revenue/expenses/labor/net profit) and per-chamber cost report; quick-select presets for the long tail of daily petty-cash categories (chai-nashta, stationery, puja, first-aid, conveyance, hardware). ✅
11. **Phase 11 — Sync Engine hardening**: conflict resolution edge cases beyond simple retry, local-first UI for munim terminal (can be a small Electron or local web app).
12. **Phase 12 — Remaining business features**: PDF reports, partner profit-share statements, liveness check for face attendance.
13. **Phase 13 — Polish**: empty/loading states throughout, dark/light theme toggle, PWA offline shell for the dashboard itself, full i18n coverage across every screen. Main JS bundle is 846KB (242KB gzip) as of Phase 10 and growing with each module — code-splitting per-page (`React.lazy`) is worth doing here if it crosses ~1.2MB.

### Documented but not yet built

A few ground-level realities from the full soil-to-kiln-to-delivery
walkthrough are worth keeping as reference even though they didn't turn into
a distinct model or screen in this pass — either because they're pure
operational/political process (no software artifact needed), because they'd
need infrastructure this project doesn't have (GPS/telematics hardware),
or because they overlap enough with what's already built that a dedicated
feature would be premature:

- **Trial molding / soil quality test** — the owner test-molds a sample
  brick from new soil before committing to a khet. Could become a
  `soilQualityRating` field on `Person`(LANDOWNER) or the first `SoilTrip`
  if this becomes a recurring formal step; for now it's a manual on-site
  judgment call before the khet is even added to the system.
- **Field pre-softening (flooding before excavation)** — the water/diesel
  cost for this is already trackable via `Expense` (`WATER` or
  `TUBEWELL_DIESEL` category); a dedicated "pre-dig watering" step wasn't
  modeled separately from that.
- **Transit hazards, local road damage, informal police/panchayat
  friction** — `LOCAL_CHANDA` and `PETTY_CASH` expense categories capture
  the *cost* side of this; the operational/negotiation side is inherently
  a human judgment call, not a software workflow.
- **Labor colony (jhuggi) housing setup** — `LABOR_COLONY` expense category
  captures the water/electricity cost; physical housing logistics aren't
  tracked as inventory.
- **Inter-state gang recruitment/brokerage** — covered by the existing
  `LABOUR_CONTRACTOR` person type + the advance-recovery ledger (§6.F);
  a dedicated "recruitment season" workflow wasn't built separately.
- **Full P&L with depreciation & partner auto-profit-split** — §6.K's
  season summary is intentionally simplified (revenue − expenses − labor).
  A real P&L would need asset depreciation schedules, per-batch soil/molding
  cost allocation, and each `PARTNER.profitSharePercent` auto-computing a
  settlement statement rather than being a manual withdrawal note on their
  ledger. Worth building once the simplified numbers are trusted in
  day-to-day use — building the complex version first, before the basic one
  is validated against real books, risks getting the allocation rules wrong
  unnoticed.
- **Yard/location master** — dispatches, stock, and stock audits all use
  free-text item names; there's no separate "yard A / yard B / godown"
  location entity. Fine at single-site scale; would matter if a kiln starts
  tracking stock across multiple physical storage locations.
- **Union rate-fixing / MSP lock & diesel-price-linked dynamic freight** —
  labor rates and transport costs are entered per-transaction as whatever
  was actually paid; there's no "current union-mandated rate" or "today's
  diesel index" reference the UI checks entries against. This is a market
  data feed problem more than a data-modeling one.
- **Ghost-trip / ghost-shift detection via GPS or telematics** — the
  fraud-detection patterns built here (loading count mismatch, fuel
  consumption baseline, weighbridge shortfall, finished-goods reconciliation)
  all work from numbers someone already typed in. Detecting a delivery that
  was logged but never actually happened needs vehicle GPS/telematics
  hardware this project doesn't assume exists — out of scope for a
  software-only system.
- **Local extortion / goonda-tax / union boycott tracking** — the cost side
  is captured wherever it's paid (`LOCAL_CHANDA`, `PETTY_CASH`, or a driver's
  `Expense`); there's no dedicated "informal payment" category distinct from
  ordinary petty cash, since formally categorizing extortion payments in a
  business system raises its own problems beyond this project's scope.
- **Double book-keeping (kachha vs. pakka register) enforcement** — the
  `paymentMode` field on `Dispatch` (§6.G) makes the cash/GST split visible
  per transaction, but the system doesn't (and shouldn't) attempt to
  reconcile or flag a deliberate second set of books — that's a business
  decision, not a data-integrity bug the software should be policing.
- **Electricity meter-tampering raid tracking** — `ELECTRICAL_FAILURE`
  incidents (§6.H) cover motor/transformer breakdowns; a discom
  inspection/penalty event wasn't modeled as a distinct incident type since
  it hasn't come up as a recurring logged event yet — would fit naturally as
  another `KilnIncident` type if needed.
- **Moisture/shrinkage weight-loss adjustment on fuel** — `FuelPurchase`
  compares invoiced vs. actual weighbridge weight (§6.H) for fraud detection,
  but doesn't separately account for legitimate moisture loss between
  purchase and use; a coal pile losing a few % to drying isn't distinguished
  from a shortfall worth investigating. Would need a tolerance band tuned to
  the specific fuel type to do properly.

## 15. Getting Started

No Docker required. `MONGODB_URI` can point to any MongoDB — a free
[Atlas](https://mongodb.com/atlas) cluster is the fastest way to start, or a
MongoDB already installed on a VPS / the client's own server.

```bash
# 1. Backend — set MONGODB_URI in .env to your MongoDB connection string
cd backend && cp .env.example .env
npm install
npm run dev        # http://localhost:4000

# 2. Frontend
cd frontend && cp .env.example .env
npm install
npm run dev         # http://localhost:5173 — click "New bhatta? Set one up" to register
```

Once logged in: Settings → set the chamber count and the attendance geofence,
then People → add your landowners, drivers, workers, etc. before using Soil,
Molding, or Stacking (their forms need at least one matching `Person` to
select from — this is the referential-integrity rule from §7 in practice).

### Face-scan attendance model weights

Download the `tiny_face_detector`, `face_landmark_68`, and
`face_recognition` weight files from the
[face-api.js weights repo](https://github.com/justadudewhohacks/face-api.js/tree/master/weights)
and place them in `frontend/public/models/` (create the folder). They're
served as static files, so this works identically whether the frontend is
hosted in the cloud or on a client's own server — no external CDN call at
runtime. `VITE_FACE_MODELS_URL` (default `/models`) can instead point at a
CDN URL if you'd rather not bundle the weights.

### Connecting the sync engine

1. In the dashboard (or via `POST /api/auth/register`), create the owner
   account — this also creates the `Kiln`.
2. Register a second account scoped to that same kiln for the on-site
   machine to use (pass the existing `kilnId` instead of `kilnName`):

   ```bash
   curl -X POST http://localhost:4000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"name":"Site Munim","email":"munim@ramgarh-bhatta.example","password":"change-this-password","kilnId":"<kilnId from step 1>","role":"MUNIM"}'
   ```

3. Put those credentials in `sync-engine/.env` as `SYNC_EMAIL` /
   `SYNC_PASSWORD`, then:

   ```bash
   cd sync-engine && cp .env.example .env
   npm install
   npm run dev
   ```

The demo generator (`DEMO_MODE=true`) will start pushing simulated
production/stock entries within a few seconds, and the dashboard updates
live via Socket.io.

## 16. Deployment Models — Portability

The same codebase supports two business models without any code changes —
only environment variables differ.

### A. Hosted SaaS (multi-client, cloud)

- Backend + MongoDB run centrally (Hostinger VPS, Railway, Render, DigitalOcean,
  AWS — any host that runs Node.js persistently; note that **shared hosting
  plans generally can't run a long-lived Node/Socket.io process** — you need a
  VPS or an app-hosting platform, not shared/cPanel hosting).
- MongoDB itself can be Atlas (managed, zero ops) or self-installed on the
  same VPS.
- Each kiln site runs the `sync-engine` locally and pushes to the central
  server's public URL over the internet.
- Multiple bhatta owners/clients share the same backend deployment
  (kiln membership scopes all data), which is the standard SaaS shape.

### B. Client's own server (single-tenant, on-premise)

- Deploy the exact same `backend/` + `frontend/` build **inside the client's
  own network** — their office PC, a local server, or their own VPS.
- Point `MONGODB_URI` at a MongoDB instance installed on that same machine
  (or any reachable one) instead of Atlas.
- Kiln-site `sync-engine` instances point `API_URL` at the local server's LAN
  IP instead of a public domain — sync still works the same way, just over
  LAN instead of the internet.
- No internet dependency at all if the client wants a fully offline,
  self-contained deployment — dashboard, API, and DB all sit on their
  network. Face-scan attendance still works offline too, since the model
  weights are served locally (see §15).

### Why MongoDB was chosen for this

Postgres would work too, but MongoDB's document model tolerates the schema
variation that shows up in practice (different `Person` types carrying
different optional fields, different kilns tracking different stock item
names) without a migration step. Both MongoDB and the SQLite local layer are
plain open-source software with no cloud lock-in, so relocating the whole
system to a different host, or handing it entirely to a client's IT person,
is a config change, not a rewrite.
