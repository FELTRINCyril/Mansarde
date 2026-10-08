import type { Id, Project } from '@/core/model/types';

/** Names of the levels whose background image is not among the available (stored and readable) ones. */
export function levelsWithMissingImages(project: Project, available: ReadonlySet<Id>): string[] {
  return project.levels.filter((l) => l.background && !available.has(l.background.imageId)).map((l) => l.name);
}

export const missingImageMessage = (levelName: string): string => `Image de fond introuvable pour le niveau ${levelName}.`;
