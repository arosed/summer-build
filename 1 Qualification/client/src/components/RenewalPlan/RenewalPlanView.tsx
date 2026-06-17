import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api, type RenewalPlanAccount } from '../../lib/api';
import ArrChart from '../RepBrief/ArrChart';

interface Props {
  accountId: string;
  onClose: () => void;
}

const PRODUCT_NEXT_TIER: Record<string, string> = {
  'Core Platform': 'Growth Suite',
  'Growth Suite': 'Core Platform + Analytics',
  'Enterprise Suite': 'Enterprise Suite (full)',
  'Core Platform + Analytics': 'Enterprise Suite',
};

function daysTo(endDate: string): number {
  const end = new Date(endDate + 'T00:00:00Z');
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end.getTime() - todayUTC) / 86400000);
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
}

function aggrTierName(level: number): string {
  if (level >= 2) return 'Aggressive';
  if (level >= 1) return 'Assertive';
  return 'Standard';
}

function computeAggrLevel(acct: RenewalPlanAccount): number {
  const median = acct.product_median_arr_per_seat ?? 0;
  if (!median || acct.seat_count === 0) return 0;
  const pricePerSeat = acct.arr / acct.seat_count;
  if (acct.signal === 'pricing_upsell') {
    const pctBelow = ((median - pricePerSeat) / median) * 100;
    if (pctBelow >= 40) return 2;
    if (pctBelow >= 30) return 1;
    return 0;
  }
  if (acct.signal === 'product_upsell') {
    const pctAbove = ((pricePerSeat - median) / median) * 100;
    if (pctAbove >= 15) return 2;
    if (pctAbove >= 10) return 1;
    return 0;
  }
  return 0;
}

function buildRationale(acct: RenewalPlanAccount): string {
  const usagePct = acct.seat_count > 0 ? Math.round((acct.seats_active / acct.seat_count) * 100) : 0;
  const days = daysTo(acct.contract_end_date);
  const endDateStr = fmtDate(acct.contract_end_date);
  const monthlyPerSeat = acct.seat_count > 0 ? Math.round((acct.arr / acct.seat_count) / 12) : 0;
  const medianAnnual = acct.product_median_arr_per_seat ?? 0;
  const medianMonthly = Math.round(medianAnnual / 12);
  const pctBelow = medianAnnual > 0 ? Math.round((1 - (acct.arr / acct.seat_count) / medianAnnual) * 100) : 0;
  const nextTier = PRODUCT_NEXT_TIER[acct.product] ?? 'higher tier';
  const toneLabel = acct.tone_label ?? 'Neutral';

  switch (acct.signal) {
    case 'churn_risk':
      return `${acct.account_name} has only ${acct.seats_active} of ${acct.seat_count} licensed seats in active use (${usagePct}%), well below the 50% engagement threshold. With ${acct.logins_90d} logins over the last 90 days and ${acct.support_ticket_count} open support tickets, this account shows signs of disengagement. Recommend flagging for rep review immediately to understand root cause and develop a retention plan before the renewal on ${endDateStr}.`;

    case 'expansion_ready':
      return `${acct.account_name} is using ${acct.seats_active} seats against a license for ${acct.seat_count} — ${usagePct}% utilization, exceeding licensed capacity. With ${acct.logins_90d} logins in the last 90 days, users are actively engaged. This account is a strong candidate for a seat expansion conversation. Recommend proactively presenting an expanded license to capture revenue and formalize the overage before renewal on ${endDateStr}.`;

    case 'pricing_upsell': {
      const aggrLevel = computeAggrLevel(acct);
      const tier = aggrTierName(aggrLevel);
      const tierContext = aggrLevel >= 2
        ? `With ${pctBelow}% pricing headroom, there is strong justification for a full correction to median or above.`
        : aggrLevel === 1
        ? `With ${pctBelow}% pricing headroom, a structured move toward median pricing is well-supported.`
        : `At ${pctBelow}% below median, a meaningful increase framed around delivered value is appropriate.`;
      return `${acct.account_name} is currently paying $${monthlyPerSeat}/seat/month, which is ${pctBelow}% below the $${medianMonthly} median for ${acct.product} accounts. With ${acct.seats_active} of ${acct.seat_count} seats active (${usagePct}% utilization) and a ${toneLabel} engagement tone, this account is well-positioned for a pricing correction at renewal. ${tierContext} Recommended push level: ${tier}. Present a revised rate of $${Math.round(medianMonthly * 0.90)}–$${Math.round(medianMonthly * 1.05)}/seat/month, framing the increase around product value delivered over the contract term. Renewal is in ${days} days.`;
    }

    case 'product_upsell': {
      const aggrLevel = computeAggrLevel(acct);
      const tier = aggrTierName(aggrLevel);
      const monthlyPerSeatVal = acct.seat_count > 0 ? Math.round((acct.arr / acct.seat_count) / 12) : 0;
      const medianMonthlyVal = Math.round((acct.product_median_arr_per_seat ?? 0) / 12);
      const pctAbove = medianMonthlyVal > 0 ? Math.round(((monthlyPerSeatVal - medianMonthlyVal) / medianMonthlyVal) * 100) : 0;
      const priceContext = pctAbove > 0
        ? `At $${monthlyPerSeatVal}/seat/month (${pctAbove}% above the $${medianMonthlyVal} median for ${acct.product}), this customer demonstrates above-market price tolerance — supporting a ${tier} upgrade pitch.`
        : `At $${monthlyPerSeatVal}/seat/month (near the $${medianMonthlyVal} median for ${acct.product}), a ${tier} upgrade conversation is appropriate.`;
      return `${acct.account_name} is on ${acct.product} (${acct.tier} tier) and has demonstrated positive engagement: ${acct.seats_active}/${acct.seat_count} seats active (${usagePct}%), ${acct.logins_90d} logins in 90 days, and a Positive account tone. ${priceContext} With ${days} days to renewal, this is the right window to present an upgrade path to ${nextTier}. Recommend a discovery call to identify which higher-tier features align with their current usage patterns.`;
    }

    case 'flat_renewal':
      return `${acct.account_name} is approaching renewal in ${days} days with ${acct.seats_active}/${acct.seat_count} seats active (${usagePct}% utilization) and pricing near the $${medianMonthly} median for ${acct.product}. There are no strong signals for upsell or risk. Recommend a straightforward renewal outreach — confirm key stakeholders, present the renewal contract, and close before the deadline of ${endDateStr}.`;

    default:
      return `${acct.account_name} is ${days > 0 ? `${days} days from renewal` : 'past renewal'}. Review account health metrics and prepare for outreach.`;
  }
}

