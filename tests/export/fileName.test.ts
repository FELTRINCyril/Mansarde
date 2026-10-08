import { describe, expect, it } from 'vitest';
import { exportFileName, sanitizeFileName } from '@/export/fileName';

describe('sanitizeFileName', () => {
  it('replaces forbidden characters and keeps accents and apostrophes', () => {
    expect(sanitizeFileName("Maison d'été / RDC")).toBe("Maison d'été - RDC");
  });
  it('replaces every forbidden character with a dash', () => {
    expect(sanitizeFileName('a\\b:c*d?e"f<g>h|i/j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });
  it('replaces control characters', () => {
    expect(sanitizeFileName('a\u0000b\tc\nd\u007fe')).toBe('a-b-c-d-e');
  });
  it('compacts multiple spaces and trims', () => {
    expect(sanitizeFileName('  Ma    maison  ')).toBe('Ma maison');
  });
  it('returns "plan" when empty or blank', () => {
    expect(sanitizeFileName('')).toBe('plan');
    expect(sanitizeFileName('   ')).toBe('plan');
  });
  it('cuts to 80 characters', () => {
    expect(sanitizeFileName('a'.repeat(200))).toHaveLength(80);
  });
  it('does not leave a trailing space after the cut', () => {
    expect(sanitizeFileName(`${'a'.repeat(79)} bbb`)).toBe('a'.repeat(79));
  });
});

describe('exportFileName', () => {
  it('builds "<project> - <level>.<ext>"', () => {
    expect(exportFileName('Maison', 'RDC', 'pdf')).toBe('Maison - RDC.pdf');
    expect(exportFileName("Maison d'été", 'RDC', 'png')).toBe("Maison d'été - RDC.png");
  });
  it('omits the level part when the level name is empty', () => {
    expect(exportFileName('Maison', '', 'json')).toBe('Maison.json');
  });
  it('sanitizes the parts', () => {
    expect(exportFileName('A/B', 'R:1', 'pdf')).toBe('A-B - R-1.pdf');
    expect(exportFileName('', '', 'json')).toBe('plan.json');
  });
});
