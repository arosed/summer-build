import { faker } from '@faker-js/faker';
import { db, sqlite } from './index.js';
import { rawAccounts, historicalArr, qualificationConfig, productFeatures } from './schema.js';
import { eq } from 'drizzle-orm';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRODUCTS = [
  { name: 'Core Platform', medianArr: 24000 },
  { name: 'Growth Suite', medianArr: 48000 },
  { name: 'Enterprise Suite', medianArr: 96000 },
  { name: 'Core Platform + Analytics', medianArr: 36000 },
];

const TIER_CONFIG = {
  Starter: { arrRange: [8000, 30000], seatRange: [5, 25], products: ['Core Platform', 'Core Platform + Analytics'] },
  Growth: { arrRange: [25000, 80000], seatRange: [20, 100], products: ['Core Platform', 'Growth Suite', 'Core Platform + Analytics'] },
  Enterprise: { arrRange: [75000, 250000], seatRange: [75, 500], products: ['Growth Suite', 'Enterprise Suite', 'Core Platform + Analytics'] },
};

const PRODUCT_FEATURES_DATA = [
  { product: 'Core Platform', feature_name: 'AI Auto-tagging', release_date: '2025-03-15', description: 'Automatically tag and categorize content using AI' },
  { product: 'Core Platform', feature_name: 'Bulk Export API', release_date: '2024-09-01', description: 'Export data at scale via REST API' },
  { product: 'Growth Suite', feature_name: 'Advanced Analytics Dashboard', release_date: '2025-06-01', description: 'Deep-dive analytics with custom dashboards' },
  { product: 'Growth Suite', feature_name: 'Team Workflows', release_date: '2024-12-01', description: 'Automated approval and review workflows' },
  { product: 'Enterprise Suite', feature_name: 'AI Forecasting', release_date: '2025-08-01', description: 'Predictive revenue and usage forecasting' },
  { product: 'Enterprise Suite', feature_name: 'Custom Integrations', release_date: '2025-01-15', description: 'Native connectors for 200+ enterprise tools' },
  { product: 'Core Platform + Analytics', feature_name: 'Predictive Scoring', release_date: '2025-05-01', description: 'ML-driven lead and account scoring' },
  { product: 'Core Platform + Analytics', feature_name: 'Data Studio', release_date: '2024-10-01', description: 'Self-serve data exploration and BI tooling' },
];

