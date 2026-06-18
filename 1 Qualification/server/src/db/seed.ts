import { sqlite } from './index.js';

const PRODUCTS = ['Core Platform', 'Growth Suite', 'Enterprise Suite', 'Core Platform + Analytics'] as const;

const PRODUCT_TIERS: Record<string, string[]> = {
  'Core Platform': ['Starter', 'Growth'],
  'Growth Suite': ['Starter', 'Growth'],
  'Enterprise Suite': ['Enterprise'],
  'Core Platform + Analytics': ['Growth', 'Enterprise'],
};

const COMPANY_PREFIXES = [
  'Apex', 'Bright', 'Cedar', 'Delta', 'Echo', 'Forge', 'Grove', 'Harbor', 'Iris', 'Jetway',
  'Kestrel', 'Lumen', 'Maple', 'Nexus', 'Orbit', 'Pinnacle', 'Quill', 'Ridge', 'Slate', 'Terra',
  'Unity', 'Vertex', 'Willow', 'Xero', 'Yield', 'Zenith', 'Amber', 'Blaze', 'Crest', 'Drift',
  'Ember', 'Fern', 'Glow', 'Haze', 'Inlet', 'Jade', 'Knoll', 'Loft', 'Mist', 'North',
  'Opal', 'Prism', 'Quest', 'Reef', 'Scout', 'Tidal', 'Ultra', 'Valor', 'Wave', 'Xcel',
];

const COMPANY_SUFFIXES = [
  'Tech', 'Labs', 'Works', 'Systems', 'Digital', 'Group', 'Solutions', 'Co', 'Inc', 'Corp',
  'Ventures', 'Partners', 'Studio', 'Hub', 'Cloud', 'AI', 'Analytics', 'Data', 'Media', 'Networks',
];

function companyName(id: number): string {
  const p = COMPANY_PREFIXES[Math.floor(seededRand(id * 53) * COMPANY_PREFIXES.length)];
  const s = COMPANY_SUFFIXES[Math.floor(seededRand(id * 71) * COMPANY_SUFFIXES.length)];
  return `${p} ${s}`;
}

