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
}

export interface ChurnPrediction {
  churn_probability: number;
  churned_predicted: number;
}

export interface QualConfig {
  underutilizing_threshold: number;
  expansion_threshold: number;
  renewal_window_days: number;
  churn_login_threshold: number;
}

export type Signal = 'churn_risk' | 'underutilizing' | 'expansion_ready' | 'renewal_prep' | 'healthy';
export type StatusColor = 'red' | 'amber' | 'green';

export interface QualResult {
  signal: Signal;
  status_color: StatusColor;
  recommended_action: string;
  reasons: string[];
}

export interface ProductFeature {
  feature_name: string;
  release_date: string;
  product: string;
}

export function computeDaysToRenewal(contractEndDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(contractEndDate);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeUtilization(seatsActive: number, seatCount: number): number {
  if (seatCount === 0) return 0;
  return seatsActive / seatCount;
}

export function qualify(
  account: NormalizedAccount,
  churnPred: ChurnPrediction | null,
  config: QualConfig,
  productFeatures: ProductFeature[] = []
): QualResult {
  const util = computeUtilization(account.seats_active, account.seat_count);
  const daysToRenewal = computeDaysToRenewal(account.contract_end_date);
  const utilPct = Math.round(util * 100);

  // Check for new features since last renewal
  const newFeatures = productFeatures.filter(
    (f) =>
      f.product === account.product &&
      new Date(f.release_date) > new Date(account.contract_start_date)
  );

  // Priority: churn_risk > expansion_ready > underutilizing > renewal_prep > healthy
  const isChurnRisk =
    (churnPred !== null && churnPred.churned_predicted === 1) ||
    account.logins_90d <= config.churn_login_threshold;

  if (isChurnRisk) {
    const reasons: string[] = [];
    if (churnPred && churnPred.churned_predicted === 1) {
      reasons.push(`Churn model predicts ${Math.round(churnPred.churn_probability * 100)}% probability of non-renewal`);
    }
    if (account.logins_90d <= config.churn_login_threshold) {
      reasons.push(`Only ${account.logins_90d} login${account.logins_90d === 1 ? '' : 's'} in last 90 days — engagement critically low`);
    }
    if (util < 0.5) {
      reasons.push(`${utilPct}% seat utilization indicates limited adoption`);
    }
    if (account.support_ticket_count > 30) {
      reasons.push(`${account.support_ticket_count} support tickets suggest customer friction`);
    }
    return {
      signal: 'churn_risk',
      status_color: 'red',
      recommended_action: 'Schedule executive review, prepare retention offer, involve CS leadership',
      reasons,
    };
  }

  const isExpansionReady = util >= config.expansion_threshold || newFeatures.length > 0;

  if (isExpansionReady) {
    const reasons: string[] = [];
    if (util >= config.expansion_threshold) {
      reasons.push(`${utilPct}% seat utilization — at or above licensed capacity, natural upsell moment`);
    }
    if (newFeatures.length > 0) {
      reasons.push(`${newFeatures.map((f) => f.feature_name).join(', ')} released since last renewal — upsell opportunity`);
    }
    if (daysToRenewal <= config.renewal_window_days) {
      reasons.push(`${daysToRenewal} days to renewal — ideal timing for expansion conversation`);
    }
    return {
      signal: 'expansion_ready',
      status_color: 'green',
      recommended_action: newFeatures.length > 0
        ? `Present ${newFeatures[0].feature_name} upsell — pricing conversation warranted`
        : 'Propose seat expansion or tier upgrade before renewal',
      reasons,
    };
  }

  const isUnderutilizing = util < config.underutilizing_threshold;

  if (isUnderutilizing) {
    const reasons: string[] = [
      `${utilPct}% seat utilization (below ${Math.round(config.underutilizing_threshold * 100)}% threshold)`,
    ];
    if (account.feature_adoption_score < 40) {
      reasons.push(`Low feature adoption score (${Math.round(account.feature_adoption_score)}/100) — limited product depth`);
    }
    return {
      signal: 'underutilizing',
      status_color: 'amber',
      recommended_action: 'Drive adoption: schedule training, activate unused seats, share success stories',
      reasons,
    };
  }

  const isRenewalPrep = daysToRenewal >= 0 && daysToRenewal <= config.renewal_window_days;

  if (isRenewalPrep) {
    const reasons: string[] = [
      `Entered ${config.renewal_window_days}-day renewal window — ${daysToRenewal} days remaining`,
    ];
    if (util >= 0.85) {
      reasons.push(`Strong ${utilPct}% seat utilization supports full renewal`);
    }
    return {
      signal: 'renewal_prep',
      status_color: 'amber',
      recommended_action: 'Prepare renewal proposal, confirm stakeholders, schedule QBR',
      reasons,
    };
  }

  return {
    signal: 'healthy',
    status_color: 'green',
    recommended_action: 'Nurture relationship, share product roadmap, identify champions',
    reasons: [
      `${utilPct}% seat utilization — good product adoption`,
      `${daysToRenewal} days to renewal — no immediate action required`,
    ],
  };
}
