import { deriveLevel } from '@/core/geometry/derived';
import type { Vec2 } from '@/core/model/types';
import { levelBounds } from '@/export/pageLayout';
import { fitBounds } from './background';
import { activeLevel, type EditorState } from './store';
import { fitView, screenToWorld } from './view';

/** Any positive viewport gives the same fitted center; this one stands for "not measured yet". */
const NOMINAL = { width: 1000, height: 800 } as const;

/**
 * World point at the center of the plan view (catalog placement, imported background). `size` is
 * the plan's last measured size; when the plan was never measured (the editor opened in the 3D
 * layout), it is the center the plan will show once displayed: PlanCanvas then fits the view to
 * the active level (fitView of fitBounds(levelBounds)), the origin for an empty level.
 */
export function planCenter(s: EditorState, size: { width: number; height: number }): Vec2 {
  if (size.width > 0 && size.height > 0) return screenToWorld(s.view, { x: size.width / 2, y: size.height / 2 });
  const level = activeLevel(s);
  const bounds = level ? fitBounds(levelBounds(level, deriveLevel(level)), level.background) : null;
  return screenToWorld(fitView(bounds, NOMINAL), { x: NOMINAL.width / 2, y: NOMINAL.height / 2 });
}
