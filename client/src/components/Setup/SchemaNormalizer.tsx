import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Send, Download } from 'lucide-react';
import { api, streamSSE, type MappingResult } from '../../lib/api';

interface Props {
  onComplete: () => void;
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.9 ? 'bg-green-100 text-green-700' : value >= 0.7 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{pct}%</span>;
}

export default function SchemaNormalizer({ onComplete }: Props) {
  const [streaming, setStreaming] = useState(false);
  const [terminalText, setTerminalText] = useState('');
  const [mappings, setMappings] = useState<MappingResult[]>([]);
  const [editInstruction, setEditInstruction] = useState('');
  const [editStreaming, setEditStreaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'streaming' | 'done'>('idle');
  const terminalRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalText]);

  async function runSample() {
    setPhase('streaming');
    setStreaming(true);
    setTerminalText('');
    setMappings([]);

    const res = await api.setup.useSample();
    await streamSSE(res, (data) => {
      const d = data as { type: string; text?: string; data?: MappingResult[] };
      if (d.type === 'thinking' || d.type === 'start') {
        setTerminalText((t) => t + (d.text ?? ''));
      }
      if (d.type === 'mappings' && d.data) {
        setMappings(d.data);
      }
      if (d.type === 'complete') {
        setStreaming(false);
        setPhase('done');
      }
    });
  }

  async function runUpload(file: File) {
    setPhase('streaming');
    setStreaming(true);
    setTerminalText('');
    setMappings([]);

    const res = await api.setup.uploadDescriptions(file);
    await streamSSE(res, (data) => {
      const d = data as { type: string; text?: string; data?: MappingResult[] };
      if (d.type === 'thinking' || d.type === 'start') {
        setTerminalText((t) => t + (d.text ?? ''));
      }
      if (d.type === 'mappings' && d.data) {
        setMappings(d.data);
      }
      if (d.type === 'complete') {
        setStreaming(false);
        setPhase('done');
      }
    });
  }

  async function submitEdit() {
    if (!editInstruction.trim()) return;
    setEditStreaming(true);
    const instruction = editInstruction;
    setEditInstruction('');
    setTerminalText((t) => t + `\n\n> ${instruction}\n\n`);

    const res = await api.setup.editNormalization(instruction);
    await streamSSE(res, (data) => {
      const d = data as { type: string; text?: string; data?: MappingResult[] };
      if (d.type === 'thinking' || d.type === 'start') {
        setTerminalText((t) => t + (d.text ?? ''));
      }
      if (d.type === 'mappings' && d.data) {
        setMappings(d.data);
      }
    });
    setEditStreaming(false);
  }

  async function handleConfirm() {
    setConfirming(true);
    const result = await api.setup.confirm();
    setConfirming(false);
    if (result.success) onComplete();
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <span className="text-xl font-bold text-[hsl(24,95%,53%)]">Pareto</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-600 font-light">Qualification Agent</span>
        <span className="ml-auto text-xs text-slate-400">Step 2 of 3 — Schema Normalization</span>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 mb-1">Schema Normalization</h1>
          <p className="text-slate-500">The agent will analyze your column structure and map raw fields to the canonical schema.</p>
        </div>

        {/* Upload / Sample buttons */}
        {phase === 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3 mb-6"
          >
            <button
              onClick={runSample}
              className="flex items-center gap-2 bg-[hsl(24,95%,53%)] hover:bg-[hsl(24,95%,45%)] text-white font-medium px-4 py-2.5 rounded-lg transition-colors text-sm shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Use Sample File
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 border border-gray-200 hover:border-slate-400 text-slate-700 font-medium px-4 py-2.5 rounded-lg transition-colors text-sm"
            >
              <Upload className="w-4 h-4" />
              Upload column_descriptions.csv
            </button>
            <a
              href="/sample_column_descriptions.csv"
              download
              className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm px-3 py-2.5"
            >
              <Download className="w-4 h-4" />
              Download sample
            </a>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) runUpload(file);
              }}
            />
          </motion.div>
        )}

        {/* Terminal */}
        {phase !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-slate-400 font-mono">normalization-agent</span>
              {streaming && <Loader2 className="w-3 h-3 text-slate-400 animate-spin ml-auto" />}
            </div>
            <div
              ref={terminalRef}
              className="bg-gray-950 text-green-400 font-mono text-xs p-4 rounded-xl h-64 overflow-y-auto leading-relaxed whitespace-pre-wrap"
            >
              {terminalText}
              {streaming && <span className="inline-block w-2 h-3 bg-green-400 animate-pulse ml-0.5" />}
            </div>
          </motion.div>
        )}

        {/* Mapping Table */}
        <AnimatePresence>
          {mappings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="rounded-xl border border-gray-200 overflow-hidden mb-6">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h2 className="font-semibold text-slate-700 text-sm">Field Mapping ({mappings.length} fields)</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Canonical Field</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Raw Column</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Confidence</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Transform</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.map((m) => (
                        <motion.tr
                          key={m.canonical_field}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="border-b border-gray-50 hover:bg-gray-50"
                        >
                          <td className="px-4 py-2.5 font-mono text-slate-800 font-medium text-xs">{m.canonical_field}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600 text-xs">{m.raw_column ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            {m.confidence != null ? (
                              <div className="flex items-center gap-2">
                                <ConfidenceBadge value={m.confidence} />
                                {m.confidence < 0.7 && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-500 text-xs max-w-[200px] truncate" title={m.transform_fn_code}>
                            {m.transform_fn_code !== '(x) => x' ? m.transform_fn_code : <span className="text-slate-400">identity</span>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{m.transform_description}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Edit prompt */}
              <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs text-slate-500 mb-2 font-medium">Edit normalization (e.g. "multiply usage data by 100", "use ARR directly instead of MRR")</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editInstruction}
                    onChange={(e) => setEditInstruction(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitEdit()}
                    placeholder="Describe the change..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[hsl(24,95%,53%)] focus:ring-1 focus:ring-[hsl(24,95%,53%)]"
                    disabled={editStreaming}
                  />
                  <button
                    onClick={submitEdit}
                    disabled={editStreaming || !editInstruction.trim()}
                    className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    {editStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Apply
                  </button>
                </div>
              </div>

              {/* Proceed button */}
              <div className="flex justify-end">
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="flex items-center gap-2 bg-[hsl(24,95%,53%)] hover:bg-[hsl(24,95%,45%)] text-white font-medium px-6 py-3 rounded-xl transition-colors shadow-sm disabled:opacity-60"
                >
                  {confirming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running ML model &amp; qualification engine...
                    </>
                  ) : (
                    <>
                      Proceed to Dashboard
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