function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface AccountRow {
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

function makeAccount(
  id: number,
  opts: {
    daysOut: number;
    usageRatio?: number;
    tone?: number;
    product?: string;
    pricePerSeatAnnual?: number;
    contractYears?: 1 | 2;
  }
): AccountRow {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const r = (lo: number, hi: number, s: number) => lo + seededRand(id * 37 + s) * (hi - lo);

  const product = opts.product ?? PRODUCTS[Math.floor(seededRand(id * 13) * PRODUCTS.length)];
  const tiers = PRODUCT_TIERS[product] ?? ['Growth'];
  const tier = tiers[Math.floor(seededRand(id * 7) * tiers.length)];

  const seat_count = Math.round(r(5, 50, 1));
  const monthlyPricePerSeat = opts.pricePerSeatAnnual != null
    ? opts.pricePerSeatAnnual / 12
    : 50 * (0.70 + seededRand(id * 23) * 0.60);

  const rawArr = seat_count * monthlyPricePerSeat * 12;
  const arr = Math.min(10000, Math.round(rawArr));
  const mrr = Math.round(arr / 12);

  const usageRatio = opts.usageRatio ?? (0.60 + seededRand(id * 11) * 0.35);
  const seats_active = Math.max(0, Math.round(seat_count * usageRatio));

  const logins_90d = Math.round(r(20, 400, 2));
  const support_ticket_count = Math.round(r(0, 20, 3));
  const num_previous_contracts = Math.round(r(0, 5, 4));
  const feature_adoption_score = Math.round(r(30, 90, 5));
  const tone = opts.tone ?? (
    seededRand(id * 3) < 0.10 ? 0 :
    seededRand(id * 3 + 1) < 0.55 ? 1 : 2
  );

  const contractYears = opts.contractYears ?? (seededRand(id * 19) > 0.45 ? 1 : 2);
  const contract_length_days = contractYears * 365;
  const contract_end_date = addDays(today, opts.daysOut);
  const contract_start_date = addDays(today, opts.daysOut - contract_length_days);

  return {
    account_id: `acct_${String(id).padStart(4, '0')}`,
    account_name: companyName(id),
    arr,
    mrr,
    seat_count,
    seats_active,
    logins_90d,
    support_ticket_count,
    num_previous_contracts,
    contract_end_date,
    contract_length_days,
    contract_start_date,
    tier,
    product,
    feature_adoption_score,
    churned: 0,
    tone,
  };
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function seedDatabase(): Promise<void> {
  const existingCount = (sqlite.prepare('SELECT COUNT(*) as cnt FROM accounts').get() as { cnt: number }).cnt;
  if (existingCount > 0) {
    console.log('✓ Database already seeded, skipping');
    return;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const insertAccount = sqlite.prepare(`
    INSERT INTO accounts (account_id, account_name, arr, mrr, seat_count, seats_active, logins_90d,
      support_ticket_count, num_previous_contracts, contract_end_date, contract_length_days,
      contract_start_date, tier, product, feature_adoption_score, churned, tone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertHistArr = sqlite.prepare(`
    INSERT INTO historical_arr (account_id, quarter, arr) VALUES (?, ?, ?)
  `);

  const bulkAccounts: AccountRow[] = [];

  // Phase 1: ~760 bulk accounts (121–540 days out), with 6 churn + 6 expansion outliers
  const bulkChurnIds = new Set([2, 15, 30, 47, 65, 90]);
  const bulkExpansionIds = new Set([5, 20, 38, 55, 72, 100]);

  for (let i = 1; i <= 760; i++) {
    const daysOut = 121 + Math.round(seededRand(i * 41) * 419); // 121–540

    let usageRatio: number | undefined;
    if (bulkChurnIds.has(i)) usageRatio = 0.20 + seededRand(i) * 0.25;       // 20–45%
    else if (bulkExpansionIds.has(i)) usageRatio = 1.30 + seededRand(i) * 0.40; // 130–170%

    bulkAccounts.push(makeAccount(i, { daysOut, usageRatio }));
  }

  // Phase 2: Compute per-product medians from bulk accounts
  const byProduct: Record<string, number[]> = {};
  for (const a of bulkAccounts) {
    if (a.seat_count > 0) {
      if (!byProduct[a.product]) byProduct[a.product] = [];
      byProduct[a.product].push(a.arr / a.seat_count);
    }
  }
  const productMedians: Record<string, number> = {};
  for (const [product, vals] of Object.entries(byProduct)) {
    productMedians[product] = computeMedian(vals);
  }

  // Phase 3: Craft exactly 20 cohort accounts at today+120
  const cohortAccounts: AccountRow[] = [];
  let cohortId = 801;

  // 4 churn risk: usage < 50%
  for (let k = 0; k < 4; k++) {
    cohortAccounts.push(makeAccount(cohortId++, {
      daysOut: 120,
      usageRatio: 0.20 + seededRand(cohortId * 3) * 0.25,
    }));
  }

  // 4 expansion: usage > 125%
  for (let k = 0; k < 4; k++) {
    cohortAccounts.push(makeAccount(cohortId++, {
      daysOut: 120,
      usageRatio: 1.30 + seededRand(cohortId * 3) * 0.35,
    }));
  }

  // 4 pricing upsell: varied pricing to show aggressiveness spread (Standard → Assertive → Aggressive)
  const pricingMultipliers = [0.74, 0.67, 0.60, 0.52]; // 26% below (Standard), 33% below (Assertive), 40% below (Aggressive), 48% below (Aggressive)
  for (let k = 0; k < 4; k++) {
    const product = PRODUCTS[k % PRODUCTS.length];
    const median = productMedians[product] ?? 600;
    const pricePerSeatAnnual = median * pricingMultipliers[k];
    cohortAccounts.push(makeAccount(cohortId++, {
      daysOut: 120,
      usageRatio: 0.62 + seededRand(cohortId * 7) * 0.28,
      product,
      pricePerSeatAnnual,
      tone: 1,
    }));
  }

  // 4 product upsell: lower-tier product, positive tone, price at/above 75% of median
  const lowerTierProducts = ['Core Platform', 'Growth Suite'] as const;
  for (let k = 0; k < 4; k++) {
    const product = lowerTierProducts[k % 2];
    const median = productMedians[product] ?? 600;
    const pricePerSeatAnnual = median * (0.80 + seededRand(cohortId * 9) * 0.30);
    cohortAccounts.push(makeAccount(cohortId++, {
      daysOut: 120,
      usageRatio: 0.60 + seededRand(cohortId * 11) * 0.35,
      product,
      pricePerSeatAnnual,
      tone: 2,
    }));
  }

  // 4 flat renewal: Enterprise Suite, price at/above median, neutral tone
  for (let k = 0; k < 4; k++) {
    const product = 'Enterprise Suite';
    const median = productMedians[product] ?? 600;
    const pricePerSeatAnnual = median * (0.80 + seededRand(cohortId * 13) * 0.40);
    cohortAccounts.push(makeAccount(cohortId++, {
      daysOut: 120,
      usageRatio: 0.65 + seededRand(cohortId * 13) * 0.25,
      product,
      pricePerSeatAnnual,
      tone: 1,
    }));
  }

  const allAccounts = [...bulkAccounts, ...cohortAccounts];

  const insertAll = sqlite.transaction(() => {
    for (const a of allAccounts) {
      insertAccount.run(
        a.account_id, a.account_name, a.arr, a.mrr, a.seat_count, a.seats_active,
        a.logins_90d, a.support_ticket_count, a.num_previous_contracts,
        a.contract_end_date, a.contract_length_days, a.contract_start_date,
        a.tier, a.product, a.feature_adoption_score, a.churned, a.tone
      );

      // Historical ARR: 5 annual snapshots ending the year before current contract end
      const endYear = new Date(a.contract_end_date + 'T00:00:00Z').getUTCFullYear();
      for (let offset = 4; offset >= 0; offset--) {
        const year = endYear - offset - 1;
        const drift = 0.70 + seededRand(a.arr + offset * 17) * 0.55;
        insertHistArr.run(a.account_id, String(year), Math.round(a.arr * drift));
      }
    }
  });

  insertAll();

  // Insert qualification config
  const insertConfig = sqlite.prepare(`
    INSERT OR IGNORE INTO qualification_config (key, value, description) VALUES (?, ?, ?)
  `);
  sqlite.transaction(() => {
    insertConfig.run('churn_usage_threshold', '0.5', 'Usage ratio below which account is flagged as churn risk');
    insertConfig.run('expansion_usage_threshold', '1.25', 'Usage ratio above which account is flagged for seat expansion');
    insertConfig.run('pricing_upsell_ratio', '0.75', 'Price-per-seat ratio below product median that triggers pricing upsell');
    insertConfig.run('renewal_window_days', '120', 'Days to renewal that triggers cohort qualification rules');
  })();

  console.log(`✓ Seeded ${allAccounts.length} accounts (${cohortAccounts.length} in 120-day cohort, product medians: ${JSON.stringify(productMedians)})`);
}
