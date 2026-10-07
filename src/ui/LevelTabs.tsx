import { useEffect, useState, type JSX } from 'react';
import type { Recipe } from '@/core/commands/apply';
import { addLevel, deleteLevel, duplicateLevel, moveLevel, renameLevel } from '@/core/commands/levels';
import type { Id } from '@/core/model/types';
import { nextLevelName } from '@/editor/levelNames';
import { useEditor } from '@/editor/store';
import { ConfirmDialog } from './ConfirmDialog';

interface Menu { levelId: Id; x: number; y: number }

/**
 * One tab per level, bottom to top from left to right (array order, R14). Click = active level,
 * double click = rename, right click or "..." = level actions.
 */
export function LevelTabs(): JSX.Element | null {
  const project = useEditor((s) => s.project);
  const activeId = useEditor((s) => s.activeLevelId);
  const [editing, setEditing] = useState<Id | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Id | null>(null);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);
  if (!project) return null;
  const levels = project.levels;

  const run = (label: string, recipe: Recipe) =>
    useEditor.getState().execute(label, recipe);
  const activate = (id: Id) => useEditor.getState().setActiveLevel(id);

  const openMenu = (levelId: Id, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ levelId, x: r.left, y: r.top });
  };

  const act = (action: 'above' | 'below' | 'duplicate' | 'up' | 'down' | 'delete') => {
    if (!menu) return;
    const id = menu.levelId;
    const index = levels.findIndex((l) => l.id === id);
    const level = levels[index];
    setMenu(null);
    if (!level) return;
    const out = { levelId: '' };
    switch (action) {
      case 'above':
      case 'below':
        if (run('Ajouter un niveau', addLevel(id, action, nextLevelName(project, action), out))) activate(out.levelId);
        break;
      case 'duplicate':
        if (run('Dupliquer le niveau', duplicateLevel(id, `${level.name} - variante`, out))) activate(out.levelId);
        break;
      case 'up':
        run('Monter le niveau', moveLevel(id, index + 1));
        break;
      case 'down':
        run('Descendre le niveau', moveLevel(id, index - 1));
        break;
      case 'delete':
        setConfirmDelete(id);
        break;
    }
  };

  const menuIndex = menu ? levels.findIndex((l) => l.id === menu.levelId) : -1;
  const toDelete = levels.find((l) => l.id === confirmDelete);

  return (
    <nav className="level-tabs" aria-label="Niveaux">
      {levels.map((l, i) => (
        <div key={l.id} className={l.id === activeId ? 'level-tab level-tab-active' : 'level-tab'}>
          {editing === l.id ? (
            <input
              className="input level-tab-input"
              aria-label="Nom du niveau"
              defaultValue={l.name}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                setEditing(null);
                const v = e.currentTarget.value.trim();
                if (v !== '' && v !== l.name) run('Renommer le niveau', renameLevel(l.id, v));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  e.currentTarget.value = l.name;
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="level-tab-name"
              data-testid={`level-tab-${i}`}
              aria-current={l.id === activeId ? 'page' : undefined}
              title="Double-cliquer pour renommer"
              onClick={() => activate(l.id)}
              onDoubleClick={() => setEditing(l.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(l.id, e.currentTarget);
              }}
            >
              {l.name}
            </button>
          )}
          <button
            type="button"
            className="level-tab-more"
            aria-label={`Actions du niveau ${l.name}`}
            data-testid={`level-menu-${i}`}
            onClick={(e) => openMenu(l.id, e.currentTarget)}
          >
            ...
          </button>
        </div>
      ))}

      {menu && (
        <>
          <div className="menu-backdrop" onMouseDown={() => setMenu(null)} />
          <div className="menu" role="menu" style={{ left: menu.x, bottom: window.innerHeight - menu.y + 4 }}>
            <button type="button" role="menuitem" onClick={() => act('above')}>
              Ajouter au-dessus
            </button>
            <button type="button" role="menuitem" onClick={() => act('below')}>
              Ajouter en dessous
            </button>
            <button type="button" role="menuitem" onClick={() => act('duplicate')}>
              Dupliquer (variante)
            </button>
            <hr />
            <button type="button" role="menuitem" disabled={menuIndex >= levels.length - 1} onClick={() => act('up')}>
              Monter
            </button>
            <button type="button" role="menuitem" disabled={menuIndex <= 0} onClick={() => act('down')}>
              Descendre
            </button>
            <hr />
            <button type="button" role="menuitem" className="menu-danger" disabled={levels.length <= 1} onClick={() => act('delete')}>
              Supprimer
            </button>
          </div>
        </>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Supprimer le niveau"
          message={
            <p>
              Supprimer le niveau "{toDelete.name}" et tout son contenu ? Vous pourrez revenir en arrière avec
              Annuler.
            </p>
          }
          confirmLabel="Supprimer"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            setConfirmDelete(null);
            run('Supprimer le niveau', deleteLevel(toDelete.id));
          }}
        />
      )}
    </nav>
  );
}
