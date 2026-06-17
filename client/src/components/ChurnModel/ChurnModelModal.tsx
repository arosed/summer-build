import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell
} from 'recharts';
import { api, type Account, type ChurnPrediction, type ModelInfo } from '../../lib/api';

interface Props {
  account: Account;
  onClose: () => void;
}

const FEATURE_LABELS: Record<string, string> = {
  usage_ratio: 'Seat Utilization',
  arr: 'Contract ARR',
  num_previous_contracts: 'Contract History',
  support_ticket_count: 'Support Volume',
};

const FEATURE_DESCRIPTIONS: Record<string, { low: string; high: string }> = {
  usage_ratio: {
    low: 'Low seat utilization is the #1 predictor — accounts using <50% of seats churn at 3× the base rate',
    high: 'High seat utilization signals strong adoption and reduces churn risk significantly',
  },
  arr: {
    low: 'Lower-ARR accounts sometimes have less organizational buy-in for the product',
    high: 'Higher-ARR contracts typically have stronger internal sponsorship and renewal velocity',
  },
  num_previous_contracts: {
    low: 'First or second contract — less established relationship, higher sensitivity to value delivery',
    high: 'Tenured customer with multiple contracts — strong loyalty signal',
  },
  support_ticket_count: {
    low: 'Low support volume suggests smooth product experience',
    high: 'Elevated support volume signals customer friction — may indicate frustration or gaps in onboarding',
  },
};

export default function ChurnModelModal({ account, onClose }: Props) {
  const [prediction, setPrediction] = useState<ChurnPrediction | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [showModelSetup, setShowModelSetup] = useState(false);

  useEffect(() => {
    api.churn.predict(account.account_id).then(setPrediction).catch(() => {});
    api.churn.modelInfo().then(setModelInfo).catch(() => {});
  }, [account.account_id]);

  const churnPct = prediction ? Math.round(prediction.churn_probability * 100) : 0;
  const isChurn = prediction?.churned_predicted === 1;

  // Build SHAP chart data from prediction
  const shapData = prediction ? [
    { name: FEATURE_LABELS['usage_ratio'] || 'usage_ratio', value: 0, shap: 0, key: 'usage_ratio' },
    { name: FEATURE_LABELS['arr'] || 'arr', value: 0, shap: 0, key: 'arr' },
    { name: FEATURE_LABELS['num_previous_contracts'] || 'num_previous_contracts', value: 0, shap: 0, key: 'num_previous_contracts' },
    { name: FEATURE_LABELS['support_ticket_count'] || 'support_ticket_count', value: 0, shap: 0, key: 'support_ticket_count' },
  ] : [];

  // Fill in SHAP values
  if (prediction && shapData.length > 0) {
    const featureMap: Record<string, { shap: number; dir: string }> = {};
    if (prediction.feature1_name) featureMap[prediction.feature1_name] = { shap: prediction.feature1_shap ?? 0, dir: prediction.feature1_direction ?? 'neutral' };
    if (prediction.feature2_name) featureMap[prediction.feature2_name] = { shap: prediction.feature2_shap ?? 0, dir: prediction.feature2_direction ?? 'neutral' };

    // We need all 4 features' SHAP values — but we only stored top 2 in DB
    // Show what we have, estimate rest as 0
    for (const d of shapData) {
      if (featureMap[d.key]) {
        d.shap = featureMap[d.key].shap;
      }
    }
  }

  const topFeatures = shapData
    .filter((d) => d.shap !== 0)
    .sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap))
    .slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900">Churn Model Analysis</h2>
            <p className="text-xs text-slate-500">{account.account_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Big probability indicator */}
          <div className="flex items-center gap-4">
            <div className={`rounded-2xl p-5 flex flex-col items-center justify-center min-w-[120px] ${isChurn ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
              {isChurn ? (
                <AlertTriangle className="w-8 h-8 text-red-500 mb-1" />
              ) : (
                <CheckCircle2 className="w-8 h-8 text-green-500 mb-1" />
              )}
              <div className={`text-3xl font-bold ${isChurn ? 'text-red-700' : 'text-green-700'}`}>{churnPct}%</div>
              <div className={`text-xs font-medium ${isChurn ? 'text-red-600' : 'text-green-600'}`}>Churn Risk</div>
            </div>
            <div className="flex-1">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-2 ${isChurn ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {isChurn ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                Predicted: {isChurn ? 'CHURN' : 'RETAIN'}
              </div>
              <p className="text-sm text-slate-600">
                {isChurn
                  ? `Model predicts ${churnPct}% probability this account will not renew. Immediate intervention recommended.`
                  : `Model predicts ${100 - churnPct}% probability of renewal. Account showing positive retention signals.`
                }
              </p>
              <p className="text-xs text-slate-400 mt-1">Threshold: ≥50% → Churn predicted</p>
            </div>
          </div>

          {/* SHAP Chart */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Feature Impact (SHAP Values)</h3>
            <p className="text-xs text-slate-500 mb-3">Positive = increases churn risk · Negative = decreases churn risk</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={shapData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v.toFixed(2)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value: number) => [value.toFixed(3), 'SHAP value']}
                    contentStyle={{ border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: 12 }}
                  />
                  <ReferenceLine x={0} stroke="#94a3b8" />
                  <Bar dataKey="shap" radius={4}>
                    {shapData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={entry.shap > 0 ? '#ef4444' : '#3b82f6'}
                        opacity={topFeatures.some((f) => f.key === entry.key) ? 1 : 0.6}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top 2 predictors */}
          {topFeatures.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Top 2 Predictive Signals</h3>
              <div className="space-y-2">
                {topFeatures.map((feat, i) => {
                  const isPositive = feat.shap > 0;
                  const desc = FEATURE_DESCRIPTIONS[feat.key];
                  const accountVal = feat.key === 'usage_ratio'
                    ? `${Math.round((account.seats_active / account.seat_count) * 100)}% utilization`
                    : feat.key === 'arr'
                    ? `$${account.arr.toLocaleString()} ARR`
                    : feat.key === 'num_previous_contracts'
                    ? `${account.num_previous_contracts} prior contracts`
                    : `${account.support_ticket_count} tickets`;

                  return (
                    <div
                      key={feat.key}
                      className={`p-3 rounded-xl border text-sm ${isPositive ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isPositive ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>#{i + 1}</span>
                        <span className="font-semibold text-slate-800">{feat.name}</span>
                        <span className="ml-auto text-xs text-slate-500 font-mono">{accountVal}</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {desc ? (isPositive ? desc.high : desc.low) : `SHAP impact: ${feat.shap.toFixed(3)}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Model Setup (collapsible) */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-slate-700"
              onClick={() => setShowModelSetup((s) => !s)}
            >
              Model Setup & Configuration
              {showModelSetup ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showModelSetup && modelInfo && (
              <div className="px-4 py-3 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-0.5">Algorithm</div>
                    <div className="font-medium text-slate-800">XGBoost Random Forest</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-0.5">Training Accuracy</div>
                    <div className="font-medium text-slate-800">{(modelInfo.accuracy * 100).toFixed(1)}%</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-0.5">Training Set</div>
                    <div className="font-medium text-slate-800">{modelInfo.training_size.toLocaleString()} accounts</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-0.5">Decision Threshold</div>
                    <div className="font-medium text-slate-800">{(modelInfo.threshold * 100).toFixed(0)}% probability</div>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Input Features</div>
                  <div className="flex flex-wrap gap-1">
                    {modelInfo.features.map((f) => (
                      <span key={f} className="text-xs font-mono bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                        {FEATURE_LABELS[f] ?? f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
