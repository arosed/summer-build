import { useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { RefreshCw, TrendingUp, AlertTriangle, Zap, Clock, Heart } from 'lucide-react';
import { api, type Account } from '../../lib/api';

interface Props {
  accounts: Account[];
  loading: boolean;
  onSelectAccount: (a: Account) => void;
  onViewChurn: (a: Account) => void;
  onAccountsUpdate: (accounts: Account[]) => void;
}

function formatArr(arr: number): string {
  if (arr >= 1_000_000) return `$${(arr / 1_000_000).toFixed(1)}M`;
  if (arr >= 1000) return `$${Math.round(arr / 1000)}K`;
  return `$${arr.toLocaleString()}`;
}

function daysLabel(contractEndDate: string): { label: string; days: number; color: string } {
  const end = new Date(contractEndDate);
  const days = Math.round((end.getTime() - Date.now()) / 86400000);
  const label = days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`;
  const color = days < 0 ? 'text-red-600 bg-red-50' : days < 30 ? 'text-red-600 bg-red-50' : days < 90 ? 'text-amber-600 bg-amber-50' : 'text-green-700 bg-green-50';
  return { label, days, color };
}

function SignalBadge({ signal }: { signal: string }) {
  const config: Record<string, { label: string; icon: React.ReactNode; class: string }> = {
    churn_risk: { label: 'Churn Risk', icon: <AlertTriangle className="w-3 h-3" />, class: 'bg-red-100 text-red-700 border border-red-200' },
    expansion_ready: { label: 'Expansion Ready', icon: <TrendingUp className="w-3 h-3" />, class: 'bg-green-100 text-green-700 border border-green-200' },
    underutilizing: { label: 'Underutilizing', icon: <Zap className="w-3 h-3" />, class: 'bg-amber-100 text-amber-700 border border-amber-200' },
    renewal_prep: { label: 'Renewal Prep', icon: <Clock className="w-3 h-3" />, class: 'bg-amber-100 text-amber-700 border border-amber-200' },
    healthy: { label: 'Healthy', icon: <Heart className="w-3 h-3" />, class: 'bg-green-100 text-green-700 border border-green-200' },
  };
  const c = config[signal] ?? config['healthy'];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${c.class}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    Starter: 'bg-slate-100 text-slate-600',
    Growth: 'bg-blue-100 text-blue-700',
    Enterprise: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colors[tier] ?? 'bg-slate-100 text-slate-600'}`}>
      {tier}
    </span>
  );
}

function SeatUsageBar({ active, total }: { active: number; total: number }) {
  const pct = total > 0 ? (active / total) * 100 : 0;
  const clampedPct = Math.min(100, pct);
  const barColor = pct >= 100 ? 'bg-green-500' : pct < 50 ? 'bg-amber-400' : 'bg-blue-400';

  return (
    <div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-xs font-semibold text-slate-700">{Math.round(pct)}%</span>
        <span className="text-xs text-slate-400">{active}/{total}</span>
      </div>
      <div className="h-1.5 w-24 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
    </div>
  );
}

export default function AccountTable({ accounts, loading, onSelectAccount, onViewChurn, onAccountsUpdate }: Props) {
  const [simulating, setSimulating] = useState(false);

  async function simulate() {
    setSimulating(true);
    await api.accounts.simulateDaily();
    const updated = await api.accounts.list();
    onAccountsUpdate(updated);
    setSimulating(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
        <span className="ml-2 text-slate-500">Loading accounts...</span>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Account Command Center</h1>
          <p className="text-sm text-slate-500">{accounts.length} accounts · Qualification engine results</p>
        </div>
        <button
          onClick={simulate}
          disabled={simulating}
          className="flex items-center gap-2 border border-gray-200 hover:border-[hsl(24,95%,53%)] hover:text-[hsl(24,95%,53%)] text-slate-600 font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${simulating ? 'animate-spin' : ''}`} />
          Simulate Daily Checks
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Account</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Product</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">ARR</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Seat Usage</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Renewal</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Signal</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Recommended Action</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <LayoutGroup>
            <tbody>
              <AnimatePresence mode="popLayout">
                {accounts.slice(0, 50).map((acct) => {
                  const renewal = daysLabel(acct.contract_end_date);
                  return (
                    <motion.tr
                      key={acct.account_id}
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-gray-50 hover:bg-gray-50/70 cursor-pointer"
                      onClick={() => onSelectAccount(acct)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {acct.is_new === 1 && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="text-xs font-bold bg-[hsl(24,95%,53%)] text-white px-1.5 py-0.5 rounded-full"
                            >
                              NEW
                            </motion.span>
                          )}
                          <div>
                            <div className="font-medium text-slate-900 text-xs">{acct.account_name}</div>
                            <TierBadge tier={acct.tier} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{acct.product}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 text-sm">{formatArr(acct.arr)}</td>
                      <td className="px-4 py-3">
                        <SeatUsageBar active={acct.seats_active} total={acct.seat_count} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${renewal.color}`}>
                            {renewal.label}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(acct.contract_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {acct.signal ? <SignalBadge signal={acct.signal} /> : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[220px]">
                        <span className="line-clamp-2">{acct.recommended_action}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="text-xs text-slate-500 hover:text-slate-900 border border-gray-200 px-2 py-1 rounded-lg hover:border-slate-400 transition-colors"
                            onClick={() => onSelectAccount(acct)}
                          >
                            Brief
                          </button>
                          {acct.signal === 'churn_risk' && (
                            <button
                              className="text-xs text-red-600 hover:text-red-700 border border-red-200 px-2 py-1 rounded-lg hover:border-red-400 transition-colors"
                              onClick={() => onViewChurn(acct)}
                            >
                              ML ↗
                            </button>
                          )}
                          {(acct.churned_predicted === 1) && acct.signal !== 'churn_risk' && (
                            <button
                              className="text-xs text-orange-600 hover:text-orange-700 border border-orange-200 px-2 py-1 rounded-lg transition-colors"
                              onClick={() => onViewChurn(acct)}
                            >
                              ML ↗
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </LayoutGroup>
        </table>
        {accounts.length > 50 && (
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-slate-400">
            Showing 50 of {accounts.length} accounts
          </div>
        )}
      </div>
    </div>
  );
}
