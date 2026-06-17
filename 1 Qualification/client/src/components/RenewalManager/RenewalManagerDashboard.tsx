import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { api, type RenewalManagerData } from '../../lib/api';
import type { Screen } from '../../App';

interface Props {
  navigate: (s: Screen) => void;
}

const CATEGORY_ORDER = ['expansion_ready', 'flat_renewal', 'pricing_upsell', 'product_upsell', 'churn_risk'];

const CATEGORY_LABEL: Record<string, string> = {
  churn_risk:      'Churn Risk',
  expansion_ready: 'Expansion Ready',
  flat_renewal:    'Flat Renewal',
  pricing_upsell:  'Pricing Upsell',
  product_upsell:  'Product Upsell',
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtDelta(delta: number, pct: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${fmt(delta)} (${sign}${pct.toFixed(1)}%)`;
}

export default function RenewalManagerDashboard({ navigate }: Props) {
  const [data, setData] = useState<RenewalManagerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);

  useEffect(() => {
    api.accounts.renewalManager().then((d) => { setData(d); setLoading(false); });
  }, []);

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const churnCat = data?.categories.find((c) => c.signal === 'churn_risk');
  const nonChurnCats = data?.categories.filter((c) => c.signal !== 'churn_risk') ?? [];
  const currentArrExclChurn = nonChurnCats.reduce((s, c) => s + c.currentArr, 0);
  const projectedArrExclChurn = nonChurnCats.reduce((s, c) => s + c.projectedArr, 0);
  const heroDelta = projectedArrExclChurn - currentArrExclChurn;
  const heroDeltaPct = currentArrExclChurn > 0 ? (heroDelta / currentArrExclChurn) * 100 : 0;

  const sortedCategories = data
    ? CATEGORY_ORDER.map((sig) => data.categories.find((c) => c.signal === sig)).filter(Boolean)
    : [];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <div className="border-b border-gray-100 px-6 py-3.5 flex items-center">
        <span className="text-xl font-bold text-[hsl(24,95%,53%)]">Pareto</span>
        <span className="mx-2 text-slate-300">·</span>
        <span className="text-slate-600 font-light">Renewal Manager Dashboard</span>
        <button
          onClick={() => navigate({ view: 'dashboard' })}
          className="ml-auto flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>

      <div className="flex-1 px-6 py-8 max-w-5xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Renewal Manager Dashboard</h1>
          <p className="text-slate-400 mt-0.5 text-sm">{today}</p>
        </div>

        {loading ? (
          <div className="text-slate-400 text-center py-20">Loading...</div>
        ) : data ? (
          <>
            {/* Hero ARR block */}
            <div className="border border-gray-200 rounded-xl px-8 py-7 mb-4">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-4">
                Planned ARR Increase in Cohort
              </div>
              <div className="flex items-end gap-6 flex-wrap">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Current ARR</div>
                  <div className="text-4xl font-bold text-slate-900 tabular-nums">{fmt(currentArrExclChurn)}</div>
                </div>
                <ArrowRight className="w-6 h-6 text-slate-300 mb-2" />
                <div>
                  <div className="text-xs text-slate-400 mb-1">Planned ARR</div>
                  <div className="text-4xl font-bold text-slate-900 tabular-nums">{fmt(projectedArrExclChurn)}</div>
                </div>
                <div className="mb-1">
                  <div className={`text-2xl font-semibold tabular-nums ${heroDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmtDelta(heroDelta, heroDeltaPct)}
                  </div>
                </div>
              </div>
            </div>

            {/* Churn at-risk note */}
            {churnCat && churnCat.count > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 mb-8 rounded-lg border border-red-100 bg-red-50/50 text-sm">
                <span className="text-red-500 font-bold">⚠</span>
                <span className="text-red-700">
                  <span className="font-semibold">{churnCat.count} churn risk account{churnCat.count !== 1 ? 's' : ''}</span>
                  {' '}·{' '}
                  <span className="font-semibold">{fmt(churnCat.currentArr)}</span> at risk — excluded from projection above
                </span>
              </div>
            )}

            {/* Category breakdown table */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3 text-slate-500 font-medium text-xs">Category</th>
                    <th className="text-right px-5 py-3 text-slate-500 font-medium text-xs">Accounts</th>
                    <th className="text-right px-5 py-3 text-slate-500 font-medium text-xs">Current ARR</th>
                    <th className="text-right px-5 py-3 text-slate-500 font-medium text-xs">Planned ARR</th>
                    <th className="text-right px-5 py-3 text-slate-500 font-medium text-xs">Change</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sortedCategories.map((cat) => {
                    if (!cat) return null;
                    const delta = cat.projectedArr - cat.currentArr;
                    const pct = cat.currentArr > 0 ? (delta / cat.currentArr) * 100 : 0;
                    const isChurn = cat.signal === 'churn_risk';
                    return (
                      <tr key={cat.signal} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-5 py-3.5">
                          <span className={`font-medium text-sm ${isChurn ? 'text-red-700' : 'text-slate-800'}`}>
                            {CATEGORY_LABEL[cat.signal] ?? cat.signal}
                          </span>
                          {isChurn && (
                            <span className="ml-2 text-xs text-red-400 font-normal">excluded from total</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-700 tabular-nums">{cat.count}</td>
                        <td className={`px-5 py-3.5 text-right font-medium tabular-nums ${isChurn ? 'text-red-600' : 'text-slate-900'}`}>{fmt(cat.currentArr)}</td>
                        <td className="px-5 py-3.5 text-right font-medium tabular-nums text-slate-400">
                          {isChurn ? '—' : fmt(cat.projectedArr)}
                        </td>
                        <td className={`px-5 py-3.5 text-right font-semibold tabular-nums text-sm ${!isChurn && delta < 0 ? 'text-red-600' : !isChurn && delta > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                          {isChurn || delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${pct.toFixed(0)}%`}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => navigate({ view: 'renewal-manager-list', category: cat.signal })}
                            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors ml-auto"
                          >
                            View Accounts <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Action footer */}
            <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
              <button className="px-5 py-2.5 text-sm font-medium border border-gray-200 text-slate-600 rounded-lg hover:bg-gray-50 transition-colors">
                Revise
              </button>
              <button
                onClick={() => {
                  setIsApproving(true);
                  setTimeout(() => navigate({ view: 'agent-passthrough' }), 1500);
                }}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[hsl(24,95%,53%)] text-white rounded-lg hover:bg-[hsl(24,85%,45%)] transition-colors"
              >
                Approve Plan <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : null}
      </div>

      {isApproving && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
          <span className="text-2xl font-bold text-[hsl(24,95%,53%)] mb-6">Pareto</span>
          <div className="w-10 h-10 border-4 border-gray-200 border-t-[hsl(24,95%,53%)] rounded-full animate-spin mb-5" />
          <p className="text-lg font-semibold text-slate-800 mb-2">Processing Renewal Plan...</p>
          <p className="text-sm text-slate-400">Routing accounts to next stage</p>
        </div>
      )}
    </div>
  );
}