const ACTION_LABEL: Record<string, string> = {
  churn_risk:      'FLAG REP',
  expansion_ready: 'UPSELL SEATS',
  pricing_upsell:  'PRICING UPSELL',
  product_upsell:  'PRODUCT UPSELL',
  flat_renewal:    'FLAT RENEWAL',
};

function buildMetrics(acct: RenewalPlanAccount): { label: string; value: string; highlight?: boolean }[] {
  const usagePct = acct.seat_count > 0 ? Math.round((acct.seats_active / acct.seat_count) * 100) : 0;
  const monthlyPerSeat = acct.seat_count > 0 ? Math.round((acct.arr / acct.seat_count) / 12) : 0;
  const medianMonthly = Math.round((acct.product_median_arr_per_seat ?? 0) / 12);
  const toneLabel = acct.tone_label ?? 'Neutral';

  const base: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'ARR', value: fmt(acct.arr) },
    { label: 'Seat Count', value: String(acct.seat_count) },
    { label: 'Seats Active', value: String(acct.seats_active) },
    { label: 'Usage', value: `${usagePct}%` },
    { label: 'Logins (90d)', value: String(acct.logins_90d) },
    { label: 'Support Tickets', value: String(acct.support_ticket_count) },
    { label: 'Prior Contracts', value: String(acct.num_previous_contracts) },
  ];

  switch (acct.signal) {
    case 'churn_risk':
    case 'expansion_ready':
      return base.map((m) => ({ ...m, highlight: m.label === 'Seats Active' || m.label === 'Usage' }));
    case 'pricing_upsell':
      return [
        ...base,
        { label: '$/Seat/Mo', value: `$${monthlyPerSeat}`, highlight: true },
        { label: 'Median/Seat/Mo', value: `$${medianMonthly}`, highlight: true },
        { label: 'Aggression', value: aggrTierName(computeAggrLevel(acct)), highlight: true },
      ];
    case 'product_upsell':
      return [
        ...base,
        { label: 'Product', value: acct.product, highlight: true },
        { label: 'Tone', value: toneLabel, highlight: true },
        { label: '$/Seat/Mo', value: `$${monthlyPerSeat}`, highlight: true },
        { label: 'Median/Seat/Mo', value: `$${medianMonthly}`, highlight: true },
        { label: 'Aggression', value: aggrTierName(computeAggrLevel(acct)), highlight: true },
      ];
    default:
      return base;
  }
}

