import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { db, sqlite } from '../db/index.js';
import { qualificationConfig } from '../db/schema.js';

export function agentRouter(runEngine: () => Promise<void>) {
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

  function parseConfigFromInstruction(instruction: string): Record<string, number> | null {
    const lower = instruction.toLowerCase();
    const updates: Record<string, number> = {};

    // churn usage threshold
    const churnMatch = lower.match(/(?:churn|usage).*?(?:threshold|to|at|below)\s+(\d+(?:\.\d+)?)\s*%?/);
    if (churnMatch) {
      let val = parseFloat(churnMatch[1]);
      if (val > 1) val = val / 100;
      updates['churn_usage_threshold'] = val;
    }

    // expansion threshold
    const expansionMatch = lower.match(/(?:expansion|upsell|capacity).*?(?:threshold|at|to)\s+(\d+(?:\.\d+)?)\s*%?/);
    if (expansionMatch) {
      let val = parseFloat(expansionMatch[1]);
      if (val > 1) val = val / 100;
      updates['expansion_usage_threshold'] = val;
    }

    // renewal window
    const renewalMatch = lower.match(/(?:renewal|window).*?(?:to|at)\s+(\d+)\s*(?:days?)?/);
    if (renewalMatch) {
      updates['renewal_window_days'] = parseInt(renewalMatch[1]);
    }

    // pricing upsell ratio
    const pricingMatch = lower.match(/(?:pricing|price).*?(?:ratio|threshold|at|to)\s+(\d+(?:\.\d+)?)\s*%?/);
    if (pricingMatch) {
      let val = parseFloat(pricingMatch[1]);
      if (val > 1) val = val / 100;
      updates['pricing_upsell_ratio'] = val;
    }

    return Object.keys(updates).length > 0 ? updates : null;
  }

  // POST /api/agent/qualify-instruction — SSE stream
  router.post('/qualify-instruction', async (req: Request, res: Response) => {
    startSSE(res);
    try {
      const { instruction } = req.body as { instruction: string };

      sendSSE(res, { type: 'thinking', text: `Processing: "${instruction}"\n\nAnalyzing qualification rule change...\n` });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      let configUpdates: Record<string, number> | null = null;

      if (apiKey) {
        const client = new Anthropic({ apiKey });
        const currentConfig = db.select().from(qualificationConfig).all();
        const configStr = currentConfig.map((c) => `${c.key}: ${c.value} (${c.description})`).join('\n');

        const prompt = `You are a qualification engine configuration agent.

CURRENT CONFIG:
${configStr}

USER INSTRUCTION: "${instruction}"

Parse this instruction and determine which config values to update. Valid keys:
- churn_usage_threshold (decimal 0-1, e.g. 0.40 for 40% — accounts below this usage are flagged as churn risk)
- expansion_usage_threshold (decimal 1+, e.g. 1.30 for 130% — accounts above this are flagged for seat expansion)
- pricing_upsell_ratio (decimal 0-1, e.g. 0.70 — accounts priced below this fraction of product median get pricing upsell)
- renewal_window_days (integer days, e.g. 90)

Explain your reasoning, then output a JSON block:
\`\`\`json
{"updates": {"churn_usage_threshold": 0.40}}
\`\`\``;

        let fullText = '';
        const stream = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const chunk = event.delta.text;
            fullText += chunk;
            sendSSE(res, { type: 'thinking', text: chunk });
          }
        }

        const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            configUpdates = parsed.updates || parsed;
          } catch {}
        }
      }

      if (!configUpdates) {
        sendSSE(res, { type: 'thinking', text: '\nParsing instruction with pattern matching...\n' });
        configUpdates = parseConfigFromInstruction(instruction);
      }

      if (!configUpdates || Object.keys(configUpdates).length === 0) {
        sendSSE(res, { type: 'thinking', text: '\nCould not parse a config change from that instruction. Try: "set churn threshold to 40%" or "change renewal window to 90 days"\n' });
        sendSSE(res, { type: 'complete', changed_count: 0 });
        res.end();
        return;
      }

      for (const [key, value] of Object.entries(configUpdates)) {
        const oldRow = sqlite.prepare('SELECT value FROM qualification_config WHERE key = ?').get(key) as { value: string } | undefined;
        const oldValue = oldRow?.value ?? 'unknown';
        sqlite.prepare('UPDATE qualification_config SET value = ? WHERE key = ?').run(String(value), key);
        sendSSE(res, { type: 'config_update', key, old_value: oldValue, new_value: String(value) });
      }

      sendSSE(res, { type: 'thinking', text: '\n\nRe-running qualification engine across all accounts...\n' });

      await runEngine();

      const changed = sqlite.prepare('SELECT COUNT(*) as cnt FROM qualification_results WHERE is_new = 1').get() as { cnt: number };

      sendSSE(res, { type: 'rerun_complete', changed_count: changed.cnt });
      sendSSE(res, { type: 'thinking', text: `✓ Engine re-run complete. ${changed.cnt} accounts changed signal.\n` });
      sendSSE(res, { type: 'complete', changed_count: changed.cnt });
    } catch (err) {
      sendSSE(res, { type: 'error', message: String(err) });
    }
    res.end();
  });

  return router;
}
