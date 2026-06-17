import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer
} from 'recharts';
import type { HistoricalArr } from '../../lib/api';

interface Props {
  data: HistoricalArr[];
  contractEndDate: string;
}

function formatQ(quarter: string): string {
  return `'${quarter.slice(2, 4)}`; // "2025" → "'25"
}

function formatArrK(value: number): string {
  return `$${Math.round(value / 1000)}K`;
}

export default function ArrChart({ data, contractEndDate }: Props) {
  if (!data || data.length === 0) return (
    <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No trend data</div>
  );

  const chartData = data.map((d) => ({
    quarter: formatQ(d.quarter),
    arr: d.arr,
    rawQuarter: d.quarter,
  }));

  const lastQuarter = chartData[chartData.length - 1]?.quarter;
  const renewalDate = new Date(contractEndDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const minArr = Math.min(...data.map((d) => d.arr));
  const maxArr = Math.max(...data.map((d) => d.arr));
  const padding = (maxArr - minArr) * 0.15;

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="quarter"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatArrK}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            domain={[Math.max(0, minArr - padding), maxArr + padding]}
          />
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, 'ARR']}
            contentStyle={{ border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="arr"
            stroke="hsl(24, 95%, 53%)"
            strokeWidth={2.5}
            dot={{ fill: 'hsl(24, 95%, 53%)', r: 3 }}
            activeDot={{ r: 5 }}
          />
          {lastQuarter && (
            <ReferenceLine
              x={lastQuarter}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              label={{ value: `Renewal ${renewalDate}`, position: 'insideTopRight', fontSize: 10, fill: '#64748b' }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
