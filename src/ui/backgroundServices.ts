import { createContext } from 'react';
import type { Id, Vec2 } from '@/core/model/types';
import type { ProjectStore } from '@/storage/db';

/** What the editor screen lends the background panel: image storage, URL registration and the view center. */
export interface BackgroundServices {
  projectStore: ProjectStore;
  /** Makes a newly stored image displayable (the editor owns the object URLs and revokes them on close). */
  registerImage(imageId: Id, blob: Blob): void;
  viewCenter(): Vec2;
}

export const BackgroundServicesContext = createContext<BackgroundServices | null>(null);
