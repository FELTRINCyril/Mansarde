import type { JSX } from 'react';
import { openingCutRing } from '@/core/geometry/openings';
import { isOpeningGhost } from '@/editor/tools/openingTool';
import { OpeningSymbol } from './layers/OpeningsLayer';
import { ringsPath } from './path';
import { STYLE } from './style';

/**
 * Preview of the door and window tools (overlay.ghost of kind 'opening'): the real opening symbol
 * over its gap in the selection color, or in red without gap over a faint red cut area when the
 * opening does not fit. Nothing for any other ghost.
 */
export function OpeningGhostView({ ghost, lineUnit }: { ghost: unknown; lineUnit: number }): JSX.Element | null {
  if (!isOpeningGhost(ghost) || !ghost.level.walls[ghost.opening.wallId]) return null;
  const color = ghost.valid ? STYLE.selection : STYLE.invalid;
  return (
    <g data-kind="opening-ghost" data-invalid={ghost.valid ? undefined : 'true'} fill="none" strokeLinecap="butt">
      {!ghost.valid && (
        <path d={ringsPath([openingCutRing(ghost.level, ghost.opening)])} fill={STYLE.invalid} fillOpacity={STYLE.invalidFillOpacity} stroke="none" />
      )}
      <OpeningSymbol level={ghost.level} opening={ghost.opening} lineUnit={lineUnit} stroke={color} gap={ghost.valid} />
    </g>
  );
}
