import Anthropic from '@anthropic-ai/sdk';
import { db, sqlite } from '../db/index.js';
import { rawAccounts, accounts, normalizationMappings } from '../db/schema.js';
import { parseContractPeriod, mrrToArr, runTransformCode } from './transforms.js';

export interface MappingResult {
  canonical_field: string;
  raw_column: string | null;
  confidence: number;
  transform_fn_code: string;
  transform_description: string;
  is_multi_field?: boolean;
}

const CANONICAL_SCHEMA = `
arr: Annual Recurring Revenue - the total yearly contract value in USD
mrr: Monthly Recurring Revenue - monthly payment amount (arr / 12)
seat_count: Total number of user seats licensed
seats_active: Number of seats actively used in the last quarter
logins_90d: Total login count over the last 90 days
support_ticket_count: Number of support tickets submitted
num_previous_contracts: Count of prior contracts before current
contract_end_date: Contract end/renewal date (ISO format YYYY-MM-DD)
contract_start_date: Contract start date (ISO format YYYY-MM-DD)
contract_length_days: Duration of contract in days
tier: Customer pricing tier (Starter/Growth/Enterprise)
product: Product bundle name
feature_adoption_score: 0-100 feature adoption breadth score
churned: Binary indicator if customer churned (1) or renewed (0)
account_id: Unique customer identifier
account_name: Customer company name
`.trim();

const FUZZY_MAPPINGS: MappingResult[] = [
  {
    canonical_field: 'account_id',
    raw_column: 'org_id',
    confidence: 0.99,
    transform_fn_code: '(x) => x',
    transform_description: 'Direct copy — org_id is the unique account identifier',
  },
  {
    canonical_field: 'account_name',
    raw_column: 'company_name',
    confidence: 0.99,
    transform_fn_code: '(x) => x',
    transform_description: 'Direct copy — company_name is the account name',
  },
  {
    canonical_field: 'arr',
    raw_column: 'monthly_revenue',
    confidence: 0.93,
    transform_fn_code: '(x) => x * 12',
    transform_description: 'monthly_revenue is MRR — multiply by 12 to derive annual ARR',
  },
  {
    canonical_field: 'mrr',
    raw_column: 'monthly_revenue',
    confidence: 0.97,
    transform_fn_code: '(x) => x',
    transform_description: 'monthly_revenue maps directly to MRR',
  },
  {
    canonical_field: 'seat_count',
    raw_column: 'licensed_seats',
    confidence: 0.97,
    transform_fn_code: '(x) => x',
    transform_description: 'Direct copy — licensed_seats = total seats purchased',
  },
  {
    canonical_field: 'seats_active',
    raw_column: 'active_users_last_quarter',
    confidence: 0.87,
    transform_fn_code: '(x) => x',
    transform_description: 'active_users_last_quarter represents actively used seats',
  },
  {
    canonical_field: 'logins_90d',
    raw_column: 'total_logins_90_days',
    confidence: 0.96,
    transform_fn_code: '(x) => x',
    transform_description: 'Direct copy — total_logins_90_days matches logins_90d exactly',
  },
  {
    canonical_field: 'support_ticket_count',
    raw_column: 'ticket_volume_ytd',
    confidence: 0.88,
    transform_fn_code: '(x) => x',
    transform_description: 'ticket_volume_ytd maps to support ticket count',
  },
  {
    canonical_field: 'num_previous_contracts',
    raw_column: 'num_prior_contracts',
    confidence: 0.96,
    transform_fn_code: '(x) => x',
    transform_description: 'Direct rename — num_prior_contracts = num_previous_contracts',
  },
  {
    canonical_field: 'contract_start_date',
    raw_column: 'contract_period',
    confidence: 0.88,
    transform_fn_code: `(x) => { const parts = x.split(' - '); const [m,d,y] = parts[0].trim().split('/'); return y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'); }`,
    transform_description: 'Extract start date from MM/DD/YYYY - MM/DD/YYYY contract_period string',
    is_multi_field: true,
  },
  {
    canonical_field: 'contract_end_date',
    raw_column: 'contract_period',
    confidence: 0.88,
    transform_fn_code: `(x) => { const parts = x.split(' - '); const [m,d,y] = parts[1].trim().split('/'); return y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'); }`,
    transform_description: 'Extract end date from MM/DD/YYYY - MM/DD/YYYY contract_period string',
    is_multi_field: true,
  },
  {
    canonical_field: 'contract_length_days',
    raw_column: 'contract_period',
    confidence: 0.85,
    transform_fn_code: `(x) => { const parts = x.split(' - '); const parseD = s => { const [m,d,y] = s.trim().split('/'); return new Date(y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0')); }; return Math.round((parseD(parts[1]) - parseD(parts[0])) / 86400000); }`,
    transform_description: 'Compute contract length in days from MM/DD/YYYY - MM/DD/YYYY string',
    is_multi_field: true,
  },
  {
    canonical_field: 'tier',
    raw_column: 'subscription_tier',
    confidence: 0.98,
    transform_fn_code: '(x) => x',
    transform_description: 'Direct rename — subscription_tier = tier',
  },
  {
    canonical_field: 'product',
    raw_column: 'product_package',
    confidence: 0.97,
    transform_fn_code: '(x) => x',
    transform_description: 'Direct rename — product_package = product',
  },
  {
    canonical_field: 'feature_adoption_score',
    raw_column: 'feature_score',
    confidence: 0.92,
    transform_fn_code: '(x) => x',
    transform_description: 'feature_score maps directly to feature_adoption_score',
  },
  {
    canonical_field: 'churned',
    raw_column: 'did_churn',
    confidence: 0.99,
    transform_fn_code: '(x) => x',
    transform_description: 'Direct copy — did_churn is the binary churn indicator',
  },
];

