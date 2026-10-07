import { useEffect, useState, type JSX } from 'react';
import { deriveLevel } from '@/core/geometry/derived';
import type { Id, Project } from '@/core/model/types';
import { levelBounds } from '@/export/pageLayout';
import { PlanSvg } from '@/render/PlanSvg';
import type { ProjectStore } from '@/storage/db';
import { thumbnailViewBox } from './thumbnail';

const WIDTH = 120;
const HEIGHT = 80;
const MARGIN_CM = 30;
/** Thinner lines and smaller texts than on screen: the whole plan fits in 120 px. */
const LINE_SCALE = 0.5;
const NO_IMAGES: Record<Id, string> = {};

/** Preview of the first level (print rendering, no background image), or a placeholder when it is empty. */
export function ProjectThumbnail(p: { projectStore: ProjectStore; id: Id; updatedAt: string }): JSX.Element {
  const [project, setProject] = useState<Project | null>(null);
  const { projectStore, id, updatedAt } = p;
  useEffect(() => {
    let cancelled = false;
    projectStore
      .getProject(id)
      .then((proj) => {
        if (!cancelled) setProject(proj);
      })
      .catch((e: unknown) => console.error('Thumbnail: cannot read the project', e));
    return () => {
      cancelled = true;
    };
  }, [projectStore, id, updatedAt]);

  const level = project?.levels[0];
  const bounds = level ? levelBounds(level, deriveLevel(level), MARGIN_CM) : null;
  if (!project || !level || !bounds) {
    return (
      <div className="project-thumb project-thumb-empty" data-testid="project-thumb" aria-hidden="true">
        {project ? 'Plan vide' : ''}
      </div>
    );
  }
  const viewBox = thumbnailViewBox(bounds, WIDTH, HEIGHT);
  return (
    <div className="project-thumb" data-testid="project-thumb" aria-hidden="true">
      <PlanSvg
        project={project}
        level={level}
        viewBox={viewBox}
        lineUnit={(viewBox.width / WIDTH) * LINE_SCALE}
        dimMode="none"
        showGrid={false}
        mode="print"
        imageUrls={NO_IMAGES}
        width={WIDTH}
        height={HEIGHT}
      />
    </div>
  );
}
