import type { JSX } from 'react';
import { deriveLevel } from '@/core/geometry/derived';
import type { Id, Project } from '@/core/model/types';
import { activeLevel, useEditor } from '@/editor/store';
import { ErrorBoundary } from './ErrorBoundary';
import { PlanCanvas, type Size } from './PlanCanvas';

/** Shown instead of the plan when rendering it threw: the rest of the editor keeps working. */
function PlanError(p: { error: Error; onExportProject(project: Project): void; onClose(): void }): JSX.Element {
  const canUndo = useEditor((s) => s.history.past.length > 0);
  return (
    <div className="plan-error" role="alert" data-testid="plan-error">
      <p className="plan-error-title">Le plan ne peut pas être affiché.</p>
      <p className="hint">Détail technique : {p.error.message}</p>
      <div className="plan-error-actions">
        {canUndo && (
          <button type="button" className="btn" onClick={() => useEditor.getState().undo()}>
            Annuler la dernière modification
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => {
            const project = useEditor.getState().project;
            if (project) p.onExportProject(project);
          }}
        >
          Exporter le projet (.json)
        </button>
        <button type="button" className="btn btn-primary" onClick={p.onClose}>
          Retour aux projets
        </button>
      </div>
    </div>
  );
}

/**
 * The plan canvas behind an error boundary (ruling R37), retried whenever the active level changes
 * (an undo, another level), and the notice of a level whose geometry could only be computed in a
 * simplified form (DerivedLevel.degraded).
 */
export function PlanArea(p: {
  imageUrls: Record<Id, string>;
  onResize(size: Size): void;
  onExportProject(project: Project): void;
  onClose(): void;
}): JSX.Element {
  const level = useEditor(activeLevel);
  const degraded = level ? deriveLevel(level).degraded : false;
  return (
    <>
      <ErrorBoundary resetKey={level} fallback={(error) => <PlanError error={error} onExportProject={p.onExportProject} onClose={p.onClose} />}>
        <PlanCanvas imageUrls={p.imageUrls} onResize={p.onResize} />
      </ErrorBoundary>
      {degraded && (
        <div className="plan-notice" role="status" data-testid="geometry-degraded">
          Géométrie complexe : affichage simplifié.
        </div>
      )}
    </>
  );
}
