# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context

This repo supports the **Account Manager (AM) renewal lifecycle** — a pipeline that helps AMs manage SaaS contract renewals from qualification through customer proposal. The pipeline begins ~120 days before renewal and is structured as four sequential stages.

---

## Pipeline Stages

### `1 Qualification/` — ~120 days out
AM assesses the renewal type and builds a forecast for approval.

- **Inputs:** customer usage data, previous contracts (PDF), external company news, contract terms (CRM), health score (CRM), support tickets
- **Goal:** Classify renewal as upsell / flat / downsell / churn risk
- **Output:** Renewal plan and forecast submitted to renewals manager for approval
- **CTA:** Get manager approval to reach out to the customer
- **Key pain point:** Gathering the right signals from disparate systems to properly assess the situation

---

### `2 Outreach/` — ~90 days out
AM initiates contact with the customer to open renewal discussions.

- **Inputs:** customer usage data, previous contract (PDF), renewal plan, previous emails (CRM), call recordings, contact enrichment (Clay/LinkedIn)
- **Output:** Email copy to customer to initiate renewal discussions (may include flat renewal contract)
- **Output (fallback):** If customer is unresponsive or champion has left — find and engage new contacts via Clay/LinkedIn
- **CTA:** Get a response from the customer to present renewal terms
- **Key pain point:** Low response rates; champion turnover requires a parallel re-engagement track

---

### `3 Validation/` — ~45–90 days out
AM (or SC/CSM) validates customer intent and uncovers renewal dynamics.

- **Inputs:** outreach response, renewal plan, customer usage data, previous contract (PDF), pricing chart
- **Goal:** Present the renewal story (price increase, expanded usage, etc.) and uncover customer plans (expansion, contraction)
- **Output:** Pricing proposal (PowerPoint)
- **Output (escalation):** Objection handling or escalation back to renewals manager
- **CTA:** Get customer to agree to engage in a renewal process
- **Key pain point:** Telling a compelling story; setting optimal price/terms to maximize ARR while leaving room to negotiate
- **Note:** This stage may be skipped for straightforward flat renewals and folded into Outreach

---

### `4 Evaluation/` — ~30–60 days out
Buyer evaluates, builds internal business case, and engages procurement.

- **Inputs:** previous contracts (PDF), new proposal, customer usage data, key contacts (CRM), pricing info, optional ROI calculator
- **Goal:** Give buyer everything needed to approve internally and engage in negotiation
- **Output:** Buyer renewal hub (microsite) with an AI chatbot agent available to answer questions
- **CTA:** Customer has enough information to enter negotiation
- **Key pain point:** Buyers go dark during internal approval; lack of transparency for the seller

---

## Notes

- Upstream of this pipeline is an **Implementation/Adoption** phase (120+ days out) driven by the customer, PS, or CSM — AM is in wait-and-see mode. Output of that phase is customer usage data that feeds into Qualification.
- As content and tooling are added to each folder, update this file with relevant file formats, data schemas, and automation conventions.
