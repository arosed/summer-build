import { useState, useEffect } from 'react';
import { api, type Account } from '../../lib/api';
import AccountTable from './AccountTable';
import AgentConsole from './AgentConsole';
import RepBriefPanel from '../RepBrief/RepBriefPanel';
import ChurnModelModal from '../ChurnModel/ChurnModelModal';

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [churnAccount, setChurnAccount] = useState<Account | null>(null);

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
        <span className="ml-auto text-xs text-slate-400">arose@paretoagent.ai</span>
      </div>

      <div className="flex-1 px-6 py-6 max-w-[1400px] mx-auto w-full">
        <AccountTable
          accounts={accounts}
          loading={loading}
          onSelectAccount={setSelectedAccount}
          onViewChurn={setChurnAccount}
          onAccountsUpdate={setAccounts}
        />

        <AgentConsole onAccountsUpdate={setAccounts} />
      </div>

      {/* Rep Brief slide-out */}
      <RepBriefPanel
        account={selectedAccount}
        onClose={() => setSelectedAccount(null)}
      />

      {/* Churn Model modal */}
      {churnAccount && (
        <ChurnModelModal
          account={churnAccount}
          onClose={() => setChurnAccount(null)}
        />
      )}
    </div>
  );
}
