import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { accounts, qualificationConfig } from '../db/schema.js';
import { daysToRenewal } from '../engine/engine.js';
import type { NormalizedAccount } from '../engine/engine.js';

const TONE_LABELS: Record<number, string> = { 0: 'Bad', 1: 'Neutral', 2: 'Positive' };

export function accountsRouter(runEngine: () => Promise<void>) {
  const router = Router();

  // GET /api/accounts
  router.get('/', (_req: Request, res: Response) => {
    try {
      const rows = sqlite.prepare(`
        SELECT a.*, qr.signal, qr.status_color, qr.recommended_action, qr.reasons, qr.updated_at, qr.is_new
        FROM accounts a
        LEFT JOIN qualification_results qr ON a.account_id = qr.account_id
        ORDER BY qr.is_new DESC, a.contract_end_date ASC
      `).all();

      const result = (rows as Record<string, unknown>[]).map((r) => ({
        ...r,
        reasons: r.reasons ? JSON.parse(r.reasons as string) : [],
        tone_label: TONE_LABELS[r.tone as number] ?? 'Neutral',
      }));

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/accounts/simulate-daily
  router.post('/simulate-daily', async (_req: Request, res: Response) => {
    try {
      // Clear is_new flags
      sqlite.prepare('UPDATE qualification_results SET is_new = 0').run();

      // Re-run qualification engine
      await runEngine();

      // Read config thresholds
      const configRows = db.select().from(qualificationConfig).all();
      let churnThreshold = 0.5;
      let expansionThreshold = 1.25;
      let renewalWindow = 120;
      for (const row of configRows) {
        if (row.key === 'churn_usage_threshold') churnThreshold = parseFloat(row.value);
        if (row.key === 'expansion_usage_threshold') expansionThreshold = parseFloat(row.value);
        if (row.key === 'renewal_window_days') renewalWindow = parseFloat(row.value);
      }

      // Mark as is_new: 120-day cohort + usage outliers
      const allAccounts = db.select().from(accounts).all() as NormalizedAccount[];
      const surfacedIds: string[] = [];

      const markNew = sqlite.prepare('UPDATE qualification_results SET is_new = 1 WHERE account_id = ?');
      sqlite.transaction(() => {
        for (const acct of allAccounts) {
          const days = daysToRenewal(acct.contract_end_date);
          const usageRatio = acct.seat_count > 0 ? acct.seats_active / acct.seat_count : 0;
          const shouldSurface =
            days === renewalWindow ||
            usageRatio < churnThreshold ||
            usageRatio > expansionThreshold;

          if (shouldSurface) {
            markNew.run(acct.account_id);
            surfacedIds.push(acct.account_id);
          }
        }
      })();

      res.json({ changed: surfacedIds });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/accounts/renewal-manager
  router.get('/renewal-manager', (_req: Request, res: Response) => {
    try {
      const rows = sqlite.prepare(`
        SELECT a.arr, qr.signal
        FROM accounts a
        LEFT JOIN qualification_results qr ON a.account_id = qr.account_id
        WHERE qr.signal IS NOT NULL AND qr.signal != ''
      `).all() as { arr: number; signal: string }[];

      const PROJECTION: Record<string, number> = {
        churn_risk: 0,
        expansion_ready: 1.25,
        flat_renewal: 1.0,
        pricing_upsell: 1.15,
        product_upsell: 1.20,
      };

      const categories: Record<string, { count: number; currentArr: number; projectedArr: number }> = {
        churn_risk: { count: 0, currentArr: 0, projectedArr: 0 },
        expansion_ready: { count: 0, currentArr: 0, projectedArr: 0 },
        flat_renewal: { count: 0, currentArr: 0, projectedArr: 0 },
        pricing_upsell: { count: 0, currentArr: 0, projectedArr: 0 },
        product_upsell: { count: 0, currentArr: 0, projectedArr: 0 },
      };

      for (const row of rows) {
        const cat = categories[row.signal];
        if (!cat) continue;
        cat.count++;
        cat.currentArr += row.arr;
        cat.projectedArr += row.arr * (PROJECTION[row.signal] ?? 1);
      }

      const totalArr = Object.values(categories).reduce((s, c) => s + c.currentArr, 0);
      const projectedTotal = Object.values(categories).reduce((s, c) => s + c.projectedArr, 0);

      res.json({
        categories: Object.entries(categories).map(([signal, data]) => ({ signal, ...data })),
        totalArr,
        projectedArr: projectedTotal,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/accounts/:id/renewal-plan
  router.get('/:id/renewal-plan', (req: Request, res: Response) => {
    try {
      const row = sqlite.prepare(`
        SELECT a.*, qr.signal, qr.status_color, qr.recommended_action, qr.reasons
        FROM accounts a
        LEFT JOIN qualification_results qr ON a.account_id = qr.account_id
        WHERE a.account_id = ?
      `).get(req.params.id) as Record<string, unknown> | undefined;

      if (!row) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      const historicalArr = sqlite.prepare(
        'SELECT quarter, arr FROM historical_arr WHERE account_id = ? ORDER BY quarter ASC'
      ).all(req.params.id) as { quarter: string; arr: number }[];

      const productMediansRow = sqlite.prepare(`
        SELECT product, AVG(arr / seat_count) as median_price
        FROM accounts WHERE seat_count > 0 GROUP BY product
      `).all() as { product: string; median_price: number }[];
      const medianMap: Record<string, number> = {};
      for (const r of productMediansRow) medianMap[r.product] = r.median_price;

      res.json({
        ...row,
        reasons: row.reasons ? JSON.parse(row.reasons as string) : [],
        tone_label: TONE_LABELS[row.tone as number] ?? 'Neutral',
        historical_arr: historicalArr,
        product_median_arr_per_seat: medianMap[row.product as string] ?? 0,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
