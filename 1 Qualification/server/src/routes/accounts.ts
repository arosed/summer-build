import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { accounts } from '../db/schema.js';

export function accountsRouter(runEngine: () => Promise<void>) {
  const router = Router();

  // GET /api/accounts
  router.get('/', (_req: Request, res: Response) => {
    try {
      const rows = sqlite.prepare(`
        SELECT a.*, qr.signal, qr.status_color, qr.recommended_action, qr.reasons, qr.updated_at, qr.is_new,
               cp.churn_probability, cp.churned_predicted
        FROM accounts a
        LEFT JOIN qualification_results qr ON a.account_id = qr.account_id
        LEFT JOIN churn_predictions cp ON a.account_id = cp.account_id
        ORDER BY qr.is_new DESC,
                 CASE qr.signal
                   WHEN 'churn_risk' THEN 0
                   WHEN 'expansion_ready' THEN 1
                   WHEN 'renewal_prep' THEN 2
                   WHEN 'underutilizing' THEN 3
                   ELSE 4
                 END
      `).all();

      const result = (rows as Record<string, unknown>[]).map((r) => ({
        ...r,
        reasons: r.reasons ? JSON.parse(r.reasons as string) : [],
      }));

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/accounts/simulate-daily
  router.post('/simulate-daily', async (_req: Request, res: Response) => {
    try {
      const allAccounts = db.select().from(accounts).all();
      if (allAccounts.length === 0) {
        res.json({ changed: [] });
        return;
      }

      // Pick 6-10 random accounts to mutate
      const shuffled = [...allAccounts].sort(() => Math.random() - 0.5);
      const toMutate = shuffled.slice(0, Math.min(8, shuffled.length));
      const changedIds: string[] = [];

      // Clear is_new flags first
      sqlite.prepare('UPDATE qualification_results SET is_new = 0').run();

      for (const acct of toMutate) {
        const roll = Math.random();
        if (roll < 0.33) {
          // Decrease logins (disengagement)
          const newLogins = Math.max(0, acct.logins_90d - Math.floor(Math.random() * 50 + 10));
          sqlite.prepare('UPDATE accounts SET logins_90d = ? WHERE account_id = ?').run(newLogins, acct.account_id);
        } else if (roll < 0.66) {
          // Increase seats active (expansion pressure)
          const newSeats = Math.min(Math.round(acct.seat_count * 1.3), acct.seats_active + Math.floor(Math.random() * 5 + 1));
          sqlite.prepare('UPDATE accounts SET seats_active = ? WHERE account_id = ?').run(newSeats, acct.account_id);
        } else {
          // Advance renewal date by 10 days (closer to renewal)
          const currentEnd = new Date(acct.contract_end_date);
          currentEnd.setDate(currentEnd.getDate() - 10);
          sqlite.prepare('UPDATE accounts SET contract_end_date = ? WHERE account_id = ?')
            .run(currentEnd.toISOString().slice(0, 10), acct.account_id);
        }
        changedIds.push(acct.account_id);
      }

      await runEngine();

      // Mark changed accounts as is_new
      for (const id of changedIds) {
        sqlite.prepare('UPDATE qualification_results SET is_new = 1 WHERE account_id = ?').run(id);
      }

      res.json({ changed: changedIds });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/accounts/:id
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const row = sqlite.prepare(`
        SELECT a.*, qr.signal, qr.status_color, qr.recommended_action, qr.reasons, qr.updated_at, qr.is_new,
               cp.churn_probability, cp.churned_predicted,
               cp.feature1_name, cp.feature1_shap, cp.feature1_direction,
               cp.feature2_name, cp.feature2_shap, cp.feature2_direction
        FROM accounts a
        LEFT JOIN qualification_results qr ON a.account_id = qr.account_id
        LEFT JOIN churn_predictions cp ON a.account_id = cp.account_id
        WHERE a.account_id = ?
      `).get(req.params.id) as Record<string, unknown> | undefined;

      if (!row) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      res.json({ ...row, reasons: row.reasons ? JSON.parse(row.reasons as string) : [] });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/accounts/:id/historical-arr
  router.get('/:id/historical-arr', (req: Request, res: Response) => {
    try {
      const rows = sqlite.prepare('SELECT * FROM historical_arr WHERE account_id = ? ORDER BY quarter ASC').all(req.params.id);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
