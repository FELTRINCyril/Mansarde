import { Material, Mesh, MeshStandardMaterial, type Object3D } from 'three';

export type AlertSeverity = 'error' | 'warning';

/** Alert colors of spec 8.2 (as the 2D alert outlines). */
export const ALERT_COLORS: Record<AlertSeverity, string> = { error: '#cf2e2e', warning: '#e08a1e' };
/** Share of the alert color in the tinted color (task 12: 50 %). */
export const ALERT_MIX = 0.5;

/** `a` mixed with `b` (sRGB hex colors, as written in the UI): (1 - t) a + t b per channel. */
export function mixHex(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const full = (hex: string) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex);
  const A = full(a);
  const B = full(b);
  let out = '#';
  for (let i = 0; i < 3; i++) out += Math.round((1 - t) * ch(A, i) + t * ch(B, i)).toString(16).padStart(2, '0');
  return out;
}

/** Tinted clone of a material: its color mixed 50 % with the alert color. */
function tinted(m: Material, severity: AlertSeverity): Material {
  const c = m.clone();
  if (c instanceof MeshStandardMaterial) c.color.set(mixHex(`#${m instanceof MeshStandardMaterial ? m.color.getHexString() : 'ffffff'}`, ALERT_COLORS[severity], ALERT_MIX));
  return c;
}

interface Tint { severity: AlertSeverity; originals: Map<Mesh, Material | Material[]>; clones: Material[] }

/**
 * Red or orange tint of the objects (and cupboards) in alert (spec 8.2). The materials of the
 * scene are shared, so a tinted element gets its own clones of them, mixed 50 % with the alert
 * color; `sync` restores the elements no longer in alert and disposes their clones (also when the
 * element was dropped from the scene in the meantime).
 */
export class AlertTints {
  private readonly tints = new Map<Object3D, Tint>();

  /** Tints exactly the given elements with their severity. */
  sync(targets: ReadonlyMap<Object3D, AlertSeverity>): void {
    for (const [root, t] of this.tints) {
      if (targets.get(root) !== t.severity) this.untint(root);
    }
    for (const [root, severity] of targets) {
      if (this.tints.has(root)) continue;
      const originals = new Map<Mesh, Material | Material[]>();
      const clones: Material[] = [];
      const byOriginal = new Map<Material, Material>();
      const swap = (m: Material) => {
        let c = byOriginal.get(m);
        if (!c) {
          c = tinted(m, severity);
          byOriginal.set(m, c);
          clones.push(c);
        }
        return c;
      };
      root.traverse((n) => {
        if (!(n instanceof Mesh)) return;
        originals.set(n, n.material);
        n.material = Array.isArray(n.material) ? n.material.map(swap) : swap(n.material);
      });
      this.tints.set(root, { severity, originals, clones });
    }
  }

  /** Severity of the tint of an element (tests). */
  severityOf(root: Object3D): AlertSeverity | undefined {
    return this.tints.get(root)?.severity;
  }

  private untint(root: Object3D): void {
    const t = this.tints.get(root);
    if (!t) return;
    for (const [mesh, m] of t.originals) mesh.material = m;
    for (const c of t.clones) c.dispose();
    this.tints.delete(root);
  }

  dispose(): void {
    for (const root of [...this.tints.keys()]) this.untint(root);
  }
}
