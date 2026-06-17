import { useState } from 'react';
import Dashboard from './components/Dashboard/Dashboard';
import RenewalManagerDashboard from './components/RenewalManager/RenewalManagerDashboard';
import RenewalManagerAccountList from './components/RenewalManager/RenewalManagerAccountList';
import RenewalPlanView from './components/RenewalPlan/RenewalPlanView';
import AgentPassthrough from './components/AgentPassthrough/AgentPassthrough';

export type Screen =
  | { view: 'dashboard' }
  | { view: 'renewal-manager' }
  | { view: 'renewal-manager-list'; category: string }
  | { view: 'renewal-plan'; accountId: string; from: 'dashboard' | 'renewal-manager-list' }
  | { view: 'agent-passthrough' };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ view: 'dashboard' });
  const [renewalModal, setRenewalModal] = useState<{ accountId: string } | null>(null);

  function navigate(s: Screen) {
    if (s.view === 'renewal-plan') {
      setRenewalModal({ accountId: s.accountId });
    } else {
      setScreen(s);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {screen.view === 'dashboard' && (
        <Dashboard navigate={navigate} />
      )}
      {screen.view === 'renewal-manager' && (
        <RenewalManagerDashboard navigate={navigate} />
      )}
      {screen.view === 'renewal-manager-list' && (
        <RenewalManagerAccountList category={screen.category} navigate={navigate} />
      )}
      {screen.view === 'agent-passthrough' && (
        <AgentPassthrough navigate={navigate} />
      )}
      {renewalModal && (
        <RenewalPlanView
          accountId={renewalModal.accountId}
          onClose={() => setRenewalModal(null)}
        />
      )}
    </div>
  );
}
