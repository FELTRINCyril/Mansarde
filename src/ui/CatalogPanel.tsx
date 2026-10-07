import { useMemo, useState, type DragEvent, type JSX } from 'react';
import { CATALOG, type CatalogCategory } from '@/catalog/catalog';
import { GenericSymbol, SYMBOLS } from '@/catalog/symbols';
import { deleteCustomObject } from '@/core/commands/project';
import type { CustomObjectDef, GenericShape, LShapeParams } from '@/core/model/types';
import { CATALOG_DRAG_TYPE } from '@/editor/placeObject';
import { useEditor } from '@/editor/store';
import { run } from './run';

const PREVIEW_PX = 34;
const MY_OBJECTS = 'Mes objets';
const NO_CUSTOM: Record<string, CustomObjectDef> = {};

/** Lower case without accents, for the search. */
const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function Preview(p: { id?: string; shape: GenericShape | 'symbol'; w: number; d: number; color: string; lshape: LShapeParams | null }): JSX.Element {
  const size = Math.max(p.w, p.d) * 1.08;
  const lineUnit = size / PREVIEW_PX;
  const common = { w: p.w, d: p.d, lineUnit, stroke: '#333333', fill: p.color };
  const Sym = p.id ? SYMBOLS[p.id] : undefined;
  return (
    <svg className="catalog-preview" viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} width={PREVIEW_PX} height={PREVIEW_PX} aria-hidden="true">
      <g fillOpacity={0.45}>
        {p.shape === 'symbol' && Sym ? <Sym {...common} /> : <GenericSymbol {...common} shape={p.shape === 'symbol' ? 'rect' : p.shape} lshape={p.lshape} />}
      </g>
    </svg>
  );
}

interface Item {
  ref: string;
  name: string;
  w: number;
  d: number;
  preview: JSX.Element;
  custom?: CustomObjectDef;
}

/**
 * Collapsible catalog: categories, search by name, "Mes objets" of the project. Items are dragged
 * onto the plan (dataTransfer CATALOG_DRAG_TYPE = "catalog:<id>" / "custom:<id>"); a click places
 * the object at the center of the view.
 */
export function CatalogPanel(p: { onPlace(ref: string): void }): JSX.Element {
  const customObjects = useEditor((s) => s.project?.customObjects ?? NO_CUSTOM);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set([MY_OBJECTS, 'Chambre']));

  const groups = useMemo(() => {
    const out: Array<{ title: string; items: Item[] }> = [];
    const custom = Object.values(customObjects).map<Item>((d) => ({
      ref: `custom:${d.id}`,
      name: d.name,
      w: d.width,
      d: d.depth,
      custom: d,
      preview: <Preview shape={d.shape} w={d.width} d={d.depth} color={d.color} lshape={d.lshape} />,
    }));
    out.push({ title: MY_OBJECTS, items: custom });
    const byCat = new Map<CatalogCategory, Item[]>();
    for (const e of CATALOG) {
      const list = byCat.get(e.category) ?? [];
      list.push({
        ref: `catalog:${e.id}`,
        name: e.name,
        w: e.width,
        d: e.depth,
        preview: <Preview id={e.id} shape={e.shape} w={e.width} d={e.depth} color={e.color} lshape={e.lshape ?? null} />,
      });
      byCat.set(e.category, list);
    }
    for (const [title, items] of byCat) out.push({ title, items });
    return out;
  }, [customObjects]);

  if (collapsed) {
    return (
      <button type="button" className="catalog-collapsed" onClick={() => setCollapsed(false)} title="Afficher le catalogue">
        Catalogue
      </button>
    );
  }

  const q = fold(query.trim());
  const searching = q !== '';
  const toggle = (title: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  const onDragStart = (e: DragEvent<HTMLElement>, ref: string) => {
    e.dataTransfer.setData(CATALOG_DRAG_TYPE, ref);
    e.dataTransfer.setData('text/plain', ref);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="catalog" aria-label="Catalogue" data-testid="catalog-panel">
      <div className="catalog-head">
        <h2 className="catalog-title">Catalogue</h2>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setCollapsed(true)} title="Replier le catalogue">
          Replier
        </button>
      </div>
      <input
        className="input catalog-search"
        type="search"
        placeholder="Rechercher un objet"
        aria-label="Rechercher un objet"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="catalog-list">
        {groups.map((g) => {
          const items = searching ? g.items.filter((i) => fold(i.name).includes(q)) : g.items;
          if (searching && items.length === 0) return null;
          const isOpen = searching || open.has(g.title);
          return (
            <section key={g.title} className="catalog-group">
              <button type="button" className="catalog-group-head" aria-expanded={isOpen} onClick={() => toggle(g.title)}>
                <span className="catalog-caret">{isOpen ? '-' : '+'}</span>
                {g.title}
                <span className="catalog-count">{g.items.length}</span>
              </button>
              {isOpen && g.title === MY_OBJECTS && items.length === 0 && (
                <p className="catalog-empty">Sélectionnez un objet générique puis "Enregistrer dans mes objets".</p>
              )}
              {isOpen &&
                items.map((i) => (
                  <div key={i.ref} className="catalog-row">
                    <button
                      type="button"
                      className="catalog-item"
                      draggable
                      data-testid={`catalog-item-${i.ref.replace(':', '-')}`}
                      title="Glisser sur le plan, ou cliquer pour poser au centre"
                      onDragStart={(e) => onDragStart(e, i.ref)}
                      onClick={() => p.onPlace(i.ref)}
                    >
                      {i.preview}
                      <span className="catalog-name">{i.name}</span>
                      <span className="catalog-dims">
                        {Math.round(i.w)} x {Math.round(i.d)}
                      </span>
                    </button>
                    {i.custom && (
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        aria-label={`Supprimer ${i.name} de mes objets`}
                        title="Supprimer de mes objets"
                        onClick={() => run('Supprimer de mes objets', deleteCustomObject(i.custom!.id))}
                      >
                        Suppr.
                      </button>
                    )}
                  </div>
                ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
