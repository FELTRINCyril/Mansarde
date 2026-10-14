export interface MaterialStat {
  name: string;
  /** Total area of the triangles drawn with it. */
  area: number;
  /** Base color, linear RGB in [0, 1]. */
  color: [number, number, number];
  metallic: number;
  alpha: number;
}

/** Below this luminance a material is a dark detail (legs, handles, screens). */
const DARK = 0.15;

/**
 * Index of the material the user's color goes on (spec 4.1 step 6): the largest one that is not
 * dark, metallic or transparent; the largest one when all are; -1 without materials.
 */
export function pickMainMaterial(mats: MaterialStat[]): number {
  const plain = (m: MaterialStat) => {
    const [r, g, b] = m.color;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b >= DARK && m.metallic < 0.5 && m.alpha >= 0.9;
  };
  const largest = (ok: (m: MaterialStat) => boolean) => {
    let best = -1;
    mats.forEach((m, i) => {
      if (ok(m) && (best < 0 || m.area > mats[best]!.area)) best = i;
    });
    return best;
  };
  const i = largest(plain);
  return i >= 0 ? i : largest(() => true);
}
