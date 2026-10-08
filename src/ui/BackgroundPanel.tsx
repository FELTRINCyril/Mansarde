import { useContext, useRef, useState, type JSX } from 'react';
import { setBackground, updateBackground } from '@/core/commands/project';
import { formatLength } from '@/core/model/format';
import { newId } from '@/core/model/ids';
import type { Level } from '@/core/model/types';
import { importBackground } from '@/editor/importBackground';
import { useEditor } from '@/editor/store';
import { imageSize } from '@/storage/files';
import { BackgroundServicesContext } from './backgroundServices';
import { ConfirmDialog } from './ConfirmDialog';
import { NumericInput } from './NumericInput';
import { ReadOnly, Section } from './fields';
import { run } from './run';

const OPACITY_LABEL = "Opacité de l'image";

/** Opacity slider: one history entry per drag (gesture), committed on release. */
function OpacitySlider({ level, opacity }: { level: Level; opacity: number }): JSX.Element {
  const percent = Math.round(opacity * 100);
  const commit = () => useEditor.getState().commitGesture();
  return (
    <label className="field">
      <span className="field-label">Opacité</span>
      <span className="field-control">
        <input
          type="range"
          className="input-range"
          min={0}
          max={100}
          step={1}
          value={percent}
          data-testid="background-opacity"
          aria-label={OPACITY_LABEL}
          onChange={(e) => {
            const s = useEditor.getState();
            if (!s.gesture) s.beginGesture(OPACITY_LABEL);
            s.updateGesture(updateBackground(level.id, { opacity: Number(e.target.value) / 100 }));
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <span className="field-unit field-unit-wide">{percent} %</span>
      </span>
    </label>
  );
}

/** "Image de fond" section of the properties panel (nothing selected): import, calibrate, adjust, delete. */
export function BackgroundPanel({ level }: { level: Level }): JSX.Element | null {
  const services = useContext(BackgroundServicesContext);
  const tool = useEditor((s) => s.tool);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!services) return null;
  const bg = level.background;
  const update = (label: string, patch: Parameters<typeof updateBackground>[1]) => run(label, updateBackground(level.id, patch));
  const setTool = useEditor.getState().setTool;

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void importBackground(file, {
      store: useEditor,
      projectStore: services.projectStore,
      measure: imageSize,
      register: services.registerImage,
      viewCenter: services.viewCenter,
      newId,
    });
  };
  const importButton = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        data-testid="background-file"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ''; // the same file can be chosen again
        }}
      />
      <button type="button" className="btn btn-block" data-testid="background-import" onClick={() => fileRef.current?.click()}>
        {bg ? "Remplacer l'image" : 'Importer une image de fond'}
      </button>
    </>
  );

  if (!bg) {
    return (
      <Section title="Image de fond">
        <p className="panel-text panel-hint">Importez un plan (PNG ou JPEG) à décalquer, puis mettez-le à l'échelle.</p>
        {importButton}
      </Section>
    );
  }

  const usable = bg.visible;
  /** `title` explains why the button is disabled, or warns about an enabled one (`warning`). */
  const modeButton = (id: 'calibrate' | 'moveBackground', label: string, testId: string, disabled: boolean, title: string, warning?: string) => (
    <button
      type="button"
      className="btn btn-block"
      data-testid={testId}
      disabled={disabled}
      title={disabled ? title : warning}
      // keep the focus where it is, like the tool bar
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setTool(id)}
    >
      {label}
    </button>
  );

  return (
    <Section title="Image de fond">
      <ReadOnly label="Largeur" value={formatLength(bg.widthPx * bg.scale)} testId="background-width" />
      <ReadOnly label="Hauteur" value={formatLength(bg.heightPx * bg.scale)} testId="background-height" />
      <OpacitySlider level={level} opacity={bg.opacity} />
      <NumericInput
        label="Rotation"
        kind="angle"
        unit="°"
        valueCm={bg.rotation}
        testId="background-rotation"
        onCommit={(v) => update("Pivoter l'image", { rotation: v })}
      />
      <label className="field-check">
        <input
          type="checkbox"
          data-testid="background-locked"
          checked={bg.locked}
          onChange={(e) => update(e.target.checked ? "Verrouiller l'image" : "Déverrouiller l'image", { locked: e.target.checked })}
        />
        Verrouiller
      </label>
      <label className="field-check">
        <input
          type="checkbox"
          data-testid="background-hidden"
          checked={!bg.visible}
          onChange={(e) => update(e.target.checked ? "Masquer l'image" : "Afficher l'image", { visible: !e.target.checked })}
        />
        Masquer
      </label>

      {tool === 'calibrate' && (
        <p className="panel-text panel-hint" data-testid="background-hint">
          Cliquez deux points de l'image dont vous connaissez la distance, puis saisissez la longueur réelle en cm.
        </p>
      )}
      {tool === 'moveBackground' && (
        <p className="panel-text panel-hint" data-testid="background-hint">
          Glissez sur le plan pour déplacer l'image.
        </p>
      )}
      <div className="panel-stack">
        {tool === 'calibrate' ? (
          <button type="button" className="btn btn-block" data-testid="background-calibrate-cancel" onClick={() => setTool('select')}>
            Annuler
          </button>
        ) : (
          modeButton(
            'calibrate',
            "Mettre à l'échelle",
            'background-calibrate',
            !usable,
            "Affichez l'image pour la mettre à l'échelle",
            bg.locked ? "L'image est verrouillée : la mise à l'échelle la déplacera quand même." : undefined,
          )
        )}
        {tool === 'moveBackground' ? (
          <button type="button" className="btn btn-block btn-primary" data-testid="background-move-done" onClick={() => setTool('select')}>
            Terminer
          </button>
        ) : (
          modeButton(
            'moveBackground',
            "Déplacer l'image",
            'background-move',
            bg.locked || !usable,
            bg.locked ? "Déverrouillez l'image pour la déplacer" : "Affichez l'image pour la déplacer",
          )
        )}
        {importButton}
        <button type="button" className="btn btn-block btn-danger-outline" data-testid="background-delete" onClick={() => setConfirmDelete(true)}>
          Supprimer l'image
        </button>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer l'image de fond"
          message="L'image de fond de ce niveau sera supprimée. Vous pourrez annuler cette suppression."
          confirmLabel="Supprimer"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            setTool('select');
            run("Supprimer l'image de fond", setBackground(level.id, null));
          }}
        />
      )}
    </Section>
  );
}
