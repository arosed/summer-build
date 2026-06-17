import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, BarChart3, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';

interface Props {
  onComplete: () => void;
}

type ConnStatus = 'idle' | 'connecting' | 'connected';

export default function ConnectData({ onComplete }: Props) {
  const [crm, setCrm] = useState<ConnStatus>('idle');
  const [warehouse, setWarehouse] = useState<ConnStatus>('idle');

  function connect(type: 'crm' | 'warehouse') {
    const setter = type === 'crm' ? setCrm : setWarehouse;
    setter('connecting');
    setTimeout(() => setter('connected'), 1500);
  }

  const bothConnected = crm === 'connected' && warehouse === 'connected';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      {/* Wordmark */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 text-center"
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-3xl font-bold text-[hsl(24,95%,53%)]">Pareto</span>
          <span className="text-3xl font-light text-slate-400">·</span>
          <span className="text-3xl font-light text-slate-600">Qualification Agent</span>
        </div>
        <p className="text-slate-500 text-sm">AI-driven renewal &amp; expansion command center</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1 rounded-full mb-4">
            <span className="w-4 h-4 rounded-full bg-[hsl(24,95%,53%)] text-white flex items-center justify-center text-xs font-bold">1</span>
            Step 1 of 3 — Connect Data Sources
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Connect your data sources</h1>
          <p className="text-slate-500">Pareto ingests CRM and product usage data to power the qualification engine.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <DataSourceCard
            icon={<Database className="w-6 h-6" />}
            title="CRM Data"
            description="Account info, ARR, contract dates, tier"
            status={crm}
            onConnect={() => connect('crm')}
          />
          <DataSourceCard
            icon={<BarChart3 className="w-6 h-6" />}
            title="Usage Warehouse"
            description="Seat counts, logins, feature adoption"
            status={warehouse}
            onConnect={() => connect('warehouse')}
          />
        </div>

        <AnimatePresence>
          {bothConnected && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-center"
            >
              <button
                onClick={onComplete}
                className="flex items-center gap-2 bg-[hsl(24,95%,53%)] hover:bg-[hsl(24,95%,45%)] text-white font-medium px-6 py-3 rounded-xl transition-colors shadow-sm"
              >
                Continue to Schema Mapping
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function DataSourceCard({
  icon, title, description, status, onConnect
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: ConnStatus;
  onConnect: () => void;
}) {
  return (
    <motion.div
      className="rounded-xl border border-gray-200 p-6 bg-white shadow-sm"
      animate={status === 'connected' ? { borderColor: '#22c55e' } : {}}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2 rounded-lg ${status === 'connected' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
          {icon}
        </div>
        <AnimatePresence mode="wait">
          {status === 'connected' && (
            <motion.div
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-green-500"
            >
              <CheckCircle2 className="w-5 h-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-slate-500 text-sm mb-4">{description}</p>

      {status === 'idle' && (
        <button
          onClick={onConnect}
          className="w-full text-sm font-medium border border-slate-200 hover:border-[hsl(24,95%,53%)] hover:text-[hsl(24,95%,53%)] text-slate-600 py-2 rounded-lg transition-colors"
        >
          Connect
        </button>
      )}
      {status === 'connecting' && (
        <div className="flex items-center justify-center gap-2 text-slate-500 text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting...
        </div>
      )}
      {status === 'connected' && (
        <div className="flex items-center justify-center gap-2 text-green-600 text-sm font-medium py-2">
          <CheckCircle2 className="w-4 h-4" />
          Connected
        </div>
      )}
    </motion.div>
  );
}