function rng(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rngf(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function formatDateMMDDYYYY(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function generateContractPeriod(daysToRenewal: number, contractLengthDays: number): string {
  const endDate = addDays(new Date(), daysToRenewal);
  const startDate = addDays(endDate, -contractLengthDays);
  return `${formatDateMMDDYYYY(startDate)} - ${formatDateMMDDYYYY(endDate)}`;
}

function generateHistoricalArr(accountId: string, currentArr: number, numQuarters: number, isChurned: boolean): Array<{ account_id: string; quarter: string; arr: number }> {
  const records = [];
  const now = new Date();
  let arr = currentArr;

  for (let i = numQuarters - 1; i >= 0; i--) {
    const qDate = new Date(now);
    qDate.setMonth(qDate.getMonth() - i * 3);
    const year = qDate.getFullYear();
    const q = Math.floor(qDate.getMonth() / 3) + 1;
    const quarter = `${year}-Q${q}`;

    if (isChurned && i < 2) {
      arr = arr * rngf(0.85, 0.95);
    } else {
      arr = arr * rngf(0.97, 1.06);
    }
    records.push({ account_id: accountId, quarter, arr: Math.round(arr) });
  }

  records[records.length - 1].arr = currentArr;
  return records;
}

export async function seedDatabase(): Promise<void> {
  const existing = db.select().from(rawAccounts).limit(1).all();
  if (existing.length > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  console.log('Seeding database with synthetic data...');

  // Seed product features
  for (const feat of PRODUCT_FEATURES_DATA) {
    db.insert(productFeatures).values(feat).run();
  }

  // Default qualification config
  const configDefaults = [
    { key: 'underutilizing_threshold', value: '0.75', description: 'Seats active / seats purchased below this = Underutilizing' },
    { key: 'expansion_threshold', value: '1.0', description: 'Seats active / seats purchased above this = Expansion Ready' },
    { key: 'renewal_window_days', value: '120', description: 'Days to renewal inside this window = Renewal Prep' },
    { key: 'churn_login_threshold', value: '5', description: 'Logins in 90 days below this = Churn Risk signal' },
  ];
  for (const cfg of configDefaults) {
    db.insert(qualificationConfig).values(cfg).run();
  }

  type RawAccountRow = {
    org_id: string; company_name: string; monthly_revenue: number; contract_period: string;
    active_users_last_quarter: number; licensed_seats: number; total_logins_90_days: number;
    ticket_volume_ytd: number; num_prior_contracts: number; subscription_tier: string;
    product_package: string; feature_score: number; did_churn: number;
  };
  type HistArrRow = { account_id: string; quarter: string; arr: number };

  const tiers = ['Starter', 'Growth', 'Enterprise'] as const;
  const accounts: RawAccountRow[] = [];
  const histArr: HistArrRow[] = [];
  let i = 0;

  // Guaranteed interesting accounts
  const guaranteedAccounts: Array<{ type: string; daysToRenewal: number; usageRatio: number; logins: number }> = [
    { type: 'churn_login', daysToRenewal: 200, usageRatio: 0.6, logins: 0 },
    { type: 'churn_login', daysToRenewal: 180, usageRatio: 0.5, logins: 2 },
    { type: 'churn_login', daysToRenewal: 90, usageRatio: 0.45, logins: 1 },
    { type: 'churn_login', daysToRenewal: 150, usageRatio: 0.7, logins: 3 },
    { type: 'churn_login', daysToRenewal: 170, usageRatio: 0.55, logins: 4 },
    { type: 'churn_login', daysToRenewal: 210, usageRatio: 0.65, logins: 0 },
    { type: 'churn_login', daysToRenewal: 130, usageRatio: 0.6, logins: 2 },
    { type: 'churn_login', daysToRenewal: 190, usageRatio: 0.58, logins: 1 },
    { type: 'underutilizing', daysToRenewal: 200, usageRatio: 0.3, logins: 60 },
    { type: 'underutilizing', daysToRenewal: 180, usageRatio: 0.35, logins: 50 },
    { type: 'underutilizing', daysToRenewal: 150, usageRatio: 0.25, logins: 80 },
    { type: 'underutilizing', daysToRenewal: 160, usageRatio: 0.4, logins: 90 },
    { type: 'underutilizing', daysToRenewal: 140, usageRatio: 0.45, logins: 70 },
    { type: 'underutilizing', daysToRenewal: 220, usageRatio: 0.38, logins: 55 },
    { type: 'underutilizing', daysToRenewal: 200, usageRatio: 0.42, logins: 65 },
    { type: 'underutilizing', daysToRenewal: 190, usageRatio: 0.3, logins: 75 },
    { type: 'expansion', daysToRenewal: 200, usageRatio: 1.15, logins: 800 },
    { type: 'expansion', daysToRenewal: 150, usageRatio: 1.25, logins: 1200 },
    { type: 'expansion', daysToRenewal: 170, usageRatio: 1.1, logins: 950 },
    { type: 'expansion', daysToRenewal: 130, usageRatio: 1.3, logins: 1400 },
    { type: 'expansion', daysToRenewal: 160, usageRatio: 1.2, logins: 1100 },
    { type: 'expansion', daysToRenewal: 180, usageRatio: 1.15, logins: 880 },
    { type: 'expansion', daysToRenewal: 210, usageRatio: 1.18, logins: 1000 },
    { type: 'expansion', daysToRenewal: 145, usageRatio: 1.22, logins: 1300 },
    { type: 'renewal', daysToRenewal: 10, usageRatio: 0.85, logins: 400 },
    { type: 'renewal', daysToRenewal: 18, usageRatio: 0.88, logins: 350 },
    { type: 'renewal', daysToRenewal: 22, usageRatio: 0.9, logins: 500 },
    { type: 'renewal', daysToRenewal: 7, usageRatio: 0.82, logins: 280 },
    { type: 'renewal', daysToRenewal: 25, usageRatio: 0.86, logins: 420 },
    { type: 'renewal', daysToRenewal: 14, usageRatio: 0.84, logins: 380 },
    { type: 'renewal', daysToRenewal: 20, usageRatio: 0.87, logins: 460 },
    { type: 'renewal', daysToRenewal: 5, usageRatio: 0.83, logins: 310 },
  ];

  for (const ga of guaranteedAccounts) {
    const tier = tiers[rng(0, 2)];
    const tc = TIER_CONFIG[tier];
    const product = tc.products[rng(0, tc.products.length - 1)];
    const arr = rng(tc.arrRange[0], tc.arrRange[1]);
    const seatCount = rng(tc.seatRange[0], tc.seatRange[1]);
    const seatsActive = Math.round(seatCount * ga.usageRatio);
    const isChurned = ga.type === 'churn_login' ? 1 : 0;
    const contractLengthDays = [180, 365, 365, 730][rng(0, 3)];
    const numPriorContracts = rng(0, 5);
    const featureScore = isChurned ? rngf(5, 35) : rngf(30, 90);
    const tickets = isChurned ? rng(20, 80) : rng(2, 30);

    const orgId = `acct_${String(i + 1).padStart(4, '0')}`;
    const contractPeriod = generateContractPeriod(ga.daysToRenewal, contractLengthDays);

    accounts.push({
      org_id: orgId,
      company_name: faker.company.name(),
      monthly_revenue: Math.round(arr / 12),
      contract_period: contractPeriod,
      active_users_last_quarter: seatsActive,
      licensed_seats: seatCount,
      total_logins_90_days: ga.logins,
      ticket_volume_ytd: tickets,
      num_prior_contracts: numPriorContracts,
      subscription_tier: tier,
      product_package: product,
      feature_score: Math.round(featureScore),
      did_churn: isChurned,
    });

    const numQ = rng(4, 6);
    histArr.push(...generateHistoricalArr(orgId, arr, numQ, isChurned === 1));
    i++;
  }

  // Generate remaining ~768 random accounts
  const totalAccounts = 800;
  for (; i < totalAccounts; i++) {
    const tier = tiers[rng(0, 2)];
    const tc = TIER_CONFIG[tier];
    const product = tc.products[rng(0, tc.products.length - 1)];
    const arr = rng(tc.arrRange[0], tc.arrRange[1]);
    const seatCount = rng(tc.seatRange[0], tc.seatRange[1]);
    const isChurned = Math.random() < 0.15 ? 1 : 0;
    const usageRatio = isChurned ? rngf(0.2, 0.7) : rngf(0.55, 1.2);
    const seatsActive = Math.min(Math.round(seatCount * usageRatio), Math.round(seatCount * 1.4));
    const logins = isChurned ? rng(5, 150) : rng(50, 2000);
    const contractLengthDays = [180, 365, 365, 730][rng(0, 3)];
    const numPriorContracts = rng(0, 8);
    const featureScore = isChurned ? rngf(5, 40) : rngf(25, 95);
    const tickets = isChurned ? rng(15, 100) : rng(1, 40);
    const daysToRenewal = rng(-30, 400);

    const orgId = `acct_${String(i + 1).padStart(4, '0')}`;
    const contractPeriod = generateContractPeriod(daysToRenewal, contractLengthDays);

    accounts.push({
      org_id: orgId,
      company_name: faker.company.name(),
      monthly_revenue: Math.round(arr / 12),
      contract_period: contractPeriod,
      active_users_last_quarter: seatsActive,
      licensed_seats: seatCount,
      total_logins_90_days: logins,
      ticket_volume_ytd: tickets,
      num_prior_contracts: numPriorContracts,
      subscription_tier: tier,
      product_package: product,
      feature_score: Math.round(featureScore),
      did_churn: isChurned,
    });

    const numQ = rng(4, 6);
    histArr.push(...generateHistoricalArr(orgId, arr, numQ, isChurned === 1));
  }

  // Batch insert raw accounts
  const insertRaw = sqlite.prepare(`
    INSERT OR REPLACE INTO raw_accounts (org_id, company_name, monthly_revenue, contract_period, active_users_last_quarter, licensed_seats, total_logins_90_days, ticket_volume_ytd, num_prior_contracts, subscription_tier, product_package, feature_score, did_churn)
    VALUES (@org_id, @company_name, @monthly_revenue, @contract_period, @active_users_last_quarter, @licensed_seats, @total_logins_90_days, @ticket_volume_ytd, @num_prior_contracts, @subscription_tier, @product_package, @feature_score, @did_churn)
  `);
  const insertManyRaw = sqlite.transaction((rows: typeof accounts) => {
    for (const row of rows) insertRaw.run(row);
  });
  insertManyRaw(accounts);

  // Batch insert historical ARR
  const insertHist = sqlite.prepare(`INSERT INTO historical_arr (account_id, quarter, arr) VALUES (?, ?, ?)`);
  const insertManyHist = sqlite.transaction((rows: typeof histArr) => {
    for (const row of rows) insertHist.run(row.account_id, row.quarter, row.arr);
  });
  insertManyHist(histArr);

  // Write sample column descriptions CSV
  const csvPath = path.join(__dirname, '..', '..', 'public', 'sample_column_descriptions.csv');
  const csvContent = `column_name,description
org_id,Unique identifier for the customer organization
company_name,Legal business name of the customer company
monthly_revenue,Monthly recurring revenue in USD (MRR) — the amount billed each month
contract_period,Full contract duration shown as start and end date in format MM/DD/YYYY - MM/DD/YYYY
active_users_last_quarter,Number of distinct users who logged in at least once during the last calendar quarter
licensed_seats,Total number of user seats the customer has licensed under their current contract
total_logins_90_days,Cumulative login events across all users over the trailing 90-day window
ticket_volume_ytd,Total support tickets opened by this customer since the start of the current year
num_prior_contracts,Count of historical contracts this customer has had with us prior to the current one
subscription_tier,Customer pricing tier: Starter for small teams, Growth for mid-market, Enterprise for large orgs
product_package,The specific product bundle purchased: Core Platform, Growth Suite, Enterprise Suite, or Core Platform + Analytics
feature_score,A 0 to 100 composite score measuring breadth of product feature adoption across all modules
did_churn,Binary churn indicator: 1 if the customer did not renew after this contract, 0 if they renewed
`;
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, csvContent);

  console.log(`✓ Seeded ${accounts.length} accounts, ${histArr.length} historical ARR records`);
}
