# Pareto — Qualification Agent

AI-driven renewal & expansion command center for B2B SaaS customer success teams.

## Architecture

```
client/   React + Vite + TypeScript + Tailwind + framer-motion + recharts
server/   Node + Express + SQLite (better-sqlite3) + Drizzle ORM
```

Data pipeline: Raw messy CRM data → Schema Normalization Agent → XGBoost Churn Model → Qualification Engine → Dashboard

## Prerequisites

- Node.js 18+
- `ANTHROPIC_API_KEY` (optional — falls back to intelligent pattern matching)

## Run

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

The database seeds automatically on first start (~800 synthetic accounts).

## Demo Flow

1. **Connect Data** — click Connect CRM + Connect Warehouse (simulated)
2. **Schema Normalization** — click "Use Sample File" to watch the agent map raw columns to canonical schema with confidence scores. Try editing: *"multiply usage data by 100"*
3. **Dashboard** — all accounts with qualification signals, churn predictions
4. **Simulate Daily Checks** — mutates random accounts, re-runs engine, bubbles NEW badges
5. **Agent Console** — type *"lower the underutilizing bar to 55%"* to change thresholds live
6. Click any account → **Rep Brief** slide-out with ARR trend chart
7. Click **ML ↗** on a Churn Risk account → SHAP analysis modal

## API Key (optional)

Set `ANTHROPIC_API_KEY` in your environment for live LLM streaming. Without it, the agent uses fast pattern matching with simulated streaming.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

## Tests

```bash
npm test
```

## Schema

The canonical normalized schema (frozen):
- `arr`, `mrr`, `seat_count`, `seats_active`, `logins_90d`
- `support_ticket_count`, `num_previous_contracts`
- `contract_start_date`, `contract_end_date`, `contract_length_days`
- `tier`, `product`, `feature_adoption_score`, `churned`

Raw data intentionally uses messy columns (`monthly_revenue` instead of ARR, `contract_period` as date range string) to demonstrate the normalization agent.