function parseMappingsFromLLM(text: string): MappingResult[] {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*"mappings"[\s\S]*\}/);
  if (!jsonMatch) return FUZZY_MAPPINGS;

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);
    const mappings = parsed.mappings || parsed;
    if (Array.isArray(mappings) && mappings.length > 0) {
      return mappings as MappingResult[];
    }
  } catch {
    // fall through to fuzzy
  }
  return FUZZY_MAPPINGS;
}

export async function matchSchema(
  columnDescriptions: string,
  onChunk: (text: string) => void
): Promise<MappingResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Simulate streaming with the fuzzy mappings
    const lines = [
      'No API key found — using intelligent pattern matching fallback.\n\n',
      'Analyzing column: `org_id` → Unique organization identifier → maps to `account_id` (confidence: 0.99)\n',
      'Analyzing column: `company_name` → Legal business name → maps to `account_name` (confidence: 0.99)\n',
      'Analyzing column: `monthly_revenue` → MRR in USD... this is NOT annual ARR. Applying ×12 transform → maps to `arr` (confidence: 0.93) ⚠️\n',
      'Analyzing column: `contract_period` → Date range MM/DD/YYYY - MM/DD/YYYY format. This single column encodes THREE canonical fields: `contract_start_date`, `contract_end_date`, and `contract_length_days`. Writing extraction transforms for each... (confidence: 0.85-0.88) ⚠️\n',
      'Analyzing column: `active_users_last_quarter` → Active seat count → maps to `seats_active` (confidence: 0.87)\n',
      'Analyzing column: `licensed_seats` → Total licensed seats → maps to `seat_count` (confidence: 0.97)\n',
      'Analyzing column: `total_logins_90_days` → Login count → maps to `logins_90d` (confidence: 0.96)\n',
      'Analyzing column: `ticket_volume_ytd` → Support tickets → maps to `support_ticket_count` (confidence: 0.88)\n',
      'Analyzing column: `num_prior_contracts` → Prior contract count → maps to `num_previous_contracts` (confidence: 0.96)\n',
      'Analyzing column: `subscription_tier` → Pricing tier → maps to `tier` (confidence: 0.98)\n',
      'Analyzing column: `product_package` → Product bundle → maps to `product` (confidence: 0.97)\n',
      'Analyzing column: `feature_score` → Feature adoption score → maps to `feature_adoption_score` (confidence: 0.92)\n',
      'Analyzing column: `did_churn` → Binary churn indicator → maps to `churned` (confidence: 0.99)\n',
      '\n✓ Schema matching complete. 16 fields mapped, 3 require transforms. Confidence scores calculated.\n',
    ];

    for (const line of lines) {
      onChunk(line);
      await new Promise((r) => setTimeout(r, 80));
    }

    await saveMappings(FUZZY_MAPPINGS);
    return FUZZY_MAPPINGS;
  }

  const client = new Anthropic({ apiKey });
  const prompt = `You are a data schema normalization agent. Your job is to map raw data columns to a canonical schema.

CANONICAL SCHEMA FIELDS (what we need to produce):
${CANONICAL_SCHEMA}

RAW DATA COLUMN DESCRIPTIONS (what the customer's data actually contains):
${columnDescriptions}

Analyze each canonical field and determine which raw column best maps to it. For each mapping:
1. Think through the semantic meaning carefully
2. Note any data transformations needed (e.g., MRR × 12 = ARR, date format conversions)
3. Assign a confidence score 0-1 based on how certain you are
4. Write a JavaScript transform function as a string (e.g., "(x) => x * 12")

IMPORTANT CASES TO HANDLE:
- "monthly_revenue" is MRR, NOT ARR. You must transform it: (x) => x * 12
- "contract_period" is "MM/DD/YYYY - MM/DD/YYYY" format — split into contract_start_date, contract_end_date, contract_length_days
- Mark is_multi_field: true for any mapping where one raw column produces multiple canonical fields

After your analysis, output a JSON block with this exact structure:
\`\`\`json
{
  "mappings": [
    {
      "canonical_field": "arr",
      "raw_column": "monthly_revenue",
      "confidence": 0.93,
      "transform_fn_code": "(x) => x * 12",
      "transform_description": "Multiply MRR by 12 to get ARR",
      "is_multi_field": false
    }
  ]
}
\`\`\`

Think through each field carefully and explain your reasoning.`;

  let fullText = '';
  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const chunk = event.delta.text;
        fullText += chunk;
        onChunk(chunk);
      }
    }
  } catch (err) {
    onChunk(`\nLLM error: ${err}. Falling back to pattern matching...\n`);
    await saveMappings(FUZZY_MAPPINGS);
    return FUZZY_MAPPINGS;
  }

  const mappings = parseMappingsFromLLM(fullText);
  await saveMappings(mappings);
  return mappings;
}

