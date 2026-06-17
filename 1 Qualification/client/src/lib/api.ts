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
  // from qualification_results
  signal?: string;
  status_color?: string;
  recommended_action?: string;
  reasons?: string[];
  is_new?: number;
  updated_at?: string;
  // from churn_predictions
  churn_probability?: number;
  churned_predicted?: number;
}

export interface MappingResult {
  canonical_field: string;
  raw_column: string | null;
  confidence: number;
  transform_fn_code: string;
  transform_description: string;
}

export interface HistoricalArr {
  id: number;
  account_id: string;
  quarter: string;
  arr: number;
}

export interface ModelInfo {
  accuracy: number;
  training_size: number;
  features: string[];
  threshold: number;
  n_estimators: number;
}

export interface ChurnPrediction {
  account_id: string;
  churn_probability: number;
  churned_predicted: number;
  feature1_name: string | null;
  feature1_shap: number | null;
  feature1_direction: string | null;
  feature2_name: string | null;
  feature2_shap: number | null;
  feature2_direction: string | null;
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
  setup: {
    useSample: () =>
      fetch(`${API}/setup/use-sample`, { method: 'POST' }),
    uploadDescriptions: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return fetch(`${API}/setup/upload-descriptions`, { method: 'POST', body: form });
    },
    normalizationStatus: (): Promise<MappingResult[]> =>
      fetch(`${API}/setup/normalization-status`).then((r) => r.json()),
    editNormalization: (instruction: string) =>
      fetch(`${API}/setup/edit-normalization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      }),
    confirm: (): Promise<{ success: boolean; accountCount: number }> =>
      fetch(`${API}/setup/confirm`, { method: 'POST' }).then((r) => r.json()),
  },
  accounts: {
    list: (): Promise<Account[]> => fetch(`${API}/accounts`).then((r) => r.json()),
    get: (id: string): Promise<Account> => fetch(`${API}/accounts/${id}`).then((r) => r.json()),
    historicalArr: (id: string): Promise<HistoricalArr[]> =>
      fetch(`${API}/accounts/${id}/historical-arr`).then((r) => r.json()),
    simulateDaily: (): Promise<{ changed: string[] }> =>
      fetch(`${API}/accounts/simulate-daily`, { method: 'POST' }).then((r) => r.json()),
  },
  churn: {
    modelInfo: (): Promise<ModelInfo> => fetch(`${API}/churn/model-info`).then((r) => r.json()),
    predict: (id: string): Promise<ChurnPrediction> =>
      fetch(`${API}/churn/${id}`).then((r) => r.json()),
  },
  agent: {
    qualifyInstruction: (instruction: string) =>
      fetch(`${API}/agent/qualify-instruction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      }),
    repBrief: (account_id: string, instruction?: string) =>
      fetch(`${API}/agent/rep-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id, instruction }),
      }),
  },
};
