import type { Project } from '@/core/model/types';

/** Default name of a new level: "Étage n" above, "Sous-sol" then "Sous-sol n" below, unused in the project. */
export function nextLevelName(project: Project, where: 'above' | 'below'): string {
  const used = new Set(project.levels.map((l) => l.name));
  if (where === 'above') {
    let n = 1;
    while (used.has(`Étage ${n}`)) n++;
    return `Étage ${n}`;
  }
  if (!used.has('Sous-sol')) return 'Sous-sol';
  let n = 2;
  while (used.has(`Sous-sol ${n}`)) n++;
  return `Sous-sol ${n}`;
}
