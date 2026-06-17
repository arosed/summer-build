import { useState } from 'react';
import ConnectData from './components/Setup/ConnectData';
import SchemaNormalizer from './components/Setup/SchemaNormalizer';
import Dashboard from './components/Dashboard/Dashboard';

type Stage = 'connect' | 'normalize' | 'dashboard';

export default function App() {
  const [stage, setStage] = useState<Stage>('connect');

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {stage === 'connect' && <ConnectData onComplete={() => setStage('normalize')} />}
      {stage === 'normalize' && <SchemaNormalizer onComplete={() => setStage('dashboard')} />}
      {stage === 'dashboard' && <Dashboard />}
    </div>
  );
}
