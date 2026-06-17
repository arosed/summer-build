import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api, type Account } from '../../lib/api';
import type { Screen } from '../../App';

interface Props {
  category: string;
  navigate: (s: Screen) => void;
}

const CATEGORY_CONFIG: Record<string, { label: string }> = {
  churn_risk:      { label: 'Churn Risk' },
  expansion_ready: { label: 'Expansion Ready' },
  flat_renewal:    { label: 'Flat Renewal' },
  pricing_upsell:  { label: 'Pricing Upsell' },
  product_upsell:  { label: 'Product Upsell' },
};

const SIGNAL_LABEL: Record<string, string> = {
  churn_risk:      'Flag Rep',
  expansion_ready: 'Upsell Seats',
  pricing_upsell:  'Pricing Upsell',
  product_upsell:  'Product Upsell',
  flat_renewal:    'Flat Renewal',
};

const TONE_LABEL: Record<number, string> = { 0: 'Bad', 1: 'Neutral', 2: 'Positive' };

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function computeProductMedians(accts: Account[]): Record<string, number> {
  const byProduct: Record<string, number[]> = {};
  for (const a of accts) {
    if (a.seat_count > 0) {
      if (!byProduct[a.product]) byProduct[a.product] = [];
      byProduct[a.product].push(a.arr / a.seat_count);
    }
  }
  const medians: Record<string, number> = {};
  for (const [product, vals] of Object.entries(byProduct)) {
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medians[product] = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  return medians;
}

function computeAggressiveness(acct: Account, productMedians: Record<string, number>): number {
  const signal = acct.signal;
  if (signal !== 'pricing_upsell' && signal !== 'product_upsell') return 0;
  const median = productMedians[acct.product];
  if (!median || acct.seat_count === 0) return 0;
  const pricePerSeat = acct.arr / acct.seat_count;
  if (signal === 'pricing_upsell') {
    const pctBelow = ((median - pricePerSeat) / median) * 100;
    if (pctBelow >= 40) return 2;
    if (pctBelow >= 30) return 1;
    return 0;
  }
  const pctAbove = ((pricePerSeat - median) / median) * 100;
  if (pctAbove >= 15) return 2;
  if (pctAbove >= 10) return 1;
  return 0;
}

const AGGR_CONFIG: Record<number, { label: string; classes: string }> = {
  0: { label: 'Standard',   classes: 'bg-slate-100 text-slate-600' },
  1: { label: 'Assertive',  classes: 'bg-amber-100 text-amber-700' },
  2: { label: 'Aggressive', classes: 'bg-red-100 text-red-700' },
};

function getKeyMetric(acct: Account, signal: string, productMedians: Record<string, number>): string {
  const usagePct = acct.seat_count > 0 ? Math.round((acct.seats_active / acct.seat_count) * 100) : 0;

  if (signal === 'pricing_upsell') {
    const pricePerSeat = acct.seat_count > 0 ? acct.arr / acct.seat_count : 0;
    const medianAnnual = productMedians[acct.product] ?? pricePerSeat;
    const monthlyPerSeat = Math.round(pricePerSeat / 12);
    const medianMonthly = Math.round(medianAnnual / 12);
    return `$${monthlyPerSeat}/seat vs. $${medianMonthly} median`;
  }

  if (signal === 'product_upsell') {
    return acct.product;
  }

  return `${usagePct}% active`;
}

export default function RenewalManagerAccountList({ category, navigate }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [productMedians, setProductMedians] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.accounts.list().then((all) => {
      setProductMedians(computeProductMedians(all));
      const filtered = all
        .filter((a) => a.signal === category)
        .sort((a, b) => a.contract_end_date.localeCompare(b.contract_end_date));
      setAccounts(filtered);
      setLoading(false);
    });
  }, [category]);

  const showAggression = category === 'pricing_upsell' || category === 'product_upsell';
  const cfg = CATEGORY_CONFIG[category] ?? { label: category };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <div className="border-b border-gray-100 px-6 py-3.5 flex items-center">
        <span className="text-xl font-bold text-[hsl(24,95%,53%)]">Pareto</span>
        <span className="mx-2 text-slate-300">·</span>
        <span className="font-medium text-slate-700">{cfg.label}</span>
        <button
          onClick={() => navigate({ view: 'renewal-manager' })}
          className="ml-auto flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Renewal Manager
        </button>
      </div>

      <div className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">{cfg.label}</h1>
          <p className="text-slate-400 mt-0.5 text-sm">{loading ? '...' : `${accounts.length} accounts`}</p>
        </div>

        {loading ? (
          <div className="text-slate-400 text-center py-20">Loading...</div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Account</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Key Metric</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">ARR</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Seat Usage</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Tone</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Signal</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Reason</th>
                  {showAggression && (
                    <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Aggression</th>
                  )}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {accounts.map((acct) => {
                  const usagePct = acct.seat_count > 0 ? Math.round((acct.seats_active / acct.seat_count) * 100) : 0;
                  const signal = acct.signal ?? category;
                  const keyMetric = getKeyMetric(acct, signal, productMedians);
                  const isChurn = signal === 'churn_risk';
                  const isExpansion = signal === 'expansion_ready';
                  const firstReason = acct.reasons?.[0] ?? '';
                  const aggrLevel = showAggression ? computeAggressiveness(acct, productMedians) : 0;
                  const aggrCfg = AGGR_CONFIG[aggrLevel] ?? AGGR_CONFIG[0];
                  return (
                    <tr key={acct.account_id} className="border-b border-gray-50 hover:bg-gray-50/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 text-xs">{acct.account_name}</div>
                        <div className="text-xs text-slate-400">{acct.product}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-semibold ${isChurn ? 'text-red-600' : isExpansion ? 'text-green-600' : 'text-slate-800'}`}>
                          {keyMetric}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 text-sm">{fmt(acct.arr)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{usagePct}%</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{TONE_LABEL[acct.tone] ?? 'Neutral'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${isChurn ? 'text-red-600' : isExpansion ? 'text-green-600' : 'text-slate-700'}`}>
                          {SIGNAL_LABEL[signal] ?? signal}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[220px]">
                        {firstReason}
                      </td>
                      {showAggression && (
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${aggrCfg.classes}`}>
                            {aggrCfg.label}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate({ view: 'renewal-plan', accountId: acct.account_id, from: 'renewal-manager-list' })}
                          className="text-xs text-[hsl(24,95%,53%)] hover:underline whitespace-nowrap font-medium"
                        >
                          View Renewal Plan →
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={showAggression ? 9 : 8} className="px-4 py-12 text-center text-slate-400 text-sm">
                      No accounts in this category
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
