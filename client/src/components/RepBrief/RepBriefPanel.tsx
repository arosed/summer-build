import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Users, Calendar, DollarSign, Send, Loader2, Star } from 'lucide-react';
import { api, type Account, type HistoricalArr, streamSSE } from '../../lib/api';
import ArrChart from './ArrChart';

interface Props {
  account: Account | null;
  onClose: () => void;
}

const PRODUCT_MEDIANS: Record<string, number> = {
  'Core Platform': 24000,
  'Growth Suite': 48000,
  'Enterprise Suite': 96000,
  'Core Platform + Analytics': 36000,
};

const PRODUCT_NEW_FEATURES: Record<string, Array<{ name: string; release_date: string }>> = {
  'Core Platform': [{ name: 'AI Auto-tagging', release_date: '2025-03-15' }],
  'Growth Suite': [{ name: 'Advanced Analytics Dashboard', release_date: '2025-06-01' }],
  'Enterprise Suite': [{ name: 'AI Forecasting', release_date: '2025-08-01' }, { name: 'Custom Integrations', release_date: '2025-01-15' }],
  'Core Platform + Analytics': [{ name: 'Predictive Scoring', release_date: '2025-05-01' }],
};

function StatCard({ icon, label, value, sub, trend }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <div className="flex items-center gap-2 mb-2 text-slate-400">{icon}<span className="text-xs font-medium">{label}</span></div>
      <div className="font-bold text-slate-900 text-lg leading-tight">{value}</div>
      {sub && (
        <div className={`text-xs mt-0.5 flex items-center gap-1 ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-500' : 'text-slate-500'}`}>
          {trend === 'up' && <TrendingUp className="w-3 h-3" />}
          {trend === 'down' && <TrendingDown className="w-3 h-3" />}
          {sub}
        </div>
      )}
    </div>
  );
}

