import { describe, it, expect } from 'vitest';
import { parseContractPeriod, mrrToArr, runTransformCode } from './transforms.js';

describe('parseContractPeriod', () => {
  it('parses MM/DD/YYYY - MM/DD/YYYY format', () => {
    const result = parseContractPeriod('01/15/2023 - 01/15/2024');
    expect(result.start).toBe('2023-01-15');
    expect(result.end).toBe('2024-01-15');
    expect(result.days).toBe(365);
  });

  it('computes days correctly for 6-month contract', () => {
    const result = parseContractPeriod('06/01/2024 - 12/01/2024');
    expect(result.start).toBe('2024-06-01');
    expect(result.end).toBe('2024-12-01');
    expect(result.days).toBeGreaterThan(180);
    expect(result.days).toBeLessThan(185);
  });

  it('throws on invalid format', () => {
    expect(() => parseContractPeriod('invalid')).toThrow();
  });
});

describe('mrrToArr', () => {
  it('multiplies by 12', () => {
    expect(mrrToArr(2000)).toBe(24000);
    expect(mrrToArr(5000)).toBe(60000);
  });
});

describe('runTransformCode', () => {
  it('executes simple multiply transform', () => {
    expect(runTransformCode('(x) => x * 12', 2000)).toBe(24000);
  });

  it('executes string extraction transform', () => {
    const code = `(x) => { const parts = x.split(' - '); const [m,d,y] = parts[0].trim().split('/'); return y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'); }`;
    const result = runTransformCode(code, '03/15/2023 - 03/15/2024');
    expect(result).toBe('2023-03-15');
  });

  it('throws on invalid transform code', () => {
    expect(() => runTransformCode('not valid js', 'test')).toThrow();
  });

  it('identity transform returns same value', () => {
    expect(runTransformCode('(x) => x', 'hello')).toBe('hello');
  });
});
