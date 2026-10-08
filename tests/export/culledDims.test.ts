import { describe, expect, it } from 'vitest';
import { deriveLevel } from '@/core/geometry/derived';
import { culledDimensions, culledDimsMessage, largerScale } from '@/export/culledDims';
import { printLineUnit } from '@/export/pageLayout';
import { layoutDimensions } from '@/render/dimensionsLayout';
import { buildSampleProject } from './sampleProject';

describe('dimensions left out by an export (ruling R38)', () => {
  it('suggests the next larger drawing scale, none at 1/20', () => {
    expect(largerScale(200)).toBe(100);
    expect(largerScale(100)).toBe(50);
    expect(largerScale(50)).toBe(20);
    expect(largerScale(20)).toBeNull();
  });

  it('words the notice for a PDF (with the suggestion) and for a PNG', () => {
    expect(culledDimsMessage(3, 100)).toBe('3 cotes illisibles à cette échelle ont été masquées, essayez le 1/50.');
    expect(culledDimsMessage(1, 200)).toBe('1 cote illisible à cette échelle a été masquée, essayez le 1/100.');
    expect(culledDimsMessage(2, 20)).toBe('2 cotes illisibles à cette échelle ont été masquées.');
    expect(culledDimsMessage(4, null)).toBe("4 cotes illisibles ont été masquées dans l'image.");
  });

  it('counts the automatic dimensions left out at a print scale, never an opening width', () => {
    const level = buildSampleProject().levels[0]!;
    expect(culledDimensions(level, 'all', printLineUnit(50))).toBe(0);
    expect(culledDimensions(level, 'all', printLineUnit(100))).toBe(1);
    expect(culledDimensions(level, 'all', printLineUnit(200))).toBe(5);
    expect(culledDimensions(level, 'manual', printLineUnit(200))).toBe(0);
    expect(culledDimensions(level, 'none', printLineUnit(200))).toBe(0);
    for (const scale of [20, 50, 100, 200]) {
      const { auto } = layoutDimensions(level, deriveLevel(level), 'all', printLineUnit(scale));
      const openings = auto.filter((p) => p?.dim.kind === 'opening');
      expect(openings, `1/${scale}`).toHaveLength(Object.keys(level.openings).length);
    }
  });
});
