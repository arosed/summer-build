import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { matchSchema, editNormalization, applyMappings } from '../normalizer/normalizer.js';
import { db, sqlite } from '../db/index.js';
import { normalizationMappings } from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({ storage: multer.memoryStorage() });

export function setupRouter(
  runEngine: () => Promise<void>,
  trainModel: () => Promise<void>
) {
  const router = Router();

  function sendSSE(res: Response, data: unknown) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if ((res as Response & { flush?: () => void }).flush) {
      (res as Response & { flush: () => void }).flush();
    }
  }

  function startSSE(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
  }

  // GET /api/setup/normalization-status
  router.get('/normalization-status', (_req: Request, res: Response) => {
    const mappings = db.select().from(normalizationMappings).all();
    res.json(mappings);
  });

  // POST /api/setup/use-sample — SSE stream
  router.post('/use-sample', async (_req: Request, res: Response) => {
    startSSE(res);
    try {
      const csvPath = path.join(__dirname, '..', '..', 'public', 'sample_column_descriptions.csv');
      const csv = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf-8') : '';

      sendSSE(res, { type: 'start', message: 'Starting schema normalization agent...\n' });

      const mappings = await matchSchema(csv, (text) => {
        sendSSE(res, { type: 'thinking', text });
      });

      sendSSE(res, { type: 'mappings', data: mappings });
      sendSSE(res, { type: 'complete' });
    } catch (err) {
      sendSSE(res, { type: 'error', message: String(err) });
    }
    res.end();
  });

  // POST /api/setup/upload-descriptions — SSE stream
  router.post('/upload-descriptions', upload.single('file'), async (req: Request, res: Response) => {
    startSSE(res);
    try {
      const csvContent = req.file
        ? req.file.buffer.toString('utf-8')
        : '';

      sendSSE(res, { type: 'start', message: 'Analyzing uploaded column descriptions...\n' });

      const mappings = await matchSchema(csvContent, (text) => {
        sendSSE(res, { type: 'thinking', text });
      });

      sendSSE(res, { type: 'mappings', data: mappings });
      sendSSE(res, { type: 'complete' });
    } catch (err) {
      sendSSE(res, { type: 'error', message: String(err) });
    }
    res.end();
  });

  // POST /api/setup/edit-normalization — SSE stream
  router.post('/edit-normalization', async (req: Request, res: Response) => {
    startSSE(res);
    try {
      const { instruction } = req.body as { instruction: string };
      const currentMappings = db.select().from(normalizationMappings).all();

      sendSSE(res, { type: 'start', message: `Processing instruction: "${instruction}"\n\n` });

      const updated = await editNormalization(
        instruction,
        currentMappings.map((m) => ({
          canonical_field: m.canonical_field,
          raw_column: m.raw_column,
          confidence: m.confidence ?? 0.8,
          transform_fn_code: m.transform_fn_code ?? '(x) => x',
          transform_description: m.transform_description ?? '',
        })),
        (text) => {
          sendSSE(res, { type: 'thinking', text });
        }
      );

      sendSSE(res, { type: 'mappings', data: updated });
      sendSSE(res, { type: 'complete' });
    } catch (err) {
      sendSSE(res, { type: 'error', message: String(err) });
    }
    res.end();
  });

  // POST /api/setup/confirm — normalize + train + run engine
  router.post('/confirm', async (_req: Request, res: Response) => {
    try {
      const mappings = db.select().from(normalizationMappings).all();
      if (mappings.length === 0) {
        res.status(400).json({ error: 'No normalization mappings found. Run schema matching first.' });
        return;
      }

      const count = await applyMappings(
        mappings.map((m) => ({
          canonical_field: m.canonical_field,
          raw_column: m.raw_column,
          confidence: m.confidence ?? 0.8,
          transform_fn_code: m.transform_fn_code ?? '(x) => x',
          transform_description: m.transform_description ?? '',
        }))
      );

      await trainModel();
      await runEngine();

      res.json({ success: true, accountCount: count });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
