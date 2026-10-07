import { useMemo, useState, type JSX } from 'react';
import { deriveLevel } from '@/core/geometry/derived';
import type { Id, Level, Project } from '@/core/model/types';
import { exportFileName } from '@/export/fileName';
import { ERR_EMPTY_LEVEL, SCALES, fits, levelBounds, suggestScale, type Orientation, type PageSpec, type PaperFormat } from '@/export/pageLayout';
import { exportPdf } from '@/export/pdf';
import { exportPng } from '@/export/png';
import { useEditor } from '@/editor/store';
import { blobToBase64, downloadBlob } from '@/storage/files';
import type { ProjectStore } from '@/storage/db';
import { Banner } from './Banner';
import { Modal } from './ConfirmDialog';

type Tab = 'pdf' | 'png' | 'json';
type Resolution = 1 | 2 | 4;

const TABS: Array<[Tab, string]> = [
  ['pdf', 'PDF à l\'échelle'],
  ['png', 'Image PNG'],
  ['json', 'Projet (.json)'],
];
const RESOLUTIONS: Resolution[] = [1, 2, 4];

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Data URL of the level's background image (from the project store), as the export functions expect. */
async function backgroundDataUrls(store: ProjectStore, level: Level): Promise<Record<Id, string>> {
  const out: Record<Id, string> = {};
  const bg = level.background;
  if (!bg) return out;
  const img = await store.getImage(bg.imageId);
  if (img) out[bg.imageId] = `data:${img.mime};base64,${await blobToBase64(img.blob)}`;
  return out;
}

/** Message shown when the plan does not fit the page at the chosen scale (suggested: smallest scale that fits). */
function fitMessage(spec: PageSpec, suggested: number | null): string {
  if (suggested === null) return 'Le plan ne tient pas sur cette page, même au 1/200. Choisissez un format plus grand.';
  return `Le plan ne tient pas sur cette page à l'échelle 1/${spec.scale}. Échelle conseillée : 1/${suggested}.`;
}