function ContractHistoryTable({ data }: { data: { quarter: string; arr: number }[] }) {
  if (!data.length) return <p className="text-sm text-gray-400">No history available.</p>;

  return (
    <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-200">
          <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Year</th>
          <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">ARR</th>
          <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Δ vs Prior</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => {
          const prev = data[i - 1];
          const delta = prev ? row.arr - prev.arr : null;
          return (
            <tr key={row.quarter} className="border-b border-gray-100">
              <td className="px-4 py-2 text-xs text-gray-700">{row.quarter}</td>
              <td className="px-4 py-2 text-xs font-medium text-gray-900">{fmt(row.arr)}</td>
              <td className="px-4 py-2 text-xs">
                {delta != null ? (
                  <span className={delta >= 0 ? 'text-gray-500' : 'text-gray-400'}>
                    {delta >= 0 ? '+' : ''}{fmt(delta)}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function RenewalPlanView({ accountId, onClose }: Props) {
  const [acct, setAcct] = useState<RenewalPlanAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.accounts.renewalPlan(accountId).then((a) => { setAcct(a); setLoading(false); });
  }, [accountId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const days = acct ? daysTo(acct.contract_end_date) : null;
  const rationale = acct ? buildRationale(acct) : '';
  const actionLabel = acct ? (ACTION_LABEL[acct.signal ?? ''] ?? 'REVIEW') : '';
  const toneLabel = acct?.tone_label ?? 'Neutral';
  const metrics = acct ? buildMetrics(acct) : [];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 inset-y-0 w-full max-w-2xl bg-white z-50 shadow-2xl flex flex-col">

        {/* Sticky header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl font-bold text-[hsl(24,95%,53%)]">Pareto</span>
            <span className="text-slate-300">·</span>
            <span className="font-medium text-slate-700 truncate">
              {loading ? 'Loading…' : acct?.account_name ?? 'Renewal Plan'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400">Loading renewal plan…</div>
          ) : !acct ? (
            <div className="flex items-center justify-center h-48 text-gray-400">Account not found.</div>
          ) : (
            <div className="px-8 py-8 text-gray-900 font-sans">

              {/* Section 1: Account Header */}
              <div className="mb-7 pb-7 border-b border-gray-200">
                <h1 className="text-2xl font-light text-gray-900 mb-1 tracking-tight">{acct.account_name}</h1>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500 mb-3">
                  <span>{acct.product}</span>
                  <span>{acct.tier} Tier</span>
                  <span>Tone: {toneLabel}</span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                  <span>Contract: {fmtDate(acct.contract_start_date)} → {fmtDate(acct.contract_end_date)}</span>
                  <span>{days != null && days > 0 ? `${days} days to renewal` : `${Math.abs(days ?? 0)} days overdue`}</span>
                </div>
              </div>

              {/* Section 2: Recommendation */}
              <div className="mb-7 pb-7 border-b border-gray-200">
                <div className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">Recommendation</div>
                <div className="text-lg font-semibold text-gray-900 mb-3">RECOMMENDED: {actionLabel}</div>
                <p className="text-sm leading-relaxed text-gray-700">{rationale}</p>
              </div>

              {/* Section 3: Key Metrics */}
              <div className="mb-7 pb-7 border-b border-gray-200">
                <div className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">Key Metrics</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {metrics.map(({ label, value, highlight }) => (
                    <div
                      key={label}
                      className={`rounded-lg p-3 border ${highlight ? 'border-gray-900 bg-gray-50' : 'border-gray-100'}`}
                    >
                      <div className={`text-xs mb-1 ${highlight ? 'text-gray-600 font-semibold' : 'text-gray-400'}`}>
                        {label}
                      </div>
                      <div className={`font-semibold text-gray-900 ${highlight ? 'text-base' : 'text-sm'}`}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 4: ARR History */}
              <div className="mb-7 pb-7 border-b border-gray-200">
                <div className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">ARR History</div>
                {acct.historical_arr && acct.historical_arr.length > 0 ? (
                  <ArrChart data={acct.historical_arr} contractEndDate={acct.contract_end_date} />
                ) : (
                  <p className="text-sm text-gray-400">No trend data available.</p>
                )}
              </div>

              {/* Section 5: Contract History */}
              <div className="mb-8">
                <div className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">Contract History</div>
                <ContractHistoryTable data={acct.historical_arr ?? []} />
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}
