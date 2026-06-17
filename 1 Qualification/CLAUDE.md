# CLAUDE.md — 1 Qualification

This folder contains the **Pareto Qualification Agent**, a full-stack web app that is the working demo for the Qualification stage of the AM renewal lifecycle (~120 days out).

## What this app does

Takes raw, messy CRM + usage data, normalizes it to a canonical schema, runs an XGBoost churn model and a qualification engine, and surfaces each account's renewal signal (churn risk / underutilizing / expansion-ready / healthy) in an interactive dashboard.

## Structure

```
client/   React + Vite + TypeScript + Tailwind + shadcn/ui + framer-motion + recharts
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

Database seeds automatically on first start (~800 synthetic accounts). Set `ANTHROPIC_API_KEY` in your environment for live LLM streaming; without it the agent falls back to fast pattern matching.

## Canonical data schema (frozen — do not rename these fields)

| Field | Type | Notes |
|---|---|---|
| `arr` | number | Annual Recurring Revenue |
| `mrr` | number | Monthly Recurring Revenue |
| `seat_count` | number | Seats purchased |
| `seats_active` | number | Seats in active use |
| `logins_90d` | number | Login events last 90 days |
| `support_ticket_count` | number | Open + recent tickets |
| `num_previous_contracts` | number | Count of prior contracts |
| `contract_start_date` | date | ISO date |
| `contract_end_date` | date | ISO date (= renewal date) |
| `contract_length_days` | number | Derived from start/end |
| `tier` | string | Starter / Growth / Enterprise |
| `product` | string | Product line name |
| `feature_adoption_score` | number | 0–1 |
| `churned` | boolean | Ground-truth churn label |

Raw synthetic data intentionally uses dirty column names (`monthly_revenue`, `contract_period` as `MM/DD/YYYY - MM/DD/YYYY`) so the normalization agent has something real to extract and map.

## Key server modules

| File | Purpose |
|---|---|
| `server/src/engine/engine.ts` | Qualification engine — pure functions, takes account + threshold config, returns signal + reasons |
| `server/src/ml/churnModel.ts` | XGBoost churn model (binary) + SHAP values |
| `server/src/normalizer/normalizer.ts` | Schema matching agent — maps raw columns to canonical schema with confidence scores |
| `server/src/normalizer/transforms.ts` | Field extraction logic (e.g. parse date-range string → start/end/length) |
| `server/src/db/seed.ts` | Synthetic data generator (~800 accounts, intentionally messy) |
| `server/src/db/schema.ts` | Drizzle ORM schema — source of truth for DB shape |
| `server/public/sample_column_descriptions.csv` | Sample file for the Setup screen's schema normalization demo |

## Demo flow

1. **Setup → Connect Data** — simulated CRM + warehouse connection
2. **Setup → Schema Normalization** — upload (or use sample) `column_descriptions.csv`; agent maps columns live with confidence scores; type a correction in plain English (e.g. *"multiply usage data by 100"*) to watch it recompute
3. **Dashboard** — account table with qualification signals and churn predictions
4. **Simulate Daily Checks** — mutates random accounts server-side, re-runs engine, bubbles NEW badges with animation
5. **Agent Console** — type rule changes in plain English (e.g. *"lower the underutilizing bar to 55%"*); streams reasoning, updates thresholds, re-runs across all accounts
6. **Rep Brief** — click any account for ARR trend chart, stat cards, upsell section, narrative
7. **Churn ML modal** — click ML ↗ on a Churn Risk account for SHAP analysis

## Qualification engine rules (defaults, all configurable)

- **Churn Risk (red):** utilization > 100% AND renewal < 30 days, OR near-zero logins in last 14 days
- **Underutilizing (amber):** `seatsActive / seatsPurchased < 0.75` (threshold is configurable via Agent Console)
- **Expansion Ready (green):** sustained utilization ≥ 100%, or new feature released since last renewal, or ARR above product median
- **Renewal Prep (amber):** inside 120-day renewal window
- **Healthy (green):** everything else

## Tests

```bash
npm test
```

Unit tests cover the qualification engine (`engine.test.ts`), churn model (`model.test.ts`), and schema normalizer (`normalizer.test.ts`).
