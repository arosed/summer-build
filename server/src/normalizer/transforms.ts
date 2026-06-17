export function parseContractPeriod(period: string): {
  start: string;
  end: string;
  days: number;
} {
  const parts = period.split(' - ');
  if (parts.length !== 2) throw new Error(`Invalid contract_period format: ${period}`);

  const parseMMDDYYYY = (s: string): string => {
    const [m, d, y] = s.trim().split('/');
    if (!m || !d || !y) throw new Error(`Invalid date: ${s}`);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  };

  const start = parseMMDDYYYY(parts[0]);
  const end = parseMMDDYYYY(parts[1]);
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const days = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));

  return { start, end, days };
}

export function mrrToArr(mrr: number): number {
  return mrr * 12;
}

export function isoDate(mmddyyyy: string): string {
  const [m, d, y] = mmddyyyy.trim().split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function runTransformCode(code: string, value: unknown): unknown {
  try {
    const fn = new Function('value', `return (${code})(value)`);
    return fn(value);
  } catch (err) {
    throw new Error(`Transform error for code "${code}": ${err}`);
  }
}
