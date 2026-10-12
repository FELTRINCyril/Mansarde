import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createOverlay } from '@/editor/store';
import type { DrawGhost } from '@/editor/tools/drawing';
import type { BeamGhost, SlopeGhost } from '@/editor/tools/volumeTools';
import { OverlayLayer } from '@/render/OverlayLayer';

const render = (ghost: unknown) =>
  renderToStaticMarkup(
    <svg>
      <OverlayLayer overlay={{ ...createOverlay(), ghost }} handles={[]} lineUnit={1} />
    </svg>,
  );

/** The snapped cursor markers of a markup: the data-snap of each. */
const markers = (markup: string): string[] =>
  [...markup.matchAll(/data-kind="snap-marker"[^>]*>\s*<(\w+) data-snap="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`);

describe('snapped cursor marker', () => {
  it('square on a node, diamond on a wall (middle, axis, face), cross elsewhere', () => {
    const ghost = (snap: string): DrawGhost => ({ kind: 'draw', paths: [], marker: { at: { x: 10, y: 20 }, snap } as DrawGhost['marker'], label: null });
    expect(markers(render(ghost('node')))).toEqual(['rect:node']);
    expect(markers(render(ghost('wallMid')))).toEqual(['polygon:wallMid']);
    expect(markers(render(ghost('wallAxis')))).toEqual(['polygon:wallAxis']);
    expect(markers(render(ghost('face')))).toEqual(['polygon:face']);
    expect(markers(render(ghost('grid')))).toEqual(['path:grid']);
    expect(markers(render(ghost('ortho')))).toEqual(['path:ortho']);
  });

  it('the slope and beam ghosts draw the same marker', () => {
    const slope: SlopeGhost = { kind: 'volume-slope', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, slope: null, marks: [], marker: { at: { x: 100, y: 0 }, snap: 'face' } };
    const beam: BeamGhost = { kind: 'volume-beam', marks: [], beam: null, marker: { at: { x: 100, y: 0 }, snap: 'node' } };
    expect(markers(render(slope))).toEqual(['polygon:face']);
    expect(markers(render(beam))).toEqual(['rect:node']);
    expect(markers(render({ ...slope, marker: null }))).toEqual([]);
  });
});
