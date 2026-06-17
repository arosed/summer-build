import { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { api, type Account } from '../../lib/api';
import AccountTable from './AccountTable';
import type { Screen } from '../../App';

interface Props {
  navigate: (s: Screen) => void;
}

export default function Dashboard({ navigate }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    const data = await api.accounts.list();
    setAccounts(data);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <div className="border-b border-gray-100 px-6 py-3.5 flex items-center">
        <span className="text-xl font-bold text-[hsl(24,95%,53%)]">Pareto</span>
        <span className="mx-2 text-slate-300">·</span>
        <span className="text-slate-600 font-light">Qualification Agent</span>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => navigate({ view: 'renewal-manager' })}
            className="flex items-center gap-1.5 border border-[hsl(24,95%,53%)] text-[hsl(24,95%,53%)] hover:bg-[hsl(24,95%,53%)] hover:text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Renewal Manager View
          </button>
          <span className="text-xs text-slate-400">arose@paretoagent.ai</span>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 max-w-[1400px] mx-auto w-full">
        <AccountTable
          accounts={accounts}
          loading={loading}
          onSelectAccount={(acct) => navigate({ view: 'renewal-plan', accountId: acct.account_id, from: 'dashboard' })}
          onAccountsUpdate={setAccounts}
        />
      </div>
    </div>
  );
}
