import { Fragment, useId, useState, type JSX } from 'react';
import { setRoomInteriorSize } from '@/core/commands/roomSize';
import { deriveLevel } from '@/core/geometry/derived';
import { rectangularRoom } from '@/core/geometry/roomRect';
import type { Level } from '@/core/model/types';
import { roomSideShared } from '@/editor/roomSizeInfo';
import { useEditor } from '@/editor/store';
import { Choice } from './fields';
import { NumericInput } from './NumericInput';

type Axis = 'width' | 'depth';
type MoveSide = 'min' | 'max';

const SIDES: Array<[MoveSide, string]> = [
  ['max', 'Droite / bas'],
  ['min', 'Gauche / haut'],
];
const NEIGHBOUR = 'La pièce voisine sera modifiée.';

/**
 * Interior width and depth of a rectangular room (spec 6), nothing for another shape. "Côté qui
 * bouge": the right / bottom side by default (in the room frame, see RectRoom), or the left / top
 * one. Under a field, "La pièce voisine sera modifiée." when its moving wall is shared with another
 * room. A refused size stays in red in its field and the reason is written under the fields (the
 * store toasts it too), linked to the field (aria-describedby), until Escape in the field or any
 * change of the level (undo, redo, another edit), which also clears the field.
 */
export function RoomSizeFields({ level, roomKey }: { level: Level; roomKey: string }): JSX.Element | null {
  const [side, setSide] = useState<MoveSide>('max');
  // the reason of a refused size, for the level it was refused on: any change of the level (undo,
  // another edit) or Escape in the field drops it
  const [refusal, setRefusal] = useState<{ message: string; level: Level; axis: Axis } | null>(null);
  const errorId = useId();
  const derived = deriveLevel(level);
  const rect = rectangularRoom(level, derived, roomKey);
  if (!rect) return null;
  const shown = refusal && refusal.level === level ? refusal : null;

  const commit = (axis: Axis, value: number): boolean => {
    const store = useEditor.getState();
    const before = store.toast;
    const ok = store.execute('Dimensions de la pièce', setRoomInteriorSize(level.id, roomKey, axis, value, side));
    const toast = useEditor.getState().toast;
    const message = toast && toast !== before ? toast.message : 'Impossible de redimensionner cette pièce ainsi.';
    setRefusal(ok ? null : { message, level, axis });
    return ok;
  };
  const neighbour = (axis: Axis) =>
    roomSideShared(level, derived, rect, axis, side) && (
      <p className="panel-hint" data-testid={`room-neighbour-${axis}`}>
        {NEIGHBOUR}
      </p>
    );

  return (
    <>
      {(['width', 'depth'] as const).map((axis) => (
        <Fragment key={axis}>
          <NumericInput
            label={axis === 'width' ? 'Largeur intérieure' : 'Profondeur intérieure'}
            valueCm={rect[axis]}
            testId={`room-${axis}`}
            keepRefused
            resetKey={level}
            describedBy={shown?.axis === axis ? errorId : undefined}
            onCommit={(v) => commit(axis, v)}
            onRevert={() => setRefusal(null)}
          />
          {neighbour(axis)}
        </Fragment>
      ))}
      <Choice<MoveSide> label="Côté qui bouge" value={side} options={SIDES} testId="room-move-side" onChange={setSide} />
      {shown && (
        <p className="panel-error" role="alert" id={errorId} data-testid="room-size-error">
          {shown.message}
        </p>
      )}
    </>
  );
}
