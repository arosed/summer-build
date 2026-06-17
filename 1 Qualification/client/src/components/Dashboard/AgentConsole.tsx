import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Send, Loader2 } from 'lucide-react';
import { api, streamSSE, type Account } from '../../lib/api';

interface Props {
  onAccountsUpdate: (accounts: Account[]) => void;
}

interface TerminalLine {
  type: 'input' | 'output' | 'update' | 'success';
  text: string;
}

export default function AgentConsole({ onAccountsUpdate }: Props) {
  const [instruction, setInstruction] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: 'output', text: 'Qualification agent ready. Type a rule change below.' },
  ]);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  function addLine(line: TerminalLine) {
    setLines((l) => [...l, line]);
  }

  function appendToLast(text: string) {
    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.type === 'output') {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...prev, { type: 'output', text }];
    });
  }

  async function submit() {
    if (!instruction.trim() || streaming) return;
    const cmd = instruction.trim();
    setInstruction('');
    setStreaming(true);

    addLine({ type: 'input', text: `> ${cmd}` });
    addLine({ type: 'output', text: '' });

    const res = await api.agent.qualifyInstruction(cmd);
    await streamSSE(res, (data) => {
      const d = data as { type: string; text?: string; key?: string; old_value?: string; new_value?: string; changed_count?: number };
      if (d.type === 'thinking') {
        appendToLast(d.text ?? '');
      }
      if (d.type === 'config_update') {
        addLine({ type: 'update', text: `Config updated: ${d.key} ${d.old_value} → ${d.new_value}` });
        addLine({ type: 'output', text: '' });
      }
      if (d.type === 'rerun_complete') {
        addLine({ type: 'success', text: `✓ Engine re-run complete. ${d.changed_count} accounts changed signal.` });
      }
    });

    setStreaming(false);

    // Reload accounts
    const updated = await api.accounts.list();
    onAccountsUpdate(updated);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-gray-200 overflow-hidden"
    >
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-[hsl(24,95%,53%)]" />
        <span className="font-semibold text-slate-700 text-sm">Agent Console</span>
        <span className="text-xs text-slate-400 ml-1">— Adjust qualification rules in plain English</span>
        {streaming && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin ml-auto" />}
      </div>

      {/* Terminal output */}
      <div
        ref={terminalRef}
        className="bg-gray-950 min-h-[160px] max-h-60 overflow-y-auto p-4 font-mono text-xs leading-relaxed"
      >
        <AnimatePresence initial={false}>
          {lines.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={
                line.type === 'input'
                  ? 'text-[hsl(24,95%,53%)] mb-0.5'
                  : line.type === 'update'
                  ? 'text-blue-400 mb-0.5'
                  : line.type === 'success'
                  ? 'text-green-400 font-semibold mb-0.5'
                  : 'text-gray-300 mb-0 whitespace-pre-wrap'
              }
            >
              {line.text}
              {i === lines.length - 1 && streaming && (
                <span className="inline-block w-1.5 h-3 bg-gray-400 animate-pulse ml-0.5" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="bg-gray-950 border-t border-gray-800 px-4 py-3 flex gap-2">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder='e.g. "lower the underutilizing bar to 55% utilization"'
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[hsl(24,95%,53%)]"
          disabled={streaming}
        />
        <button
          onClick={submit}
          disabled={streaming || !instruction.trim()}
          className="flex items-center gap-1.5 bg-[hsl(24,95%,53%)] hover:bg-[hsl(24,95%,45%)] text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {streaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Run
        </button>
      </div>

      {/* Quick examples */}
      <div className="bg-white border-t border-gray-100 px-4 py-2.5 flex gap-2 flex-wrap">
        {[
          'lower the underutilizing bar to 55% utilization',
          'change renewal window to 90 days',
          'set churn login threshold to 2',
        ].map((example) => (
          <button
            key={example}
            onClick={() => setInstruction(example)}
            className="text-xs text-slate-500 hover:text-[hsl(24,95%,53%)] border border-gray-200 px-2 py-1 rounded-md hover:border-[hsl(24,95%,53%)] transition-colors"
          >
            {example}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
