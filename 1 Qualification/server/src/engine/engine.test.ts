import { describe, it, expect } from 'vitest';
import { qualify, computeDaysToRenewal, computeUtilization } from './engine.js';
import type { NormalizedAccount, QualConfig } from './engine.js';

const defaultConfig: QualConfig = {
  underutilizing_threshold: 0.75,
  expansion_threshold: 1.0,
  renewal_window_days: 120,
  churn_login_threshold: 5,
};

function makeAccount(overrides: Partial<NormalizedAccount> = {}): NormalizedAccount {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 200);
  const pastDate = new Date();
  pastDate.setFullYear(pastDate.getFullYear() - 1);

  return {
    account_id: 'test-001',
    account_name: 'Test Co',
    arr: 50000,
    mrr: 4167,
    seat_count: 100,
    seats_active: 80,
    logins_90d: 500,
    support_ticket_count: 10,
    num_previous_contracts: 2,
    contract_end_date: futureDate.toISOString().slice(0, 10),
    contract_length_days: 365,
    contract_start_date: pastDate.toISOString().slice(0, 10),
    tier: 'Growth',
    product: 'Core Platform',
    feature_adoption_score: 65,
    churned: 0,
    ...overrides,
  };
}

describe('qualify - churn_risk via ML prediction', () => {
  it('returns churn_risk when churned_predicted = 1', () => {
    const acct = makeAccount();
    const result = qualify(acct, { churn_probability: 0.87, churned_predicted: 1 }, defaultConfig);
    expect(result.signal).toBe('churn_risk');
    expect(result.status_color).toBe('red');
    expect(result.reasons.some((r) => r.includes('87%'))).toBe(true);
  });
});

describe('qualify - churn_risk via low logins', () => {
  it('returns churn_risk when logins_90d <= threshold', () => {
    const acct = makeAccount({ logins_90d: 3 });
    const result = qualify(acct, null, defaultConfig);
    expect(result.signal).toBe('churn_risk');
    expect(result.reasons.some((r) => r.includes('3 logins') || r.includes('3 login'))).toBe(true);
  });

  it('does not flag churn for logins at threshold + 1', () => {
    const acct = makeAccount({ logins_90d: 6 });
    const result = qualify(acct, null, defaultConfig);
    expect(result.signal).not.toBe('churn_risk');
  });
});

describe('qualify - expansion_ready', () => {
  it('returns expansion_ready at or above expansion threshold', () => {
    const acct = makeAccount({ seats_active: 105, seat_count: 100 });
    const result = qualify(acct, null, defaultConfig);
    expect(result.signal).toBe('expansion_ready');
    expect(result.status_color).toBe('green');
    expect(result.reasons.some((r) => r.includes('105%'))).toBe(true);
  });

  it('returns expansion_ready for new features since last renewal', () => {
    const pastStart = new Date();
    pastStart.setFullYear(pastStart.getFullYear() - 1);
    const acct = makeAccount({
      seats_active: 75,
      seat_count: 100,
      product: 'Core Platform',
      contract_start_date: new Date('2024-01-01').toISOString().slice(0, 10),
    });
    const features = [{ product: 'Core Platform', feature_name: 'AI Auto-tagging', release_date: '2025-03-01' }];
    const result = qualify(acct, null, defaultConfig, features);
    expect(result.signal).toBe('expansion_ready');
    expect(result.reasons.some((r) => r.includes('AI Auto-tagging'))).toBe(true);
  });
});

describe('qualify - underutilizing', () => {
  it('returns underutilizing below threshold', () => {
    const acct = makeAccount({ seats_active: 50, seat_count: 100 });
    const result = qualify(acct, null, defaultConfig);
    expect(result.signal).toBe('underutilizing');
    expect(result.status_color).toBe('amber');
    expect(result.reasons.some((r) => r.includes('50%'))).toBe(true);
  });

  it('does not flag underutilizing at exactly threshold', () => {
    const acct = makeAccount({ seats_active: 75, seat_count: 100 });
    const result = qualify(acct, null, defaultConfig);
    expect(result.signal).not.toBe('underutilizing');
  });
});

describe('qualify - renewal_prep', () => {
  it('returns renewal_prep within renewal window', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 45);
    const acct = makeAccount({ contract_end_date: soon.toISOString().slice(0, 10), seats_active: 85, seat_count: 100 });
    const result = qualify(acct, null, defaultConfig);
    expect(result.signal).toBe('renewal_prep');
    expect(result.status_color).toBe('amber');
  });

  it('does not flag renewal_prep outside window', () => {
    const far = new Date();
    far.setDate(far.getDate() + 150);
    const acct = makeAccount({ contract_end_date: far.toISOString().slice(0, 10), seats_active: 85, seat_count: 100 });
    const result = qualify(acct, null, defaultConfig);
    expect(result.signal).not.toBe('renewal_prep');
  });
});

describe('qualify - healthy', () => {
  it('returns healthy for good metrics outside all thresholds', () => {
    const far = new Date();
    far.setDate(far.getDate() + 150);
    const acct = makeAccount({ seats_active: 85, seat_count: 100, contract_end_date: far.toISOString().slice(0, 10) });
    const result = qualify(acct, null, defaultConfig);
    expect(result.signal).toBe('healthy');
    expect(result.status_color).toBe('green');
  });
});

describe('config changes affect results', () => {
  it('respects custom underutilizing_threshold', () => {
    const acct = makeAccount({ seats_active: 60, seat_count: 100 });
    const lowConfig = { ...defaultConfig, underutilizing_threshold: 0.55 };
    const result = qualify(acct, null, lowConfig);
    // 60% > 55% threshold → should NOT be underutilizing
    expect(result.signal).not.toBe('underutilizing');

    const highConfig = { ...defaultConfig, underutilizing_threshold: 0.65 };
    const result2 = qualify(acct, null, highConfig);
    // 60% < 65% threshold → should be underutilizing
    expect(result2.signal).toBe('underutilizing');
  });
});

describe('computeDaysToRenewal', () => {
  it('returns positive days for future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    expect(computeDaysToRenewal(future.toISOString().slice(0, 10))).toBeGreaterThan(28);
  });

  it('returns negative days for past date', () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    expect(computeDaysToRenewal(past.toISOString().slice(0, 10))).toBeLessThan(0);
  });
});

describe('computeUtilization', () => {
  it('computes correct ratio', () => {
    expect(computeUtilization(80, 100)).toBe(0.8);
    expect(computeUtilization(110, 100)).toBe(1.1);
  });

  it('handles zero seat_count', () => {
    expect(computeUtilization(5, 0)).toBe(0);
  });
});
