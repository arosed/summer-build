import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { api, type Account } from '../../lib/api';
import type { Screen } from '../../App';

interface Props {
  navigate: (s: Screen) => void;
}

const PLAY_LABEL: Record<string, string> = {
  churn_risk:      'Flag Rep',
  expansion_ready: 'Upsell Seats',
  pricing_upsell:  'Pricing Upsell',
  product_upsell:  'Product Upsell',
  flat_renewal:    'Flat Renewal',
};

function daysToRenewal(dateStr: string): number {
  const end = new Date(dateStr + 'T00:00:00Z');
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end.getTime() - todayUTC) / 86400000);
}

function HumanFigure() {
  return (
    <svg viewBox="0 0 48 52" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="24" cy="15" r="10" />
      <path d="M4 50 Q24 30 44 50" />
    </svg>
  );
}

function AgentFigure() {
  return (
    <svg viewBox="0 0 48 52" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="11" y="4" width="26" height="22" rx="3" />
      <rect x="5" y="30" width="38" height="18" rx="3" />
    </svg>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.25 },
  }),
};

function HumanCard({ account, index }: { account: Account; index: number }) {
  const days = daysToRenewal(account.contract_end_date);
  const usagePct = account.seat_count > 0
    ? Math.round((account.seats_active / account.seat_count) * 100)
    : 0;
  const topConcern = account.reasons?.[0] ?? 'Low engagement detected';

  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      className="rounded-lg border border-gray-200 bg-white px-4 py-3.5 mb-2"
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="font-semibold text-slate-900 text-sm leading-tight">{account.account_name}</div>
        <span className="text-xs text-red-500 font-medium ml-3 shrink-0 tabular-nums">{days}d to renewal</span>
      </div>
      <div className="text-xs font-medium text-red-600 mb-1.5">{topConcern}</div>
      <p className="text-xs text-slate-500 leading-relaxed mb-3">
        {usagePct}% seat utilization across {account.seat_count} licensed seats. Rep review required to assess retention risk and build a recovery plan.
      </p>
      <button className="text-xs font-medium text-slate-600 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
        Account Summary
      </button>
    </motion.div>
  );
}

function JsonCard({ account, index }: { account: Account; index: number }) {
  const play = PLAY_LABEL[account.signal ?? ''] ?? account.recommended_action ?? '—';
  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      className="font-mono text-xs rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 mb-2"
    >
      <span className="text-gray-400">{'{'}</span>
      <div className="pl-3 leading-5">
        <div>
          <span className="text-blue-500">"account"</span>
          <span className="text-gray-400">: </span>
          <span className="text-emerald-600">"{account.account_name}"</span>
          <span className="text-gray-300">,</span>
        </div>
        <div>
          <span className="text-blue-500">"seat_count"</span>
          <span className="text-gray-400">: </span>
          <span className="text-orange-500">{account.seat_count}</span>
          <span className="text-gray-300">,</span>
        </div>
        <div>
          <span className="text-blue-500">"recommended_play"</span>
          <span className="text-gray-400">: </span>
          <span className="text-emerald-600">"{play}"</span>
          <span className="text-gray-300">,</span>
        </div>
        <div className="text-gray-300 italic">"...": "..."</div>
      </div>
      <span className="text-gray-400">{'}'}</span>
    </motion.div>
  );
}

export default function AgentPassthrough({ navigate }: Props) {
  const [churnAccounts, setChurnAccounts] = useState<Account[]>([]);
  const [agentAccounts, setAgentAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.accounts.list().then((all) => {
      const signaled = all.filter((a) => !!a.signal);
      setChurnAccounts(signaled.filter((a) => a.signal === 'churn_risk'));
      setAgentAccounts(signaled.filter((a) => a.signal !== 'churn_risk'));
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <div className="border-b border-gray-100 px-6 py-3.5 flex items-center">
        <span className="text-xl font-bold text-[hsl(24,95%,53%)]">Pareto</span>
        <span className="mx-2 text-slate-300">·</span>
        <span className="text-slate-600 font-light">Agent Passthrough</span>
        <button
          onClick={() => navigate({ view: 'renewal-manager' })}
          className="ml-auto flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Renewal Manager
        </button>
      </div>

      <div className="flex-1 px-6 py-8 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Next Agent Passthrough</h1>
            <p className="text-slate-400 mt-0.5 text-sm">Plan submitted — routing accounts to next stage</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-sm font-medium shrink-0">
            <CheckCircle2 className="w-4 h-4" />
            Plan Approved
          </div>
        </div>

        {loading ? (
          <div className="text-slate-400 text-center py-20">Loading...</div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {/* Human Review */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-red-50/60 border-b border-gray-200 px-5 py-4 flex items-center gap-3">
                <div className="text-red-400">
                  <HumanFigure />
                </div>
                <div>
                  <div className="font-semibold text-slate-800 text-sm">Human Review</div>
                  <div className="text-xs text-slate-400 mt-0.5">Churn Risk · {churnAccounts.length} account{churnAccounts.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div className="px-4 py-4 max-h-[480px] overflow-y-auto">
                {churnAccounts.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No churn risk accounts</p>
                ) : (
                  churnAccounts.map((a, i) => (
                    <HumanCard key={a.account_id} account={a} index={i} />
                  ))
                )}
              </div>
            </div>

            {/* Outreach Agent */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-orange-50/40 border-b border-gray-200 px-5 py-4 flex items-center gap-3">
                <div className="text-[hsl(24,95%,53%)]">
                  <AgentFigure />
                </div>
                <div>
                  <div className="font-semibold text-slate-800 text-sm">Outreach Agent</div>
                  <div className="text-xs text-slate-400 mt-0.5">Active Renewals · {agentAccounts.length} account{agentAccounts.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div className="px-4 py-4 max-h-[480px] overflow-y-auto">
                {agentAccounts.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No active renewal accounts</p>
                ) : (
                  agentAccounts.map((a, i) => (
                    <JsonCard key={a.account_id} account={a} index={i} />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
