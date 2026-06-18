const API = '/api';

export interface Account {
  account_id: string;
  account_name: string;
  arr: number;
  mrr: number;
  seat_count: number;
  seats_active: number;
  logins_90d: number;
  support_ticket_count: number;
  num_previous_contracts: number;
  contract_end_date: string;
  contract_length_days: number;
  contract_start_date: string;
  tier: string;
  product: string;
  feature_adoption_score: number;
  churned: number;
  tone: number;
  tone_label?: string;
  // from qualification_results
  signal?: 'churn_risk' | 'expansion_ready' | 'pricing_upsell' | 'product_upsell' | 'flat_renewal' | null;
  status_color?: string;
  recommended_action?: string;
  reasons?: string[];
  is_new?: number;
  updated_at?: string;
}

export interface HistoricalArr {
  id?: number;
  account_id: string;
  quarter: string;
  arr: number;
}

export interface RenewalManagerCategory {
  signal: string;
  count: number;
  currentArr: number;
  projectedArr: number;
}

export interface RenewalManagerData {
  categories: RenewalManagerCategory[];
  totalArr: number;
  projectedArr: number;
}

export interface RenewalPlanAccount extends Account {
  historical_arr: HistoricalArr[];
  product_median_arr_per_seat: number;
}

export async function streamSSE(
  response: Response,
  onChunk: (data: Record<string, unknown>) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          onChunk(data);
        } catch {
          // ignore malformed lines
        }
      }
    }
  }
}

export const api = {
  accounts: {
    list: (): Promise<Account[]> => fetch(`${API}/accounts`).then((r) => r.json()),
    simulateDaily: (): Promise<{ changed: string[] }> =>
      fetch(`${API}/accounts/simulate-daily`, { method: 'POST' }).then((r) => r.json()),
    renewalManager: (): Promise<RenewalManagerData> =>
      fetch(`${API}/accounts/renewal-manager`).then((r) => r.json()),
    renewalPlan: (id: string): Promise<RenewalPlanAccount> =>
      fetch(`${API}/accounts/${id}/renewal-plan`).then((r) => r.json()),
  },
  agent: {
    qualifyInstruction: (instruction: string) =>
      fetch(`${API}/agent/qualify-instruction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      }),
  },
  config: {
    reset: (): Promise<{ ok: boolean }> =>
      fetch(`${API}/config/reset`, { method: 'POST' }).then((r) => r.json()),
  },
};
