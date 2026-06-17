# Handoff: Qualification Demo Refactor

## Context

This is a refactor brief for the **Pareto Qualification Agent** demo, located in `1 Qualification/`. The app is a full-stack React + Node + SQLite app. Run it with `npm run dev` from that folder. The existing code is a working starting point — the goal is to simplify and redirect it, not rebuild from scratch.

Read `1 Qualification/CLAUDE.md` for the full architecture, file map, and current demo flow before touching anything.

---

## What to Remove

### 1. Kill the entire data normalization layer

The current demo has a "Setup" screen where a user uploads a CSV and an agent maps messy raw columns to a canonical schema. **Remove this entirely.**

- Delete or gut `server/src/normalizer/` — the normalizer, transforms, and related routes
- Delete the `raw_accounts` table from the DB schema (`server/src/db/schema.ts` and `server/src/db/init.ts`)
- Remove the Setup screen from the frontend (`client/src/components/Setup/`)
- Remove the `/api/setup` route from `server/src/routes/setup.ts` and its mount in `server/src/index.ts`
- The app should open directly to the dashboard — no onboarding flow

**Assumption going forward:** data arrives already normalized. The seed script writes clean, normalized data directly into the `accounts` table. No raw layer, no mapping step.

### 2. Remove the churn model click-through

The current ML modal (`ChurnModelModal.tsx`) lets users click into SHAP values. Remove this interactivity. The churn signal is now a simple deterministic rule (see below) — no model, no modal, no ML button on rows.

---

## What to Change

### 3. Fix synthetic data — ARR and seat counts

Rewrite `server/src/db/seed.ts` with these constraints:

- **No account should have ARR above $10,000**
- Average pricing is **~$50 per seat per month** (so ARR ≈ seats × $50 × 12), with ±30% randomness per account
- Seat counts should be realistic for a small-to-mid-market product (think 5–50 seats per account)
- Keep ~800 accounts, keep tiers (Starter / Growth / Enterprise) and products (Core Platform, Growth Suite, Enterprise Suite, Core Platform + Analytics)
- Pricing per product can vary, but the $50/seat average should hold across the board

**Compute ARR from seats, not the other way around.** `arr = seat_count * monthly_price_per_seat * 12`, where `monthly_price_per_seat` varies ±30% around $50.

### 4. Add a `tone` field to synthetic data

Add a `tone` column to the `accounts` table (integer, 0–2):
- `2` = Positive
- `1` = Neutral
- `0` = Bad (at-risk)

Seed it with a realistic distribution — most accounts neutral or positive, a minority bad.

### 5. Fix renewal date distribution — no account closer than 120 days

**Remove all accounts with fewer than 120 days to renewal.** The concept is that accounts closer than 120 days have already been handled in prior daily checks. Every account in the seed should have `contract_end_date` at least 120 days from now. Spread the remaining accounts across 121–540 days out.

**Seed exactly ~20 accounts at exactly 120 days from today** (call it "the 120-day cohort"). These are the accounts that surface when daily checks run — the whole point of the demo is watching these bubble up. Distribute them across the signal types described in the qualification rules below so every playbook type is represented in the cohort. "Exactly 120 days" means `contract_end_date = today + 120 days` to the day — no buffer, no ±3 days. The daily check logic should match on `days_to_renewal == 120` exactly (compute `Math.round((end - now) / 86400000) === 120`).

### 6. Add targeted usage outliers in the seed

Within the full 800-account set (which includes the 120-day cohort), explicitly seed:
- **5–8 accounts with `seats_active / seat_count` < 50%** (churn risk) — spread across various renewal distances, not all in the 120-day cohort
- **5–8 accounts with `seats_active / seat_count` > 125%** (over capacity / expansion signal) — same, spread out
- Some of the 120-day cohort accounts may also have these usage patterns — that's fine and demonstrates churn taking priority over renewal timing

---

## New Qualification Logic

Replace the current `server/src/engine/engine.ts` rules with this simplified playbook. **No AI, no LLM calls — pure deterministic rules.**

### Churn flag (anytime, not renewal-gated)

```
IF seats_active / seat_count < 0.50 → signal: "churn_risk", action: "Flag Rep"
```

This fires regardless of how far the account is from renewal. The rep needs to know now.

### Over-capacity (anytime, not renewal-gated)

