import { useEffect, useRef, useState, type JSX } from 'react';
import { checkSeverityByTarget, computeChecks } from '@/core/checks/computeChecks';
import type { Check } from '@/core/checks/types';
import { deriveLevel } from '@/core/geometry/derived';
import { activeLevel, useEditor, type EditorState } from '@/editor/store';
import type { Preset, Scene3D, Scene3DInput } from '@/scene3d';
import { ErrorBoundary } from './ErrorBoundary';

declare global {
  interface Window {
    /** DEV only: counters of the 3D view for the e2e tests (scene3dStats). */
    __planMaison3D?: typeof import('@/scene3d').scene3dStats;
    /** DEV only: pixel probe of the 3D view for the e2e tests (scene3dProbe). */
    __planMaison3DProbe?: typeof import('@/scene3d').scene3dProbe;
  }
}

const NO_ALERTS: Scene3DInput['alerts'] = new Map();
/** One severity map per checks array (computeChecks memoizes by level): a stable input while nothing changes. */
const severities = new WeakMap<Check[], Scene3DInput['alerts']>();

/** Worst severity per element of the checks of the level (tinted in 3D), none when the alerts are hidden. */
function alertsOf(s: EditorState, level: NonNullable<ReturnType<typeof activeLevel>>): Scene3DInput['alerts'] {
  // display.hideAlerts ("Masquer les alertes") comes with task 8
  if ((s.display as { hideAlerts?: boolean }).hideAlerts || !s.project) return NO_ALERTS;
  const checks = computeChecks(level, deriveLevel(level), s.project.customObjects);
  if (checks.length === 0) return NO_ALERTS;
  let m = severities.get(checks);
  if (!m) {
    m = checkSeverityByTarget(checks);
    severities.set(checks, m);
  }
  return m;
}

/** Input of the 3D view, or null without an open project and level. */
function inputOf(s: EditorState): Scene3DInput | null {
  const level = activeLevel(s);
  if (!s.project || !level) return null;
  const index = s.project.levels.indexOf(level);
  return {
    project: s.project,
    level,
    lowerLevels: s.display.lowerLevels3d ? s.project.levels.slice(0, Math.max(0, index)) : [],
    selection: s.selection,
    alerts: alertsOf(s, level),
    showLabels: s.display.labels3d,
    hideAllWalls: s.display.hideWalls3d,
  };
}

const sameInput = (a: Scene3DInput, b: Scene3DInput): boolean =>
  a.project === b.project &&
  a.level === b.level &&
  a.selection === b.selection &&
  a.alerts === b.alerts &&
  a.showLabels === b.showLabels &&
  a.hideAllWalls === b.hideAllWalls &&
  a.lowerLevels.length === b.lowerLevels.length &&
  a.lowerLevels.every((l, i) => l === b.lowerLevels[i]);

const PRESETS: Array<[Preset, string]> = [
  ['overview', "Vue d'ensemble"],
  ['top', 'Dessus'],
  ['room', 'Depuis la pièce sélectionnée'],
];

type Status = 'loading' | 'ready' | 'unavailable';

/**
 * Host of the 3D view: imports src/scene3d on demand (three.js stays out of the main bundle),
 * creates the scene in its container, keeps its size (ResizeObserver) and feeds it the active
 * level whenever something it shows changes; disposes everything when unmounted. Shows "La 3D
 * n'est pas disponible sur ce navigateur." when WebGL is missing; any other failure (module that
 * cannot load, error while building the scene) is thrown during render, for the error boundary.
 */
function Scene3DHost(): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene3D | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [crash, setCrash] = useState<Error | null>(null);
  const display = useEditor((s) => s.display);
  const setDisplay = useEditor((s) => s.setDisplay);
  if (crash) throw crash;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let s: Scene3D | null = null;
    let ro: ResizeObserver | null = null;
    let unsubscribe: (() => void) | null = null;
    const fail = (e: unknown) => {
      if (!cancelled) setCrash(e instanceof Error ? e : new Error(String(e)));
    };
    import('@/scene3d')
      .then((mod) => {
        if (cancelled) return;
        try {
          s = mod.createScene3D(el, { onSelect: (item) => useEditor.getState().setSelection(item ? [item] : []) });
        } catch (e) {
          if (e instanceof Error && e.message === 'webgl') {
            setStatus('unavailable');
            return;
          }
          throw e;
        }
        if (import.meta.env.DEV) {
          window.__planMaison3D = mod.scene3dStats;
          window.__planMaison3DProbe = mod.scene3dProbe;
        }
        const live = s;
        scene.current = live;
        let last: Scene3DInput | null = null;
        const push = (state: EditorState) => {
          const input = inputOf(state);
          if (!input || (last && sameInput(last, input))) return;
          last = input;
          try {
            live.update(input);
          } catch (e) {
            fail(e);
          }
        };
        live.resize();
        push(useEditor.getState());
        unsubscribe = useEditor.subscribe(push);
        ro = new ResizeObserver(() => live.resize());
        ro.observe(el);
        setStatus('ready');
      })
      .catch(fail);
    return () => {
      cancelled = true;
      unsubscribe?.();
      ro?.disconnect();
      s?.dispose();
      scene.current = null;
    };
  }, []);

  return (
    <div className="scene3d" data-testid="scene3d">
      <div className="scene3d-host" ref={host} />
      {status === 'loading' && <div className="scene3d-message">Chargement de la 3D...</div>}
      {status === 'unavailable' && (
        <div className="scene3d-message" role="status" data-testid="scene3d-unavailable">
          La 3D n'est pas disponible sur ce navigateur.
        </div>
      )}
      {status === 'ready' && (
        <div className="scene3d-bar">
          <div className="segmented" role="group" aria-label="Vues prédéfinies">
            {PRESETS.map(([p, label]) => (
              <button key={p} type="button" className="segmented-item" data-testid={`preset-${p}`} onClick={() => scene.current?.setPreset(p)}>
                {label}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={display.labels3d} onChange={(e) => setDisplay({ labels3d: e.target.checked })} />
            Noms des objets
          </label>
          <label className="check">
            <input type="checkbox" data-testid="hide-walls-3d" checked={display.hideWalls3d} onChange={(e) => setDisplay({ hideWalls3d: e.target.checked })} />
            Cacher tous les murs
          </label>
          <label className="check">
            <input type="checkbox" checked={display.lowerLevels3d} onChange={(e) => setDisplay({ lowerLevels3d: e.target.checked })} />
            Afficher les niveaux inférieurs
          </label>
        </div>
      )}
    </div>
  );
}

function Scene3DError(p: { error: Error }): JSX.Element {
  return (
    <div className="plan-error" role="alert" data-testid="scene3d-error">
      <p className="plan-error-title">La vue 3D ne peut pas être affichée.</p>
      <p className="hint">Détail technique : {p.error.message}</p>
    </div>
  );
}

/** The 3D view behind its own error boundary (spec 10), retried when the active level changes (an undo). */
export function Plan3DView(): JSX.Element {
  const level = useEditor(activeLevel);
  return (
    <ErrorBoundary resetKey={level} fallback={(error) => <Scene3DError error={error} />}>
      <Scene3DHost />
    </ErrorBoundary>
  );
}
