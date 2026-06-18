import express from 'express';
import cors from 'cors';
import { createTables } from './db/init.js';
import { seedDatabase } from './db/seed.js';
import { db, sqlite } from './db/index.js';
import { accounts, qualificationConfig, qualificationResults } from './db/schema.js';
import { qualify, computeMedians, daysToRenewal } from './engine/engine.js';
import type { NormalizedAccount, QualConfig } from './engine/engine.js';
import { accountsRouter } from './routes/accounts.js';
import { agentRouter } from './routes/agent.js';

const PORT = 3001;

export async function runQualificationEngine(): Promise<void> {
  const allAccounts = db.select().from(accounts).all() as NormalizedAccount[];
  if (allAccounts.length === 0) return;

  const configRows = db.select().from(qualificationConfig).all();
  const config: QualConfig = {
    churn_usage_threshold: 0.5,
    expansion_usage_threshold: 1.25,
    pricing_upsell_ratio: 0.75,
    renewal_window_days: 120,
  };
  for (const row of configRows) {
    (config as unknown as Record<string, number>)[row.key] = parseFloat(row.value);
  }

  const productMedians = computeMedians(allAccounts);

  const oldResults = db.select().from(qualificationResults).all();
  const oldSignalMap = new Map(oldResults.map((r) => [r.account_id, r.signal]));

  const insertResult = sqlite.prepare(`
    INSERT OR REPLACE INTO qualification_results (account_id, signal, status_color, recommended_action, reasons, updated_at, is_new)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = sqlite.transaction((rows: NormalizedAccount[]) => {
    for (const acct of rows) {
      const result = qualify(acct, config, productMedians);
      const usageRatio = acct.seat_count > 0 ? acct.seats_active / acct.seat_count : 0;
      const days = daysToRenewal(acct.contract_end_date);
      const isActionable = days === config.renewal_window_days || usageRatio < config.churn_usage_threshold || usageRatio > config.expansion_usage_threshold;

      const oldSignal = oldSignalMap.get(acct.account_id);
      const signalChanged = oldSignal !== undefined && oldSignal !== (result.signal ?? '');
      const isNew = isActionable && signalChanged ? 1 : 0;

      insertResult.run(
        acct.account_id,
        result.signal ?? '',
        result.status_color ?? '',
        result.recommended_action,
        JSON.stringify(result.reasons),
        new Date().toISOString(),
        isNew
      );
    }
  });

  insertMany(allAccounts);
  console.log(`✓ Qualification engine ran on ${allAccounts.length} accounts`);
}

async function main() {
  const app = express();

  app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  app.use(express.json());

  createTables();
  await seedDatabase();
  await runQualificationEngine();

  app.use('/api/accounts', accountsRouter(runQualificationEngine));
  app.use('/api/agent', agentRouter(runQualificationEngine));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/config/reset', async (_req, res) => {
    const defaults: Record<string, string> = {
      churn_usage_threshold: '0.5',
      expansion_usage_threshold: '1.25',
      pricing_upsell_ratio: '0.75',
      renewal_window_days: '120',
    };
    for (const [key, value] of Object.entries(defaults)) {
      sqlite.prepare('UPDATE qualification_config SET value = ? WHERE key = ?').run(value, key);
    }
    await runQualificationEngine();
    res.json({ ok: true });
  });

  app.listen(PORT, () => {
    console.log(`✓ Pareto server running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
