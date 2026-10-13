import { useEffect, useSyncExternalStore } from 'react';
import { getCatalogEntry, modelOutlinesUrl } from '@/catalog/catalog';
import type { PlacedObject } from '@/core/model/types';

/**
 * Top view of a downloaded model: flat [x0, y0, x1, y1, ...] rings in thousandths of its box,
 * x right, y towards the front (+y of the plan); `detail` are its upper parts, drawn as lines.
 */
export interface ModelOutline {
  outline: number[][];
  detail: number[][];
}

type Table = Record<string, [number[][], number[][]]>;

/*
 * The top views of all the downloaded models live in one file (public/models/outlines.json),
 * fetched once, and only when a plan shows a downloaded model: the app bundle stays light (spec
 * 2026-10-13, section 10). Until it arrives (or if it cannot), such an object is drawn as its box.
 */
let table: Table | null = null;
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

const notify = () => {
  version++;
  for (const l of listeners) l();
};

/** The top view of model `id` once loaded, else null. */
export function modelOutline(id: string): ModelOutline | null {
  const row = table?.[id];
  return row ? { outline: row[0], detail: row[1] } : null;
}

/**
 * Loads the top views once (later calls share the same promise). A failure is reported once on
 * the console and leaves the boxes; it is not retried during the session.
 */
export function loadModelOutlines(fetchTable: () => Promise<Table> = defaultFetch): Promise<void> {
  if (!loading) {
    loading = fetchTable().then(
      (t) => {
        table = t;
        notify();
      },
      (e: unknown) => console.warn('top views of the 3D models could not be loaded', e),
    );
  }
  return loading;
}

async function defaultFetch(): Promise<Table> {
  const res = await fetch(modelOutlinesUrl(import.meta.env.BASE_URL));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Table;
}

/** Sets the table directly (tests), or clears it with null. */
export function setModelOutlines(t: Table | null): void {
  table = t;
  loading = t ? Promise.resolve() : null;
  notify();
}

/** True when one of the objects is a downloaded model. */
export const showsModels = (objects: Iterable<PlacedObject>): boolean => {
  for (const o of objects) if (o.source.kind === 'catalog' && getCatalogEntry(o.source.catalogId)?.model) return true;
  return false;
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => version;

/**
 * For the plan: re-renders when the top views arrive, and asks for them when `needed` (the
 * level shows a downloaded model). Server rendering (exports) reads what is loaded: the export
 * awaits loadModelOutlines first.
 */
export function useModelOutlines(needed: boolean): number {
  const v = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (needed) void loadModelOutlines();
  }, [needed]);
  return v;
}