```
IF seats_active / seat_count > 1.25 → signal: "expansion_ready", action: "Upsell Seats"
```

Again, fires anytime — doesn't require being in the 120-day window.

### 120-day renewal cohort rules (only for accounts where `days_to_renewal == 120` exactly)

For accounts that have entered the 120-day window, apply these in order (first match wins):

1. **Pricing upsell** — `arr / seat_count` is significantly below the median ARR-per-seat for all accounts on the same product:
   ```
   IF (arr / seat_count) < 0.75 × median_arr_per_seat_for_product → action: "Pricing Upsell"
   ```

2. **Product upsell** — on a lower-tier product AND tone is positive:
   ```
   IF product IN ('Core Platform', 'Growth Suite') AND tone == 2 → action: "Product Upsell"
   ```
   (Enterprise Suite and Core Platform + Analytics are considered top-tier — no upsell to offer)

3. **Flat renewal** — default if neither of the above:
   ```
   → action: "Flat Renewal"
   ```

### Signal colors
- Churn risk → red
- Expansion (seat upsell) → green
- Pricing upsell → amber
- Product upsell → green
- Flat renewal → blue/neutral

---

## Dashboard Changes

### "Simulate Daily Checks" button

When clicked:
1. **Only bubble up** accounts that are in the 120-day cohort **plus** any accounts flagged for churn risk or expansion (sub-50% or over-125% usage) whose signal has changed since last check
2. Re-run the qualification engine across all accounts
3. Animate newly-surfaced accounts to the top with a "NEW" badge
4. Accounts outside the 120-day window with no usage flag should not appear / move

The table should still show all accounts but **sort by: NEW first, then by signal priority** (churn risk → expansion → pricing upsell → product upsell → flat renewal → everything else).

### Recommendation display

Each row in the account table should show the recommended action prominently — large, colored text, not just a small badge. Something like:

| Account | ARR | Seat Usage | Days to Renewal | **Playbook** |
|---|---|---|---|---|
| Acme Corp | $7,200 | 143% | 120 | **Upsell Seats** |
| Globex | $3,600 | 38% | 180 | **Flag Rep** |
| Initech | $6,000 | 82% | 120 | **Flat Renewal** |

---

## New Screen: Renewal Manager Dashboard

Add a button on the main dashboard labeled **"Renewal Manager View"** that opens a new page (or full-screen modal). This page is the manager's summary — not account-level detail, but a rolled-up plan.

### Layout

**Header:** "Renewal Manager Dashboard — [current date]"

**Summary cards (one per category):**

Each card shows:
- Category name (e.g., "Churn Risk")
- Number of accounts in that category
- Combined current ARR for those accounts
- Projected ARR outcome (see below)
- A "View Accounts →" link

Categories:
1. **Churn Risk** — sub-50% usage accounts
2. **Upsell Seats** — over-125% usage accounts
3. **Flat Renewal** — 120-day cohort, flat
4. **Pricing Upsell** — 120-day cohort, price below median
5. **Product Upsell** — 120-day cohort, lower product + positive tone

**ARR projection logic (simple, rule-based):**
- Churn Risk: projected ARR = 0 (assume loss if not addressed) — show in red
- Upsell Seats: projected ARR = current ARR × 1.25 (assume 25% seat increase)
- Flat Renewal: projected ARR = current ARR (no change)
- Pricing Upsell: projected ARR = current ARR × 1.15 (assume 15% price lift)
- Product Upsell: projected ARR = current ARR × 1.20 (assume 20% tier bump)

**Bottom summary bar:**
```
Current total ARR: $X   →   Projected ARR: $Y   (Δ +$Z, +N%)
```

### Click-through level 1 — Account list (per category)

Clicking "View Accounts →" on any summary card opens a panel or sub-page showing a table of the accounts in that category. Keep it lean — just the key values:

| Account | ARR | Seat Usage | Tone | Primary Signal | Brief Reason |
|---|---|---|---|---|---|
| Acme Corp | $7,200 | 38% | Neutral | Flag Rep | Usage 38% < 50% threshold |
| Globex | $4,800 | 143% | Positive | Upsell Seats | Usage 143% > 125% capacity |

