import { applyPatches, enablePatches, type Patch } from 'immer';
import type { Project } from '../model/types';

enablePatches();

export interface HistoryEntry { label: string; patches: Patch[]; inverse: Patch[] }
export interface History { past: HistoryEntry[]; future: HistoryEntry[] }

export const emptyHistory: History = { past: [], future: [] };

/** Records a new edit; any redo stack is discarded. */
export function pushEntry(h: History, e: HistoryEntry): History {
  return { past: [...h.past, e], future: [] };
}

export function undo(project: Project, h: History): { project: Project; history: History } | null {
  const entry = h.past[h.past.length - 1];
  if (!entry) return null;
  return {
    project: applyPatches(project, entry.inverse),
    history: { past: h.past.slice(0, -1), future: [entry, ...h.future] },
  };
}

export function redo(project: Project, h: History): { project: Project; history: History } | null {
  const entry = h.future[0];
  if (!entry) return null;
  return {
    project: applyPatches(project, entry.patches),
    history: { past: [...h.past, entry], future: h.future.slice(1) },
  };
}
