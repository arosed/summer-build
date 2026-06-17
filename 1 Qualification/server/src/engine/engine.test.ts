import { describe, it, expect } from 'vitest';
import { qualify, daysToRenewal, computeMedians } from './engine.js';
import type { NormalizedAccount, QualConfig } from './engine.js';

const defaultConfig: QualConfig = {
  churn_usage_threshold: 0.5,
  expansion_usage_threshold: 1.25,
  pricing_upsell_ratio: 0.75,
  renewal_window_days: 120,
};

function makeDate(daysFromNow: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function makeAccount(overrides: Partial<NormalizedAccount> = {}): NormalizedAccount {
  return {
    account_id: 'test-001',
    account_name: 'Test Co',
    arr: 6000,
    mrr: 500,
    seat_count: 10,
    seats_active: 8,
    logins_90d: 200,
    support_ticket_count: 2,
    num_previous_contracts: 1,
    contract_end_date: makeDate(200),
    contract_length_days: 365,
    contract_start_date: makeDate(200 - 365),
    tier: 'Growth',
    product: 'Core Platform',
    feature_adoption_score: 65,
    churned: 0,
    tone: 1,
    ...overrides,
  };
}

const medians = { 'Core Platform': 600, 'Growth Suite': 580, 'Enterprise Suite': 700, 'Core Platform + Analytics': 720 };

describe('qualify - churn_risk (anytime, regardless of renewal date)', () => {
  it('flags churn when usage < 50% outside renewal window', () => {
    const acct = makeAccount({ seats_active: 4, seat_count: 10, contract_end_date: makeDate(300) });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBe('churn_risk');
    expect(result.status_color).toBe('red');
    expect(result.recommended_action).toBe('Flag Rep');
    expect(result.reasons[0]).toContain('40%');
  });

  it('flags churn when usage < 50% at exactly 120 days (overrides cohort rules)', () => {
    const acct = makeAccount({ seats_active: 4, seat_count: 10, contract_end_date: makeDate(120) });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBe('churn_risk');
  });

  it('does not flag churn at exactly 50% usage', () => {
    const acct = makeAccount({ seats_active: 5, seat_count: 10, contract_end_date: makeDate(300) });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).not.toBe('churn_risk');
  });
});

describe('qualify - expansion_ready (anytime)', () => {
  it('flags expansion when usage > 125%', () => {
    const acct = makeAccount({ seats_active: 14, seat_count: 10, contract_end_date: makeDate(300) });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBe('expansion_ready');
    expect(result.status_color).toBe('green');
    expect(result.recommended_action).toBe('Upsell Seats');
    expect(result.reasons[0]).toContain('140%');
  });

  it('flags expansion at exactly 120 days (overrides cohort rules)', () => {
    const acct = makeAccount({ seats_active: 14, seat_count: 10, contract_end_date: makeDate(120) });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBe('expansion_ready');
  });

  it('does not flag expansion at exactly 125%', () => {
    const acct = makeAccount({ seats_active: 13, seat_count: 10, contract_end_date: makeDate(300) });
    // 13/10 = 130% > 125% → expansion
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBe('expansion_ready');
  });
});

describe('qualify - pricing_upsell (120-day cohort)', () => {
  it('flags pricing upsell when arr/seat < 75% of product median', () => {
    // arr=3000, seat=10 → 300/seat, median=600, ratio=0.5 < 0.75
    const acct = makeAccount({
      arr: 3000,
      seat_count: 10,
      seats_active: 8,
      contract_end_date: makeDate(120),
      product: 'Core Platform',
      tone: 1,
    });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBe('pricing_upsell');
    expect(result.status_color).toBe('amber');
    expect(result.reasons[0]).toContain('median');
  });

  it('does NOT fire pricing upsell outside 120-day window', () => {
    const acct = makeAccount({
      arr: 3000,
      seat_count: 10,
      seats_active: 8,
      contract_end_date: makeDate(200),
      product: 'Core Platform',
      tone: 1,
    });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBeNull();
  });
});

describe('qualify - product_upsell (120-day cohort)', () => {
  it('flags product upsell for lower-tier product + positive tone', () => {
    const acct = makeAccount({
      arr: 5400,
      seat_count: 10,
      seats_active: 8,
      contract_end_date: makeDate(120),
      product: 'Core Platform',
      tone: 2,
    });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBe('product_upsell');
    expect(result.reasons[0]).toContain('Core Platform');
    expect(result.reasons[0]).toContain('Positive tone');
  });

  it('does not flag product upsell for higher-tier product even with positive tone', () => {
    const acct = makeAccount({
      arr: 6000,
      seat_count: 10,
      seats_active: 8,
      contract_end_date: makeDate(120),
      product: 'Enterprise Suite',
      tone: 2,
    });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBe('flat_renewal');
  });

  it('does not flag product upsell for lower-tier product with neutral tone', () => {
    const acct = makeAccount({
      arr: 5400,
      seat_count: 10,
      seats_active: 8,
      contract_end_date: makeDate(120),
      product: 'Core Platform',
      tone: 1,
    });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBe('flat_renewal');
  });
});

describe('qualify - flat_renewal (120-day cohort, default)', () => {
  it('returns flat renewal for 120-day cohort with no other triggers', () => {
    const acct = makeAccount({
      arr: 6000,
      seat_count: 10,
      seats_active: 8,
      contract_end_date: makeDate(120),
      product: 'Enterprise Suite',
      tone: 1,
    });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBe('flat_renewal');
    expect(result.status_color).toBe('blue');
    expect(result.recommended_action).toBe('Flat Renewal');
  });
});

describe('qualify - null signal (outside all action windows)', () => {
  it('returns null for healthy account with >120 days to renewal', () => {
    const acct = makeAccount({ seats_active: 8, seat_count: 10, contract_end_date: makeDate(300) });
    const result = qualify(acct, defaultConfig, medians);
    expect(result.signal).toBeNull();
  });
});

describe('computeMedians', () => {
  it('computes correct per-product median arr/seat_count', () => {
    const accts: NormalizedAccount[] = [
      makeAccount({ arr: 600, seat_count: 1, product: 'Core Platform' }),
      makeAccount({ arr: 400, seat_count: 1, product: 'Core Platform' }),
      makeAccount({ arr: 800, seat_count: 1, product: 'Core Platform' }),
      makeAccount({ arr: 1000, seat_count: 2, product: 'Growth Suite' }),
    ];
    const m = computeMedians(accts);
    expect(m['Core Platform']).toBe(600); // median of [400, 600, 800]
    expect(m['Growth Suite']).toBe(500);  // 1000/2
  });
});

describe('daysToRenewal', () => {
  it('returns exactly 120 for today+120', () => {
    expect(daysToRenewal(makeDate(120))).toBe(120);
  });

  it('returns positive for future dates', () => {
    expect(daysToRenewal(makeDate(30))).toBeGreaterThan(28);
  });
});

describe('config changes affect results', () => {
  it('respects custom churn_usage_threshold', () => {
    const acct = makeAccount({ seats_active: 6, seat_count: 10, contract_end_date: makeDate(300) });
    // 60% usage
    const looseConfig = { ...defaultConfig, churn_usage_threshold: 0.40 };
    expect(qualify(acct, looseConfig, medians).signal).toBeNull(); // 60% > 40% → not churn

    const strictConfig = { ...defaultConfig, churn_usage_threshold: 0.70 };
    expect(qualify(acct, strictConfig, medians).signal).toBe('churn_risk'); // 60% < 70% → churn
  });
});