Columns:
- **Account** — name
- **ARR** — current ARR
- **Seat Usage** — `seats_active / seat_count` as a percentage
- **Tone** — Positive / Neutral / Bad
- **Primary Signal** — the playbook label (Flag Rep, Upsell Seats, Flat Renewal, Pricing Upsell, Product Upsell)
- **Primary Reason** — a single short data-driven phrase that explains the signal. This is a templated string, not AI-generated. Examples:
  - `"Usage 38% < 50% threshold"`
  - `"Usage 143% > 125% capacity"`
  - `"Price $41/seat vs. $58 median for Core Platform"`
  - `"Lower-tier product (Growth Suite) + Positive tone"`
  - `"Usage 74%, price at median — flat renewal"`

Each row should have a **"View Renewal Plan →"** button.

### Click-through level 2 — Renewal Plan (per account)

Clicking "View Renewal Plan →" opens a full-page view styled to look like a professional black-and-white printed document — clean, minimal, no color except the Pareto logo. Think PDF export aesthetic: white background, serif or clean sans-serif font, clear section headers, subtle dividers. **Do not use any color accents on this page.** It should feel like something you'd print and hand to a manager.

This view replaces / reuses the existing Rep Brief slide-out. Sections:

**1. Account Header**
- Account name (large)
- Product, Tier, Tone
- Contract start date → Contract end date (duration)
- Days to renewal

**2. Recommendation (prominent)**
- Playbook action in large text: e.g. "RECOMMENDED: Pricing Upsell"
- 3–5 sentence written rationale explaining why, built from real data values via templates. Example for Pricing Upsell:
  > "Acme Corp is currently paying $41 per seat annually, which is 29% below the $58 median for Core Platform accounts. With 12 active users across 14 licensed seats (86% utilization) and a neutral engagement tone, this account is a strong candidate for a pricing correction at renewal. Recommend presenting a revised rate of $55–$60/seat, framing the increase around product value delivered over the contract term."

**3. Key Metrics**
- ARR, MRR, Seat Count, Seats Active, Usage %, Logins (90d), Support Tickets, # Previous Contracts

**4. ARR History**
- The existing ARR trend chart (reuse the recharts component from the current Rep Brief)

**5. Contract History**
- A simple table showing prior contracts: Contract #, Start Date, End Date, ARR, Churned (Y/N)
- Derive this from the `historical_arr` table — use quarters as proxy rows if full contract records aren't available

**No AI generation needed anywhere on this page.** Every sentence in the rationale should be a template string assembled from the account's actual field values. Write one template per playbook type (5 total). The templates should read naturally with the values interpolated in.

---

## What Does NOT Need to Change

- The overall design system (white background, orange accent, framer-motion animations) — keep for all screens except the Renewal Plan PDF view which is black and white only
- The database + Drizzle ORM setup
- The `npm run dev` startup flow
- The ARR trend recharts component — reuse it inside the Renewal Plan view
- The Agent Console — keep it

The current Rep Brief slide-out can be retired or repurposed as the Renewal Plan full-page view. Do not keep both.

---

## Acceptance Criteria

- [ ] App starts with `npm run dev` from `1 Qualification/` with no errors and no Anthropic API key required
- [ ] No Setup / normalization screen — app opens directly to the account dashboard
- [ ] All accounts have ARR ≤ $10,000; seat counts and ARR are internally consistent at ~$50/seat
- [ ] No account is closer than 120 days to renewal
- [ ] Exactly ~20 accounts have `contract_end_date = today + 120 days` to the day
- [ ] 5–8 accounts have usage < 50%, 5–8 accounts have usage > 125%, spread across the full dataset
- [ ] "Simulate Daily Checks" surfaces only: the 120-day cohort + any account with usage < 50% or > 125%
- [ ] Every surfaced account shows a prominent playbook recommendation label
- [ ] Churn risk (< 50% usage) takes priority over all other signals regardless of renewal timing
- [ ] Renewal Manager Dashboard: button on main dashboard, opens full summary page with 5 category cards + ARR math
- [ ] Clicking a category card shows the account list table with Primary Signal, Primary Reason, and "View Renewal Plan →" per row
- [ ] Clicking "View Renewal Plan →" opens a black-and-white PDF-style full page with: recommendation, rationale (templated), key metrics, ARR chart, contract history table
- [ ] All rationale text is template-generated from real data values — no hardcoded strings, no AI calls
