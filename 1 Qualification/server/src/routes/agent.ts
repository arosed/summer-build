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

    // underutilizing threshold patterns
    const utilMatch = lower.match(/(?:lower|set|change|reduce).*?(?:underutil|utiliz).*?(?:to|at|bar to)\s+(\d+(?:\.\d+)?)\s*%?/);
    if (utilMatch) {
      let val = parseFloat(utilMatch[1]);
      if (val > 1) val = val / 100; // convert % to decimal
      updates['underutilizing_threshold'] = val;
    }

    // renewal window patterns
    const renewalMatch = lower.match(/(?:renewal|window).*?(?:to|at)\s+(\d+)\s*(?:days?)?/);
    if (renewalMatch) {
      updates['renewal_window_days'] = parseInt(renewalMatch[1]);
    }

    // expansion threshold patterns
    const expansionMatch = lower.match(/(?:expansion|upsell).*?(?:threshold|trigger|at|to)\s+(\d+(?:\.\d+)?)\s*%?/);
    if (expansionMatch) {
      let val = parseFloat(expansionMatch[1]);
      if (val > 1) val = val / 100;
      updates['expansion_threshold'] = val;
    }

    // churn login threshold
    const loginMatch = lower.match(/(?:churn|login).*?(?:threshold|below|under|at)\s+(\d+)/);
    if (loginMatch) {
      updates['churn_login_threshold'] = parseInt(loginMatch[1]);
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
- underutilizing_threshold (decimal 0-1, e.g. 0.55 for 55%)
- expansion_threshold (decimal 0-1, e.g. 1.0 for 100%)
- renewal_window_days (integer days, e.g. 90)
- churn_login_threshold (integer, e.g. 3)

Explain your reasoning, then output a JSON block:
\`\`\`json
{"updates": {"underutilizing_threshold": 0.55}}
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

      // Fallback to regex parsing
      if (!configUpdates) {
        sendSSE(res, { type: 'thinking', text: '\nParsing instruction with pattern matching...\n' });
        configUpdates = parseConfigFromInstruction(instruction);
      }

      if (!configUpdates || Object.keys(configUpdates).length === 0) {
        sendSSE(res, { type: 'thinking', text: '\nCould not parse a config change from that instruction. Try: "lower the underutilizing bar to 55%" or "change renewal window to 90 days"\n' });
        sendSSE(res, { type: 'complete', changed_count: 0 });
        res.end();
        return;
      }

      // Apply config updates
      for (const [key, value] of Object.entries(configUpdates)) {
        const oldRow = sqlite.prepare('SELECT value FROM qualification_config WHERE key = ?').get(key) as { value: string } | undefined;
        const oldValue = oldRow?.value ?? 'unknown';
        sqlite.prepare('UPDATE qualification_config SET value = ? WHERE key = ?').run(String(value), key);
        sendSSE(res, { type: 'config_update', key, old_value: oldValue, new_value: String(value) });
      }

      sendSSE(res, { type: 'thinking', text: '\n\nRe-running qualification engine across all accounts...\n' });

      await runEngine();

      // Count changed accounts (is_new)
      const changed = sqlite.prepare('SELECT COUNT(*) as cnt FROM qualification_results WHERE is_new = 1').get() as { cnt: number };

      sendSSE(res, { type: 'rerun_complete', changed_count: changed.cnt });
      sendSSE(res, { type: 'thinking', text: `✓ Engine re-run complete. ${changed.cnt} accounts changed signal.\n` });
      sendSSE(res, { type: 'complete', changed_count: changed.cnt });
    } catch (err) {
      sendSSE(res, { type: 'error', message: String(err) });
    }
    res.end();
  });

  // POST /api/agent/rep-brief — SSE stream
  router.post('/rep-brief', async (req: Request, res: Response) => {
    startSSE(res);
    try {
      const { account_id, instruction } = req.body as { account_id: string; instruction?: string };

      const account = sqlite.prepare(`
        SELECT a.*, qr.signal, qr.recommended_action, qr.reasons,
               cp.churn_probability, cp.feature1_name, cp.feature1_shap
        FROM accounts a
        LEFT JOIN qualification_results qr ON a.account_id = qr.account_id
        LEFT JOIN churn_predictions cp ON a.account_id = cp.account_id
        WHERE a.account_id = ?
      `).get(account_id) as Record<string, unknown> | undefined;

      if (!account) {
        sendSSE(res, { type: 'error', message: 'Account not found' });
        res.end();
        return;
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      const util = account.seat_count ? Math.round((Number(account.seats_active) / Number(account.seat_count)) * 100) : 0;
      const endDate = new Date(account.contract_end_date as string);
      const daysToRenewal = Math.round((endDate.getTime() - Date.now()) / 86400000);

      if (apiKey) {
        const client = new Anthropic({ apiKey });
        const prompt = instruction
          ? `Update the sales strategy for account "${account.account_name}":
             Current ARR: $${Number(account.arr).toLocaleString()}
             Seat utilization: ${util}%
             Days to renewal: ${daysToRenewal}
             Signal: ${account.signal}

             New instruction: ${instruction}

             Provide an updated 2-3 sentence strategy recommendation and suggested ARR target.`
          : `Write a brief 2-3 sentence account narrative for a sales rep:
             Account: ${account.account_name} (${account.tier} tier, ${account.product})
             ARR: $${Number(account.arr).toLocaleString()}, Seat utilization: ${util}%
             Days to renewal: ${daysToRenewal}
             Signal: ${account.signal}
             Recommended action: ${account.recommended_action}

             Be specific, data-driven, and action-oriented. Focus on what the rep should do next.`;

        const stream = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            sendSSE(res, { type: 'text', text: event.delta.text });
          }
        }
      } else {
        // Templated fallback
        const narratives: Record<string, string> = {
          churn_risk: `${account.account_name} is showing critical disengagement signals — only ${account.logins_90d} logins in the last 90 days with ${util}% seat utilization. Immediate executive outreach is required to understand root cause and present a retention offer before the ${daysToRenewal}-day renewal window closes.`,
          expansion_ready: `${account.account_name} is hitting capacity constraints at ${util}% seat utilization, signaling strong product-market fit and an organic upsell opportunity. With ${daysToRenewal} days to renewal, this is the ideal moment to introduce a seat expansion or tier upgrade — their current usage trajectory justifies the conversation.`,
          underutilizing: `${account.account_name} is only utilizing ${util}% of their licensed seats, which puts renewal at risk if value isn't demonstrated before the ${daysToRenewal}-day window. Prioritize an adoption health review, activate dormant users, and connect them with a CSM for hands-on enablement.`,
          renewal_prep: `${account.account_name} has entered the renewal window with ${daysToRenewal} days remaining and ${util}% seat utilization — a solid foundation for renewal at or above current ARR. Begin stakeholder alignment now, prepare a QBR deck highlighting ROI, and confirm decision-maker availability.`,
          healthy: `${account.account_name} is performing well at ${util}% utilization with ${daysToRenewal} days to renewal — no immediate risk, but a proactive touchpoint will deepen the relationship. Share upcoming roadmap features and identify internal champions who can sponsor expansion when the time is right.`,
        };

        const text = narratives[account.signal as string] || narratives['healthy'];
        for (const word of text.split(' ')) {
          sendSSE(res, { type: 'text', text: word + ' ' });
          await new Promise((r) => setTimeout(r, 20));
        }
      }

      if (instruction) {
        // Return suggested ARR adjustment
        const arrAdjustment = account.signal === 'expansion_ready'
          ? Math.round(Number(account.arr) * 1.25)
          : Number(account.arr);
        sendSSE(res, { type: 'arr_target', value: arrAdjustment });
      }

      sendSSE(res, { type: 'complete' });
    } catch (err) {
      sendSSE(res, { type: 'error', message: String(err) });
    }
    res.end();
  });

  return router;
}
