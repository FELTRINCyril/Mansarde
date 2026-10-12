import type { Id } from '../model/types';

/** The rules of spec 5.4, one per file of ./rules. */
export type CheckKind = 'height' | 'cupboardHeight' | 'collision' | 'wallOverlap' | 'doorSwing' | 'cupboardOpening' | 'floating' | 'cupboardClearance';

export type CheckSeverity = 'error' | 'warning';

/** An element a check is about (selectable in the editor). */
export interface CheckTarget { kind: 'object' | 'cupboard' | 'opening'; id: Id }

/**
 * A non-blocking alert on the level (spec 5.4). `id` is stable for the same rule and targets, so
 * the UI can key its rows on it; `message` is the French text shown to the user.
 */
export interface Check { id: string; severity: CheckSeverity; kind: CheckKind; message: string; targets: CheckTarget[] }