function Segmented<T extends string | number>(p: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  testId: string;
  onChange(v: T): void;
}): JSX.Element {
  return (
    <div className="field field-wide export-field" role="group" aria-label={p.label}>
      <span className="field-label">{p.label}</span>
      <div className="segmented">
        {p.options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            className={v === p.value ? 'segmented-item segmented-item-active' : 'segmented-item'}
            aria-pressed={v === p.value}
            data-testid={`${p.testId}-${v}`}
            onClick={() => p.onChange(v)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Export dialog: scaled PDF, PNG image and the project file, wired to src/export and the project store. */
export function ExportDialog(p: { projectStore: ProjectStore; onExportJson(project: Project): void; onClose(): void }): JSX.Element | null {
  const project = useEditor((s) => s.project);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const displayDimMode = useEditor((s) => s.display.dimMode);
  const [tab, setTab] = useState<Tab>('pdf');
  const [levelId, setLevelId] = useState<Id | null>(activeLevelId);
  const [format, setFormat] = useState<PaperFormat>('A4');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [scale, setScale] = useState<number>(50);
  const [resolution, setResolution] = useState<Resolution>(2);
  const [withDims, setWithDims] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const level = project?.levels.find((l) => l.id === levelId) ?? project?.levels[0];
  const bounds = useMemo(() => (level ? levelBounds(level, deriveLevel(level)) : null), [level]);
  if (!project || !level) return null;

  const spec: PageSpec = { format, orientation, scale };
  const empty = bounds === null;
  const pdfFits = bounds !== null && fits(bounds, spec);
  const suggested = bounds !== null && !pdfFits ? suggestScale(bounds, format, orientation) : null;
  const dimMode = withDims ? displayDimMode : 'none';

  const canExport = !busy && !empty && (tab === 'png' || pdfFits);

  const doExport = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const imageDataUrls = await backgroundDataUrls(p.projectStore, level);
      if (tab === 'pdf') {
        const blob = await exportPdf({ project, level, spec, imageDataUrls, date: new Date(), dimMode });
        downloadBlob(exportFileName(project.name, level.name, 'pdf'), blob);
      } else {
        const blob = await exportPng({ project, level, resolution, imageDataUrls, dimMode });
        downloadBlob(exportFileName(project.name, level.name, 'png'), blob);
      }
      p.onClose();
    } catch (e) {
      setError(messageOf(e) === ERR_EMPTY_LEVEL ? 'Ce niveau est vide.' : `Export impossible : ${messageOf(e)}`);
      setBusy(false);
    }
  };

  const levelField = (
    <label className="field field-wide export-field">
      <span className="field-label">Niveau</span>
      <select className="input" data-testid="export-level" value={level.id} disabled={busy} onChange={(e) => setLevelId(e.target.value)}>
        {project.levels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );

  const dimsField = (
    <label className="check export-check">
      <input type="checkbox" data-testid="export-dims" checked={withDims} disabled={busy} onChange={(e) => setWithDims(e.target.checked)} />
      Inclure les cotes selon l'affichage courant
    </label>
  );

  return (
    <Modal title="Exporter" onClose={p.onClose} testId="export-dialog" wide>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'tab tab-active' : 'tab'}
            data-testid={`export-tab-${id}`}
            disabled={busy}
            onClick={() => {
              setTab(id);
              setError(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'json' ? (
        <>
          <div className="modal-body">
            <p className="hint">Le fichier .json contient tout le projet, images de fond comprises. Il peut être réimporté depuis l'écran des projets.</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={p.onClose}>
              Fermer
            </button>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="export-json"
              onClick={() => {
                p.onExportJson(project);
                p.onClose();
              }}
            >
              Exporter le projet (.json)
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="modal-body export-body">
            {levelField}
            {tab === 'pdf' ? (
              <>
                <Segmented<PaperFormat>
                  label="Format"
                  value={format}
                  options={[['A4', 'A4'], ['A3', 'A3']]}
                  testId="export-format"
                  onChange={setFormat}
                />
                <Segmented<Orientation>
                  label="Orientation"
                  value={orientation}
                  options={[['landscape', 'Paysage'], ['portrait', 'Portrait']]}
                  testId="export-orientation"
                  onChange={setOrientation}
                />
                <Segmented<number>
                  label="Échelle"
                  value={scale}
                  options={SCALES.map((s): [number, string] => [s, `1/${s}`])}
                  testId="export-scale"
                  onChange={setScale}
                />
              </>
            ) : (
              <Segmented<Resolution>
                label="Résolution"
                value={resolution}
                options={RESOLUTIONS.map((r): [Resolution, string] => [r, `${r}x`])}
                testId="export-resolution"
                onChange={setResolution}
              />
            )}
            {dimsField}
            {tab === 'png' && <p className="hint">À 1x, un pixel représente un centimètre du plan.</p>}
            {empty && (
              <div className="export-message export-message-warn" role="status" data-testid="export-empty">
                Ce niveau est vide.
              </div>
            )}
            {tab === 'pdf' && !empty && !pdfFits && (
              <div className="export-message export-message-warn" role="status" data-testid="export-fit-message">
                <span>{fitMessage(spec, suggested)}</span>
                {suggested !== null && (
                  <button type="button" className="btn btn-small" data-testid="export-use-scale" onClick={() => setScale(suggested)}>
                    Utiliser 1/{suggested}
                  </button>
                )}
              </div>
            )}
            {error && (
              <Banner kind="error" testId="export-error">
                {error}
              </Banner>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={p.onClose}>
              Fermer
            </button>
            <button type="button" className="btn btn-primary" data-testid="export-run" disabled={!canExport} onClick={() => void doExport()}>
              {busy ? 'Export en cours...' : 'Exporter'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
