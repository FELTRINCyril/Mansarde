import type { JSX } from 'react';
import { updateSettings } from '@/core/commands/project';
import type { ProjectSettings } from '@/core/model/types';
import { useEditor } from '@/editor/store';
import { Modal } from './ConfirmDialog';
import { run } from './run';
import { NumericInput } from './NumericInput';

const FIELDS: Array<[keyof ProjectSettings, string]> = [
  ['defaultWallThickness', 'Épaisseur des murs'],
  ['partitionThickness', 'Épaisseur des cloisons'],
  ['defaultCeilingHeight', 'Hauteur sous plafond'],
  ['gridStep', 'Pas de la grille'],
];

/** Project settings; each field is committed on its own (one history entry per change). */
export function SettingsDialog(p: { onClose(): void }): JSX.Element | null {
  const settings = useEditor((s) => s.project?.settings);
  if (!settings) return null;
  return (
    <Modal title="Réglages du projet" onClose={p.onClose} testId="settings-dialog">
      <div className="modal-body">
        {FIELDS.map(([key, label]) => (
          <NumericInput
            key={key}
            label={label}
            valueCm={settings[key]}
            testId={`setting-${key}`}
            onCommit={(v) => run('Réglages', updateSettings({ [key]: v }))}
          />
        ))}
        <p className="hint">Ces valeurs s'appliquent aux prochains murs et niveaux créés.</p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={p.onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