export default function RepBriefPanel({ account, onClose }: Props) {
  const [historicalArr, setHistoricalArr] = useState<HistoricalArr[]>([]);
  const [narrative, setNarrative] = useState('');
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [briefInstruction, setBriefInstruction] = useState('');
  const [briefStreaming, setBriefStreaming] = useState(false);
  const [arrTarget, setArrTarget] = useState<number | null>(null);
  const prevAccountId = useRef<string | null>(null);

  useEffect(() => {
    if (account && account.account_id !== prevAccountId.current) {
      prevAccountId.current = account.account_id;
      setHistoricalArr([]);
      setNarrative('');
      setArrTarget(null);

      api.accounts.historicalArr(account.account_id).then(setHistoricalArr);
      loadNarrative(account.account_id);
    }
  }, [account]);

  async function loadNarrative(accountId: string) {
    setNarrativeLoading(true);
    setNarrative('');
    const res = await api.agent.repBrief(accountId);
    await streamSSE(res, (data) => {
      const d = data as { type: string; text?: string; value?: number };
      if (d.type === 'text') setNarrative((n) => n + (d.text ?? ''));
      if (d.type === 'arr_target') setArrTarget(d.value ?? null);
    });
    setNarrativeLoading(false);
  }

  async function submitBriefInstruction() {
    if (!account || !briefInstruction.trim()) return;
    const instr = briefInstruction.trim();
    setBriefInstruction('');
    setBriefStreaming(true);
    setNarrative('');

    const res = await api.agent.repBrief(account.account_id, instr);
    await streamSSE(res, (data) => {
      const d = data as { type: string; text?: string; value?: number };
      if (d.type === 'text') setNarrative((n) => n + (d.text ?? ''));
      if (d.type === 'arr_target') setArrTarget(d.value ?? null);
    });
    setBriefStreaming(false);
  }

  if (!account) return null;

  const util = account.seat_count > 0 ? (account.seats_active / account.seat_count) * 100 : 0;
  const daysToRenewal = Math.round((new Date(account.contract_end_date).getTime() - Date.now()) / 86400000);
  const renewalColor = daysToRenewal < 30 ? 'text-red-600' : daysToRenewal < 90 ? 'text-amber-600' : 'text-green-700';

  const prevArr = historicalArr.length >= 2 ? historicalArr[historicalArr.length - 2]?.arr : null;
  const arrDelta = prevArr ? account.arr - prevArr : null;
  const arrDeltaPct = prevArr && prevArr > 0 ? ((account.arr - prevArr) / prevArr) * 100 : null;

  const signalBannerColor: Record<string, string> = {
    churn_risk: 'bg-red-50 border-red-200 text-red-800',
    expansion_ready: 'bg-green-50 border-green-200 text-green-800',
    underutilizing: 'bg-amber-50 border-amber-200 text-amber-800',
    renewal_prep: 'bg-amber-50 border-amber-200 text-amber-800',
    healthy: 'bg-green-50 border-green-200 text-green-800',
  };

  const productMedian = PRODUCT_MEDIANS[account.product] ?? 50000;
  const newFeatures = (PRODUCT_NEW_FEATURES[account.product] ?? []).filter(
    (f) => new Date(f.release_date) > new Date(account.contract_start_date)
  );
  const paysAboveMedian = account.arr > productMedian;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      <motion.div
        key="panel"
        initial={{ x: 500, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 500, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 truncate">{account.account_name}</div>
            <div className="text-xs text-slate-500">{account.tier} · {account.product}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Signal banner */}
          {account.signal && (
            <div className={`mx-5 mt-4 p-3 rounded-xl border text-sm font-medium ${signalBannerColor[account.signal] ?? signalBannerColor.healthy}`}>
              <div className="font-semibold mb-0.5 capitalize">{account.signal?.replace('_', ' ')}</div>
              <div className="font-normal text-xs opacity-90">{account.recommended_action}</div>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 px-5 mt-4">
            <StatCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Current ARR"
              value={`$${arrTarget ? arrTarget.toLocaleString() : account.arr.toLocaleString()}`}
              sub={arrTarget && arrTarget !== account.arr ? `Target: $${arrTarget.toLocaleString()}` : undefined}
              trend="neutral"
            />
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="Seat Utilization"
              value={`${Math.round(util)}%`}
              sub={`${account.seats_active} of ${account.seat_count} active`}
              trend={util >= 100 ? 'up' : util < 60 ? 'down' : 'neutral'}
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="ARR Delta"
              value={arrDelta !== null ? `${arrDelta >= 0 ? '+' : ''}$${Math.abs(arrDelta).toLocaleString()}` : '—'}
              sub={arrDeltaPct !== null ? `${arrDeltaPct >= 0 ? '+' : ''}${arrDeltaPct.toFixed(1)}% vs prior quarter` : undefined}
              trend={arrDelta !== null ? (arrDelta >= 0 ? 'up' : 'down') : 'neutral'}
            />
            <StatCard
              icon={<Calendar className="w-4 h-4" />}
              label="Days to Renewal"
              value={`${daysToRenewal}d`}
              sub={new Date(account.contract_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              trend={daysToRenewal < 30 ? 'down' : 'neutral'}
            />
          </div>

          {/* ARR Chart */}
          <div className="px-5 mt-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">ARR Trend</h3>
            <ArrChart data={historicalArr} contractEndDate={account.contract_end_date} />
          </div>

          {/* New features upsell */}
          {newFeatures.length > 0 && (
            <div className="mx-5 mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">New Since Last Renewal</span>
              </div>
              <div className="text-sm text-green-700 font-medium mb-1">{newFeatures[0].name}</div>
              <div className="text-xs text-green-600 mb-2">
                Released {new Date(newFeatures[0].release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div className="text-xs text-green-700">
                {paysAboveMedian
                  ? `Paying $${account.arr.toLocaleString()} vs. $${productMedian.toLocaleString()} product median — willingness-to-pay proven. Price this upsell aggressively.`
                  : `Currently at $${account.arr.toLocaleString()} vs. $${productMedian.toLocaleString()} median. Frame upsell around feature value to justify step-up pricing.`
                }
              </div>
            </div>
          )}

          {/* Narrative */}
          <div className="px-5 mt-5 mb-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Account Summary</h3>
            <div className="text-sm text-slate-600 leading-relaxed min-h-[60px]">
              {narrativeLoading && !narrative ? (
                <div className="flex items-center gap-2 text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating brief...
                </div>
              ) : (
                <>
                  {narrative}
                  {narrativeLoading && <span className="inline-block w-1.5 h-3 bg-slate-400 animate-pulse ml-0.5" />}
                </>
              )}
            </div>
          </div>

          {/* Instruct agent */}
          <div className="px-5 pb-5">
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
              <p className="text-xs text-slate-500 mb-2">Instruct the agent (e.g. "focus on expansion strategy")</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={briefInstruction}
                  onChange={(e) => setBriefInstruction(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitBriefInstruction()}
                  placeholder="Update the strategy..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[hsl(24,95%,53%)]"
                  disabled={briefStreaming}
                />
                <button
                  onClick={submitBriefInstruction}
                  disabled={briefStreaming || !briefInstruction.trim()}
                  className="flex items-center gap-1 bg-slate-900 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {briefStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
