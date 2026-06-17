import { Router, Request, Response } from 'express';
import { sqlite } from '../db/index.js';
import { getModelInfo } from '../ml/churnModel.js';

export function churnRouter() {
  const router = Router();

  // GET /api/churn/model-info
  router.get('/model-info', (_req: Request, res: Response) => {
    res.json(getModelInfo());
  });

  // GET /api/churn/:id
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const prediction = sqlite.prepare('SELECT * FROM churn_predictions WHERE account_id = ?').get(req.params.id);

      if (!prediction) {
        res.status(404).json({ error: 'No churn prediction found for this account' });
        return;
      }

      res.json(prediction);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
