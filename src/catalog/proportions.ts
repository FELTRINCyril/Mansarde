/*
 * Proportions shared by the 2D symbols (symbols.tsx) and the 3D furniture (src/scene3d/furniture),
 * so that both views draw the same piece of furniture. Lengths in cm.
 */

/** Back and arm thicknesses of a sofa or armchair of w x d. */
export function sofaParts(w: number, d: number): { back: number; arm: number } {
  return { back: Math.min(d * 0.25, 25), arm: Math.min(w * 0.1, 18) };
}

/** Number of doors of a wardrobe w wide: about one every 60 cm. */
export const wardrobeDoorCount = (w: number): number => Math.max(1, Math.round(w / 60));
