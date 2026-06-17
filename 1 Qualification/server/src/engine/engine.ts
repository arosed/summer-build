export interface NormalizedAccount {
  account_id: string;
  account_name: string;
  arr: number;
  mrr: number;
  seat_count: number;
  seats_active: number;
  logins_90d: number;
  support_ticket_count: number;
  num_previous_contracts: number;
  contract_end_date: string;
  contract_length_days: number;
  contract_start_date: string;
  tier: string;
  product: string;
  feature_adoption_score: number;
  churned: number;
  tone: number;
}

export interface QualConfig {
  churn_usage_threshold: number;
  expansion_usage_threshold: number;
  pricing_upsell_ratio: number;
  renewal_window_days: number;
}

export type Signal =
  | 'churn_risk'
  | 'expansion_ready'
  | 'pricing_upsell'
  | 'product_upsell'
  | 'flat_renewal';

export type StatusColor = 'red' | 'green' | 'amber' | 'blue';

export interface QualResult {
  signal: Signal | null;
  status_color: StatusColor | null;
  recommended_action: string;
  reasons: string[];
}

export interface ProductMedians {
  [product: string]: number;
}

export function daysToRenewal(contractEndDate: string): number {
  const end = new Date(contractEndDate + 'T00:00:00Z');
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end.getTime() - todayUTC) / 86400000);
}

export function computeMedians(accts: NormalizedAccount[]): ProductMedians {
  const byProduct: Record<string, number[]> = {};
  for (const a of accts) {
    if (!byProduct[a.product]) byProduct[a.product] = [];
    if (a.seat_count > 0) byProduct[a.product].push(a.arr / a.seat_count);
  }
  const medians: ProductMedians = {};
  for (const [product, vals] of Object.entries(byProduct)) {
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medians[product] = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
  return medians;
}

const LOWER_TIER_PRODUCTS = new Set(['Core Platform', 'Growth Suite']);

export function qualify(
  account: NormalizedAccount,
  config: QualConfig,
  productMedians: ProductMedians
): QualResult {
  const usageRatio = account.seat_count > 0 ? account.seats_active / account.seat_count : 0;
  const usagePct = Math.round(usageRatio * 100);
  const days = daysToRenewal(account.contract_end_date);

  // Churn risk — fires anytime regardless of renewal date
  if (usageRatio < config.churn_usage_threshold) {
    return {
      signal: 'churn_risk',
      status_color: 'red',
      recommended_action: 'Flag Rep',
      reasons: [`Usage ${usagePct}% < ${Math.round(config.churn_usage_threshold * 100)}% threshold`],
    };
  }

  // Expansion ready — fires anytime
  if (usageRatio > config.expansion_usage_threshold) {
    return {
      signal: 'expansion_ready',
      status_color: 'green',
      recommended_action: 'Upsell Seats',
      reasons: [`Usage ${usagePct}% > ${Math.round(config.expansion_usage_threshold * 100)}% capacity`],
    };
  }

  // 120-day cohort rules (only for accounts exactly at the renewal window)
  if (days === config.renewal_window_days) {
    const pricePerSeat = account.seat_count > 0 ? account.arr / account.seat_count : 0;
    const medianPrice = productMedians[account.product] ?? pricePerSeat;
    const monthlyPerSeat = Math.round(pricePerSeat / 12);
    const medianMonthlyPerSeat = Math.round(medianPrice / 12);

    if (pricePerSeat < config.pricing_upsell_ratio * medianPrice) {
      return {
        signal: 'pricing_upsell',
        status_color: 'amber',
        recommended_action: 'Pricing Upsell',
        reasons: [`Price $${monthlyPerSeat}/seat/mo vs $${medianMonthlyPerSeat} median for ${account.product}`],
      };
    }

    if (LOWER_TIER_PRODUCTS.has(account.product) && account.tone === 2) {
      return {
        signal: 'product_upsell',
        status_color: 'green',
        recommended_action: 'Product Upsell',
        reasons: [`Lower-tier product (${account.product}) + Positive tone`],
      };
    }

    return {
      signal: 'flat_renewal',
      status_color: 'blue',
      recommended_action: 'Flat Renewal',
      reasons: [`Usage ${usagePct}%, price at median — flat renewal`],
    };
  }

  // Not in any action window
  return {
    signal: null,
    status_color: null,
    recommended_action: '',
    reasons: [],
  };
}
