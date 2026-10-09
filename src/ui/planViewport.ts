import { createContext } from 'react';
import type { Size } from './PlanCanvas';

/** Size (px) of the plan canvas, read when needed: its last visible size (0 x 0 before it was ever laid out). */
export const PlanViewportContext = createContext<() => Size>(() => ({ width: 0, height: 0 }));