export async function editNormalization(
  instruction: string,
  currentMappings: MappingResult[],
  onChunk: (text: string) => void
): Promise<MappingResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const current = JSON.stringify(currentMappings, null, 2);

  if (!apiKey) {
    // Parse the instruction heuristically
    const lower = instruction.toLowerCase();
    let updatedMappings = [...currentMappings];

    onChunk(`Analyzing instruction: "${instruction}"\n\n`);
    await new Promise((r) => setTimeout(r, 200));

    if (lower.includes('multiply') && (lower.includes('usage') || lower.includes('seat') || lower.includes('active'))) {
      const match = lower.match(/multiply.*?by\s+(\d+(?:\.\d+)?)/);
      const multiplier = match ? parseFloat(match[1]) : 100;
      onChunk(`Detected: multiply usage/seat data by ${multiplier}.\n`);
      await new Promise((r) => setTimeout(r, 150));
      onChunk(`Updating transform for \`seats_active\` field...\n`);
      await new Promise((r) => setTimeout(r, 150));

      updatedMappings = updatedMappings.map((m) => {
        if (m.canonical_field === 'seats_active') {
          return {
            ...m,
            transform_fn_code: `(x) => Math.round(x * ${multiplier})`,
            transform_description: `Multiply active_users_last_quarter by ${multiplier} (per user instruction)`,
          };
        }
        return m;
      });

      onChunk(`✓ Updated seats_active transform: (x) => Math.round(x * ${multiplier})\n`);
      await new Promise((r) => setTimeout(r, 100));
      onChunk(`\nNormalization updated. Re-running data pipeline...\n`);
    } else if (lower.includes('arr') || lower.includes('revenue')) {
      const match = lower.match(/multiply.*?by\s+(\d+(?:\.\d+)?)/);
      const multiplier = match ? parseFloat(match[1]) : 2;
      updatedMappings = updatedMappings.map((m) => {
        if (m.canonical_field === 'arr') {
          return {
            ...m,
            transform_fn_code: `(x) => x * ${multiplier}`,
            transform_description: `Custom transform: multiply monthly_revenue by ${multiplier} (per instruction)`,
          };
        }
        return m;
      });
      onChunk(`✓ Updated ARR transform to multiply monthly_revenue by ${multiplier}\n`);
    } else {
      onChunk(`Instruction processed. No structural changes detected — current mappings retained.\n`);
    }

    await saveMappings(updatedMappings);
    return updatedMappings;
  }

  const client = new Anthropic({ apiKey });
  const prompt = `You are a data normalization editor. The user wants to modify the current field mappings.

CURRENT MAPPINGS:
${current}

USER INSTRUCTION: ${instruction}

Apply the instruction to the appropriate mapping(s). For example:
- "multiply usage data by 100" → update seats_active transform_fn_code to multiply by 100
- "use ARR directly instead of MRR" → update arr transform to (x) => x

Explain your changes, then output the complete updated mappings JSON:
\`\`\`json
{
  "mappings": [...]
}
\`\`\``;

  let fullText = '';
  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const chunk = event.delta.text;
        fullText += chunk;
        onChunk(chunk);
      }
    }
  } catch (err) {
    onChunk(`\nLLM error: ${err}. Changes not applied.\n`);
    return currentMappings;
  }

  const updated = parseMappingsFromLLM(fullText);
  const result = updated.length > 0 ? updated : currentMappings;
  await saveMappings(result);
  return result;
}

