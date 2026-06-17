import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, type Account } from '../../lib/api';
import AgentConsole from './AgentConsole';

const PAGE_SIZE = 25;

interface Props {
  accounts: Account[];
  loading: boolean;
  onSelectAccount: (a: Account) => void;
  onAccountsUpdate: (accounts: Account[]) => void;
}

function formatArr(arr: number): string {
  if (arr >= 1_000_000) return `$${(arr / 1_000_000).toFixed(1)}M`;
  if (arr >= 1000) return `$${Math.round(arr / 1000)}K`;
  return `$${arr.toLocaleString()}`;
}

function daysLabel(contractEndDate: string): { label: string; days: number; color: string } {
  const end = new Date(contractEndDate + 'T00:00:00Z');
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((end.getTime() - todayUTC) / 86400000);
  const label = days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`;
  const color = days < 0 ? 'text-red-600' : days <= 120 ? 'text-amber-700' : 'text-slate-500';
  return { label, days, color };
}

const PLAYBOOK_CONFIG: Record<string, { label: string; class: string }> = {
  churn_risk:      { label: 'Flag Rep',       class: 'text-red-600 font-bold' },
  expansion_ready: { label: 'Upsell Seats',   class: 'text-green-600 font-bold' },
  pricing_upsell:  { label: 'Pricing Upsell', class: 'text-amber-600 font-bold' },
  product_upsell:  { label: 'Product Upsell', class: 'text-emerald-600 font-bold' },
  flat_renewal:    { label: 'Flat Renewal',   class: 'text-blue-600 font-bold' },
};

const TONE_CONFIG: Record<number, { label: string }> = {
  0: { label: 'Bad' },
  1: { label: 'Neutral' },
  2: { label: 'Positive' },
};

function SeatUsageBar({ active, total }: { active: number; total: number }) {
  const pct = total > 0 ? (active / total) * 100 : 0;
  const clampedPct = Math.min(100, pct);
  const barColor = pct >= 125 ? 'bg-green-500' : pct < 50 ? 'bg-red-400' : 'bg-blue-400';

  return (
    <div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`text-xs font-semibold ${pct >= 125 ? 'text-green-600' : pct < 50 ? 'text-red-600' : 'text-slate-700'}`}>
          {Math.round(pct)}%
        </span>
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

export default function AccountTable({ accounts, loading, onSelectAccount, onAccountsUpdate }: Props) {
  const [simulating, setSimulating] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [accounts]);

  const totalPages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
  const pageAccounts = accounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
          <p className="text-sm text-slate-500">
            {accounts.length} accounts · showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, accounts.length)}
          </p>
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

      <div className="mb-4">
        <AgentConsole onAccountsUpdate={onAccountsUpdate} />
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Account</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Product</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">ARR</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Seat Usage</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Tone</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Renewal</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">Playbook</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {pageAccounts.map((acct) => {
                const renewal = daysLabel(acct.contract_end_date);
                const playbook = acct.signal ? PLAYBOOK_CONFIG[acct.signal] : null;
                const tone = TONE_CONFIG[acct.tone] ?? TONE_CONFIG[1];
                return (
                  <motion.tr
                    key={acct.account_id}
                    initial={{ opacity: 0, y: -8 }}
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
                          <div className="text-xs text-slate-400">{acct.tier}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{acct.product}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900 text-sm">{formatArr(acct.arr)}</td>
                    <td className="px-4 py-3">
                      <SeatUsageBar active={acct.seats_active} total={acct.seat_count} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{tone.label}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-xs font-medium ${renewal.color}`}>{renewal.label}</span>
                        <span className="text-xs text-slate-400">
                          {new Date(acct.contract_end_date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {playbook
                        ? <span className={`text-sm ${playbook.class}`}>{playbook.label}</span>
                        : <span className="text-xs text-slate-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="text-xs text-slate-500 hover:text-slate-900 border border-gray-200 px-2 py-1 rounded-lg hover:border-slate-400 transition-colors"
                        onClick={() => onSelectAccount(acct)}
                      >
                        Plan →
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
            .reduce<(number | 'ellipsis')[]>((acc, n, idx, arr) => {
              if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
              acc.push(n);
              return acc;
            }, [])
            .map((item, idx) =>
              item === 'ellipsis' ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-xs text-slate-400">…</span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage(item as number)}
                  className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium transition-colors ${
                    page === item
                      ? 'bg-[hsl(24,95%,53%)] text-white'
                      : 'text-slate-600 hover:bg-gray-100'
                  }`}
                >
                  {item}
                </button>
              )
            )}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
