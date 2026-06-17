import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTables } from './db/init.js';
import { seedDatabase } from './db/seed.js';
import { db, sqlite } from './db/index.js';
import { accounts, qualificationConfig, qualificationResults, churnPredictions, productFeatures } from './db/schema.js';
import { trainChurnModel, predictChurn } from './ml/churnModel.js';
import { qualify } from './engine/engine.js';
import type { NormalizedAccount, QualConfig, ProductFeature } from './engine/engine.js';
import { setupRouter } from './routes/setup.js';
import { accountsRouter } from './routes/accounts.js';
import { churnRouter } from './routes/churn.js';
import { agentRouter } from './routes/agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;

async function runQualificationEngine(): Promise<void> {
  const allAccounts = db.select().from(accounts).all() as NormalizedAccount[];
  if (allAccounts.length === 0) return;

  const configRows = db.select().from(qualificationConfig).all();
  const config: QualConfig = {
    underutilizing_threshold: 0.75,
    expansion_threshold: 1.0,
    renewal_window_days: 120,
    churn_login_threshold: 5,
  };
  for (const row of configRows) {
    (config as unknown as Record<string, number>)[row.key] = parseFloat(row.value);
  }

  const features = db.select().from(productFeatures).all() as ProductFeature[];

  // Get all churn predictions
  const predictions = db.select().from(churnPredictions).all();
  const predMap = new Map(predictions.map((p) => [p.account_id, p]));

  // Store old signals to detect changes
  const oldResults = db.select().from(qualificationResults).all();
  const oldSignalMap = new Map(oldResults.map((r) => [r.account_id, r.signal]));

  const insertResult = sqlite.prepare(`
    INSERT OR REPLACE INTO qualification_results (account_id, signal, status_color, recommended_action, reasons, updated_at, is_new)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = sqlite.transaction((rows: NormalizedAccount[]) => {
    for (const acct of rows) {
      const pred = predMap.get(acct.account_id);
      const result = qualify(acct, pred ? {
        churn_probability: pred.churn_probability,
        churned_predicted: pred.churned_predicted,
      } : null, config, features);

      const oldSignal = oldSignalMap.get(acct.account_id);
      const isNew = oldSignal !== undefined && oldSignal !== result.signal ? 1 : 0;

      insertResult.run(
        acct.account_id,
        result.signal,
        result.status_color,
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

async function trainAndPredict(): Promise<void> {
  const allAccounts = db.select().from(accounts).all() as NormalizedAccount[];
  if (allAccounts.length === 0) return;

  trainChurnModel(allAccounts);

  const insertPred = sqlite.prepare(`
    INSERT OR REPLACE INTO churn_predictions
    (account_id, churn_probability, churned_predicted, feature1_name, feature1_shap, feature1_direction, feature2_name, feature2_shap, feature2_direction)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = sqlite.transaction((rows: NormalizedAccount[]) => {
    for (const acct of rows) {
      const result = predictChurn(acct);
      const f1 = result.top_features[0];
      const f2 = result.top_features[1];
      insertPred.run(
        acct.account_id,
        result.churn_probability,
        result.churned_predicted,
        f1?.name ?? null, f1?.shap_value ?? null, f1?.direction ?? null,
        f2?.name ?? null, f2?.shap_value ?? null, f2?.direction ?? null
      );
    }
  });

  insertMany(allAccounts);
  console.log(`✓ Churn predictions computed for ${allAccounts.length} accounts`);
}

async function main() {
  const app = express();

  app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Initialize DB
  createTables();
  await seedDatabase();

  // Mount routes
  app.use('/api/setup', setupRouter(runQualificationEngine, trainAndPredict));
  app.use('/api/accounts', accountsRouter(runQualificationEngine));
  app.use('/api/churn', churnRouter());
  app.use('/api/agent', agentRouter(runQualificationEngine));

  // Health check
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.listen(PORT, () => {
    console.log(`✓ Pareto server running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