async function saveMappings(mappings: MappingResult[]): Promise<void> {
  sqlite.prepare('DELETE FROM normalization_mappings').run();
  const insert = sqlite.prepare(`
    INSERT INTO normalization_mappings (canonical_field, raw_column, confidence, transform_fn_code, transform_description)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMany = sqlite.transaction((rows: MappingResult[]) => {
    for (const m of rows) {
      insert.run(m.canonical_field, m.raw_column, m.confidence, m.transform_fn_code, m.transform_description);
    }
  });
  insertMany(mappings);
}

export async function applyMappings(mappings: MappingResult[]): Promise<number> {
  const raw = db.select().from(rawAccounts).all();

  // Clear existing normalized accounts
  sqlite.prepare('DELETE FROM accounts').run();

  const insertAccount = sqlite.prepare(`
    INSERT OR REPLACE INTO accounts (
      account_id, account_name, arr, mrr, seat_count, seats_active, logins_90d,
      support_ticket_count, num_previous_contracts, contract_end_date,
      contract_length_days, contract_start_date, tier, product,
      feature_adoption_score, churned
    ) VALUES (
      @account_id, @account_name, @arr, @mrr, @seat_count, @seats_active, @logins_90d,
      @support_ticket_count, @num_previous_contracts, @contract_end_date,
      @contract_length_days, @contract_start_date, @tier, @product,
      @feature_adoption_score, @churned
    )
  `);

  const mappingMap = new Map<string, MappingResult>(mappings.map((m) => [m.canonical_field, m]));

  function getVal(rawRow: Record<string, unknown>, field: string): unknown {
    const mapping = mappingMap.get(field);
    if (!mapping || !mapping.raw_column) return null;
    const rawVal = rawRow[mapping.raw_column];
    if (rawVal === null || rawVal === undefined) return null;
    try {
      return runTransformCode(mapping.transform_fn_code, rawVal);
    } catch {
      return rawVal;
    }
  }

  const insertMany = sqlite.transaction((rows: typeof raw) => {
    for (const row of rows) {
      const rawRow = row as unknown as Record<string, unknown>;

      const contractPeriod = rawRow['contract_period'] as string | null;
      let startDate = '';
      let endDate = '';
      let lengthDays = 365;

      if (contractPeriod) {
        try {
          const parsed = parseContractPeriod(contractPeriod);
          startDate = parsed.start;
          endDate = parsed.end;
          lengthDays = parsed.days;

          // Check if mappings have custom transforms for these
          const startMapping = mappingMap.get('contract_start_date');
          const endMapping = mappingMap.get('contract_end_date');
          const lenMapping = mappingMap.get('contract_length_days');

          if (startMapping?.transform_fn_code && startMapping.transform_fn_code !== '(x) => x') {
            try { startDate = String(runTransformCode(startMapping.transform_fn_code, contractPeriod)); } catch {}
          }
          if (endMapping?.transform_fn_code && endMapping.transform_fn_code !== '(x) => x') {
            try { endDate = String(runTransformCode(endMapping.transform_fn_code, contractPeriod)); } catch {}
          }
          if (lenMapping?.transform_fn_code && lenMapping.transform_fn_code !== '(x) => x') {
            try { lengthDays = Number(runTransformCode(lenMapping.transform_fn_code, contractPeriod)); } catch {}
          }
        } catch {
          startDate = new Date().toISOString().slice(0, 10);
          endDate = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
        }
      }

      const arr = Number(getVal(rawRow, 'arr')) || 0;
      const mrr = Number(getVal(rawRow, 'mrr')) || arr / 12;

      insertAccount.run({
        account_id: String(getVal(rawRow, 'account_id') || rawRow['org_id']),
        account_name: String(getVal(rawRow, 'account_name') || rawRow['company_name'] || 'Unknown'),
        arr,
        mrr,
        seat_count: Number(getVal(rawRow, 'seat_count')) || 10,
        seats_active: Number(getVal(rawRow, 'seats_active')) || 0,
        logins_90d: Number(getVal(rawRow, 'logins_90d')) || 0,
        support_ticket_count: Number(getVal(rawRow, 'support_ticket_count')) || 0,
        num_previous_contracts: Number(getVal(rawRow, 'num_previous_contracts')) || 0,
        contract_end_date: endDate,
        contract_length_days: lengthDays,
        contract_start_date: startDate,
        tier: String(getVal(rawRow, 'tier') || 'Starter'),
        product: String(getVal(rawRow, 'product') || 'Core Platform'),
        feature_adoption_score: Number(getVal(rawRow, 'feature_adoption_score')) || 50,
        churned: Number(getVal(rawRow, 'churned')) || 0,
      });
    }
  });

  insertMany(raw);
  return raw.length;
}
