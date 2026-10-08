import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DimLine } from '@/core/geometry/autoDimensions';
import { createOverlay } from '@/editor/store';
import { OverlayLayer } from '@/render/OverlayLayer';

const dim = (value: number): DimLine => ({ a: { x: 10, y: 50 }, b: { x: 10 - value, y: 50 }, offset: 0, value, kind: 'dynamic' });

describe('zero clearance marker', () => {
  it('marks the active clearance when it is 0, not otherwise', () => {
    const render = (activeDimIndex: number | null) =>
      renderToStaticMarkup(
        <svg>
          <OverlayLayer overlay={{ ...createOverlay(), dynamicDims: [dim(0), dim(30)], activeDimIndex }} handles={[]} lineUnit={1} />
        </svg>,
      );
    const active0 = render(0);
    expect(active0).toContain('data-kind="zero-clearance"');
    expect(active0).toContain('0,00 m');
    expect(render(1)).not.toContain('zero-clearance');
    expect(render(null)).not.toContain('zero-clearance');
  });
});
