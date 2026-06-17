import { describe, it, expect } from 'vitest';
import { trainChurnModel, predictChurn, getModelInfo, FEATURE_NAMES } from './churnModel.js';
import type { NormalizedAccount } from '../engine/engine.js';

function makeAccount(overrides: Partial<NormalizedAccount> = {}): NormalizedAccount {
  return {
    account_id: 'test-001',
    account_name: 'Test Co',
    arr: 50000,
    mrr: 4167,
    seat_count: 100,
    seats_active: 80,
    logins_90d: 500,
    support_ticket_count: 10,
    num_previous_contracts: 3,
    contract_end_date: '2025-12-01',
    contract_length_days: 365,
    contract_start_date: '2024-12-01',
    tier: 'Growth',
    product: 'Core Platform',
    feature_adoption_score: 65,
    churned: 0,
    ...overrides,
  };
}

function generateTrainingData(n: number): NormalizedAccount[] {
  const accounts: NormalizedAccount[] = [];
  for (let i = 0; i < n; i++) {
    const churned = Math.random() < 0.2 ? 1 : 0;
    accounts.push(makeAccount({
      account_id: `acct-${i}`,
      seats_active: churned ? Math.floor(Math.random() * 30) + 10 : Math.floor(Math.random() * 70) + 30,
      support_ticket_count: churned ? Math.floor(Math.random() * 50) + 20 : Math.floor(Math.random() * 15),
      num_previous_contracts: churned ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 5) + 1,
      churned,
    }));
  }
  return accounts;
}

describe('churnModel - training', () => {
  it('trains without error and returns model info', () => {
    const data = generateTrainingData(100);
    const info = trainChurnModel(data);
    expect(info.training_size).toBe(100);
    expect(info.features).toEqual(FEATURE_NAMES);
    expect(info.threshold).toBe(0.5);
  });

  it('getModelInfo returns consistent data after training', () => {
    const data = generateTrainingData(100);
    trainChurnModel(data);
    const info = getModelInfo();
    expect(info.accuracy).toBeGreaterThan(0);
    expect(info.accuracy).toBeLessThanOrEqual(1);
  });
});

describe('churnModel - prediction', () => {
  it('returns 0 or 1 for churned_predicted', () => {
    const data = generateTrainingData(100);
    trainChurnModel(data);
    const acct = makeAccount({ seats_active: 80 });
    const result = predictChurn(acct);
    expect([0, 1]).toContain(result.churned_predicted);
  });

  it('churn_probability is between 0 and 1', () => {
    const data = generateTrainingData(100);
    trainChurnModel(data);
    const acct = makeAccount();
    const result = predictChurn(acct);
    expect(result.churn_probability).toBeGreaterThan(0);
    expect(result.churn_probability).toBeLessThan(1);
  });

  it('returns 4 SHAP values (one per feature)', () => {
    const data = generateTrainingData(100);
    trainChurnModel(data);
    const result = predictChurn(makeAccount());
    expect(result.top_features).toHaveLength(4);
  });

  it('SHAP values have direction field', () => {
    const data = generateTrainingData(100);
    trainChurnModel(data);
    const result = predictChurn(makeAccount());
    for (const f of result.top_features) {
      expect(['increases_churn', 'decreases_churn']).toContain(f.direction);
    }
  });

  it('high usage account has lower churn probability than low usage', () => {
    const data = generateTrainingData(200);
    trainChurnModel(data);
    const highUsage = makeAccount({ seats_active: 95, seat_count: 100, support_ticket_count: 5 });
    const lowUsage = makeAccount({ seats_active: 10, seat_count: 100, support_ticket_count: 60 });
    const highResult = predictChurn(highUsage);
    const lowResult = predictChurn(lowUsage);
    expect(highResult.churn_probability).toBeLessThan(lowResult.churn_probability);
  });
});
