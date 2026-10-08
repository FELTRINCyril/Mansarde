import { useEffect, useRef, type JSX } from 'react';
import { commitRoomRename } from '@/editor/renameRoom';
import { useEditor, type RoomRename } from '@/editor/store';
import { worldToScreen } from '@/editor/view';

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

/**
 * In-place room name field (overlay.rename, opened by a double-click in a room), positioned over
 * the canvas at the room label point. Enter, leaving the field, or the field disappearing for
 * another reason (a toolbar button resets the overlay) renames the room with the typed text
 * (renameRoom, one history entry); Escape cancels, and so does a change of the active level.
 * Being an input, it is covered by the keyboard typing guard: the letters typed never reach the
 * tool shortcuts. Pointer events stop here, the plan never sees them.
 */
export function RoomRenameInput(): JSX.Element | null {
  const rename = useEditor((s) => s.overlay.rename);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const view = useEditor((s) => s.view);
  const ref = useRef<HTMLInputElement>(null);
  const text = useRef('');
  const done = useRef(false);

  const close = (r: RoomRename, commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (useEditor.getState().overlay.rename === r) useEditor.getState().setOverlay({ rename: null });
    if (commit) commitRoomRename(useEditor, r, text.current);
  };

  useEffect(() => {
    if (!rename) return;
    done.current = false;
    text.current = rename.label?.name ?? '';
    ref.current?.focus();
    ref.current?.select();
    // the field goes away without Enter, Escape or blur (e.g. a tool button reset the overlay):
    // keep what was typed
    return () => close(rename, true);
    // close only reads refs and the store
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rename]);

  useEffect(() => {
    if (rename && activeLevelId !== rename.levelId) close(rename, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rename, activeLevelId]);

  if (!rename) return null;
  const at = worldToScreen(view, rename.labelPoint);

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
      onChange={(e) => {
        text.current = e.target.value;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          close(rename, true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close(rename, false);
        }
      }}
      onBlur={() => close(rename, true)}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onDoubleClick={stop}
    />
  );
}
