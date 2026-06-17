# CLAUDE.md — 1 Qualification

This folder contains the **Pareto Qualification Agent**, a full-stack web app demo for the Qualification stage of the AM renewal lifecycle (~120 days out).

## What this app does

Surfaces renewal signals for ~780 synthetic accounts using a deterministic qualification engine (no ML, no LLM, no onboarding flow). An AM lands directly on a dashboard, simulates daily checks to see which accounts need attention, and can drill through to a Renewal Manager view and per-account Renewal Plans.

## Structure

```
client/   React + Vite + TypeScript + Tailwind + Framer Motion + Recharts
server/   Node + Express + SQLite (better-sqlite3) + Drizzle ORM
```

## Running the app

```bash
cd "1 Qualification"
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

**If you need to reseed the database**, delete `server/pareto.db` before starting — `CREATE TABLE IF NOT EXISTS` will not add new columns to an existing DB. The seed runs automatically on first start.

Set `ANTHROPIC_API_KEY` in your environment for live LLM streaming in the Agent Console; without it the agent falls back to fast pattern matching.

## Demo flow

1. **Dashboard** — opens directly (no setup screens). ~780 accounts sorted by NEW badge, then signal priority. Columns: Account, ARR, Seat Usage bar, Tone pill, Playbook (signal), Reasons.
2. **Simulate Daily Checks** — re-runs the qualification engine server-side and surfaces the 20 "120-day cohort" accounts + usage outliers (churn < 50%, expansion > 125%) with NEW badges and animation.
3. **Agent Console** — type threshold changes in plain English (e.g. *"set churn threshold to 40%"*); streams LLM reasoning, updates config in DB, re-runs engine across all accounts.
4. **Renewal Manager View** — 5 category cards (Churn Risk, Expansion Ready, Flat Renewal, Pricing Upsell, Product Upsell) with current ARR, projected ARR, and delta. Bottom bar shows total current → projected ARR.
5. **Category drill-down** — account list for one category: ARR, seat usage %, tone, signal, reason, "View Renewal Plan →".
6. **Renewal Plan** — PDF-aesthetic black-and-white page. Sections: Account Header, Recommendation (templated rationale), Key Metrics (8-cell grid), ARR History chart, Contract History table.

## Qualification engine rules (defaults, all configurable via Agent Console)

| Signal | Trigger | Color | Action |
|---|---|---|---|
| `churn_risk` | `seats_active / seat_count < 0.50` | red | Flag Rep |
| `expansion_ready` | `seats_active / seat_count > 1.25` | green | Upsell Seats |
| `pricing_upsell` | 120-day cohort + `arr/seat_count < 0.75 × product_median` | amber | Pricing Upsell |
| `product_upsell` | 120-day cohort + lower-tier product + tone = Positive | green | Product Upsell |
| `flat_renewal` | 120-day cohort + no other signal | blue | Flat Renewal |
| `null` | All other accounts | — | No action |

Churn and expansion fire regardless of days-to-renewal. The cohort rules (pricing/product/flat) only fire at exactly `renewal_window_days` (default 120).

**Configurable keys** (stored in `qualification_config` DB table):
- `churn_usage_threshold` — default 0.50
- `expansion_usage_threshold` — default 1.25
- `pricing_upsell_ratio` — default 0.75
- `renewal_window_days` — default 120

## Seed data shape

- ~760 "bulk" accounts: contract end dates 121–540 days out, never < 120
- Exactly **20 cohort accounts** at `today + 120 days`: 4 churn, 4 expansion, 4 pricing_upsell, 4 product_upsell, 4 flat_renewal (approximate — exact counts depend on engine thresholds)
- ~12 usage outliers spread across the bulk set (6 churn < 50%, 6 expansion > 125%)
- `seat_count`: 5–50, `arr` ≤ $10,000, `monthly_price_per_seat` ≈ $50 ± 30%
- `tone`: 0 = Bad (~10%), 1 = Neutral (~45%), 2 = Positive (~45%)
- Products: `Core Platform`, `Growth Suite`, `Enterprise Suite`, `Core Platform + Analytics`

## Canonical account schema

| Field | Type | Notes |
|---|---|---|
| `account_id` | string | UUID |
| `account_name` | string | |
| `arr` | number | Annual Recurring Revenue |
| `mrr` | number | Monthly Recurring Revenue |
| `seat_count` | number | Seats purchased |
| `seats_active` | number | Seats in active use |
| `logins_90d` | number | Login events last 90 days |
| `support_ticket_count` | number | Open + recent tickets |
| `num_previous_contracts` | number | Count of prior contracts |
| `contract_start_date` | string | `YYYY-MM-DD` |
| `contract_end_date` | string | `YYYY-MM-DD` (= renewal date) |
| `contract_length_days` | number | Derived from start/end |
| `tier` | string | Starter / Growth / Enterprise |
| `product` | string | Core Platform / Growth Suite / Enterprise Suite / Core Platform + Analytics |
| `tone` | number | 0 = Bad, 1 = Neutral, 2 = Positive |

## Key files

| File | Purpose |
|---|---|
| `server/src/engine/engine.ts` | Deterministic qualification engine — pure functions, returns signal + reasons |
| `server/src/engine/engine.test.ts` | 17 unit tests covering all 5 signal types + null + medians + day math |
| `server/src/db/seed.ts` | Two-phase seed: bulk accounts → compute medians → craft cohort accounts |
| `server/src/db/schema.ts` | Drizzle ORM schema — source of truth for DB shape |
| `server/src/db/init.ts` | Creates tables on startup |
| `server/src/routes/accounts.ts` | REST endpoints: list, simulate-daily, renewal-manager, renewal-plan, historical-arr |
| `server/src/routes/agent.ts` | SSE endpoint for Agent Console; parses natural language → config updates |
| `server/src/index.ts` | Server entry: init → seed → run engine → mount routes |
| `client/src/App.tsx` | Navigation state machine (`Screen` union type — no React Router) |
| `client/src/lib/api.ts` | Typed API client for all server endpoints |
| `client/src/components/Dashboard/` | Dashboard, AccountTable, AgentConsole |
| `client/src/components/RenewalManager/` | RenewalManagerDashboard, RenewalManagerAccountList |
| `client/src/components/RenewalPlan/RenewalPlanView.tsx` | PDF-aesthetic renewal plan page |
| `client/src/components/RepBrief/ArrChart.tsx` | ARR trend chart (reused by RenewalPlanView) |

## Navigation state machine (App.tsx)

```typescript
type Screen =
  | { view: 'dashboard' }
  | { view: 'renewal-manager' }
  | { view: 'renewal-manager-list'; category: string }
  | { view: 'renewal-plan'; accountId: string; from: 'dashboard' | 'renewal-manager-list' }
```

No React Router — `navigate(screen)` is passed as a prop down the tree.

## ARR projection multipliers (renewal-manager endpoint)

| Signal | Multiplier |
|---|---|
| `churn_risk` | × 0 (lost) |
| `expansion_ready` | × 1.25 |
| `flat_renewal` | × 1.0 |
| `pricing_upsell` | × 1.15 |
| `product_upsell` | × 1.20 |

## Date math gotcha

All day calculations use **UTC date-only** math to avoid timezone off-by-ones:

```typescript
const end = new Date(endDate + 'T00:00:00Z');
const now = new Date();
const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
return Math.round((end.getTime() - todayUTC) / 86400000);
```

Both seed and engine use this pattern. The 120-day cohort match (`days === 120`) is exact.

## Tests

```bash
cd "1 Qualification/server"
npx vitest run
```

17 tests in `engine.test.ts`. No other test files — the old `model.test.ts` and `normalizer.test.ts` were deleted with the ML/normalizer code.
