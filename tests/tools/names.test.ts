import { describe, expect, it } from 'vitest';
import { cleanName, slug } from '../../tools/models/lib/names';

describe('slug', () => {
  it('cuts camelCase and strips accents', () => {
    expect(slug('loungeSofaCorner')).toBe('lounge-sofa-corner');
    expect(slug('Lit à barreaux 2')).toBe('lit-a-barreaux-2');
    expect(slug('L_shaped_sofa')).toBe('l-shaped-sofa');
    expect(slug('ArmChair_01')).toBe('arm-chair-01');
    expect(slug('  --x--  ')).toBe('x');
  });
});

describe('cleanName', () => {
  it('replaces the typographic characters the interface forbids', () => {
    expect(cleanName('Table d’appoint – 2…')).toBe("Table d'appoint - 2...");
    expect(cleanName('«Lampe» 2×3  cm')).toBe('"Lampe" 2x3 cm');
    expect(cleanName('  a   b ')).toBe('a b');
  });
});
