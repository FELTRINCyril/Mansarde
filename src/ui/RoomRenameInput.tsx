import { useEffect, useRef, type JSX } from 'react';
import { renameRoomAt } from '@/editor/renameRoom';
import { useEditor } from '@/editor/store';
import { worldToScreen } from '@/editor/view';

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

/**
 * In-place room name field (overlay.rename, opened by a double-click in a room), positioned over
 * the canvas at the room label point. Enter or leaving the field renames the room (renameRoom, one
 * history entry); Escape cancels. Being an input, it is covered by the keyboard typing guard: the
 * letters typed never reach the tool shortcuts. Pointer events stop here, the plan never sees them.
 */
export function RoomRenameInput(): JSX.Element | null {
  const rename = useEditor((s) => s.overlay.rename);
  const view = useEditor((s) => s.view);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    done.current = false;
    ref.current?.focus();
    ref.current?.select();
  }, [rename]);

  if (!rename) return null;
  const at = worldToScreen(view, rename.labelPoint);

  const close = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const value = ref.current?.value ?? '';
    useEditor.getState().setOverlay({ rename: null });
    if (commit) renameRoomAt(useEditor, rename.levelId, rename, value);
  };

  return (
    <input
      key={`${rename.levelId}:${rename.labelPoint.x},${rename.labelPoint.y}`}
      ref={ref}
      className="input room-rename"
      data-testid="room-rename"
      aria-label="Nom de la pièce"
      defaultValue={rename.label?.name ?? ''}
      placeholder={rename.placeholder}
      style={{ left: at.x, top: at.y }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          close(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
        }
      }}
      onBlur={() => close(true)}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onDoubleClick={stop}
    />
  );
}
