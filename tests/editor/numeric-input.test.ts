import { describe, expect, it } from 'vitest';
import { commitNumeric } from '@/ui/numeric';

describe('commitNumeric (parseCmInput guard)', () => {
  it('accepts a plain centimeter value', () => {
    expect(commitNumeric('350')).toEqual({ ok: true, value: 350 });
  });
  it('accepts meters and decimal commas', () => {
    expect(commitNumeric('3,5 m')).toEqual({ ok: true, value: 350 });
    expect(commitNumeric(' 82,5 cm ')).toEqual({ ok: true, value: 82.5 });
  });
  it.each(['', '   ', '0', '-2', 'abc', '3 x', '1e3'])('refuses %j', (text) => {
    expect(commitNumeric(text)).toEqual({ ok: false });
  });
  it('refuses values above 100000 cm (Ruling R5) and accepts the bound', () => {
    expect(commitNumeric('100001')).toEqual({ ok: false });
    expect(commitNumeric('1001 m')).toEqual({ ok: false });
    expect(commitNumeric('100000')).toEqual({ ok: true, value: 100000 });
    expect(commitNumeric('1000 m')).toEqual({ ok: true, value: 100000 });
  });
});
