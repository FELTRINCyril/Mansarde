import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type JSX, type MouseEvent, type PointerEvent } from 'react';
import { deriveLevel } from '@/core/geometry/derived';
import type { Id, Vec2 } from '@/core/model/types';
import { CATALOG_DRAG_TYPE, placeObjectAt } from '@/editor/placeObject';
import { activeLevel, useEditor } from '@/editor/store';
import { TOOLS, type PointerInfo, type ToolContext } from '@/editor/tools/types';
import { fitView, screenToWorld, zoomAt, type View } from '@/editor/view';
import { levelBounds } from '@/export/pageLayout';
import { PlanSvg } from '@/render/PlanSvg';

export interface Size { width: number; height: number }

/** Zoom factor per wheel pixel (pixel delta mode); lines and pages are converted first. */
const WHEEL_ZOOM = 0.0015;
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 400;

/** Same rule as the future keyboard guard: never react to keys typed in a field. */
function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/** View that shows the whole active level in a viewport of the given size. */
function fitActiveLevel(size: Size): View | null {
  const level = activeLevel(useEditor.getState());
  if (!level || size.width <= 0 || size.height <= 0) return null;
  return fitView(levelBounds(level, deriveLevel(level)), size);
}

/**
 * The plan: PlanSvg sized to the container, the world viewBox derived from the view. Zoom and pan
 * live here (wheel = zoom around the cursor, space + drag or middle button = pan, key 0 = fit);
 * every other pointer event goes to the active tool (TOOLS) and catalog items can be dropped.
 */
export function PlanCanvas(p: { imageUrls: Record<Id, string>; onResize(size: Size): void }): JSX.Element | null {
  const project = useEditor((s) => s.project);
  const level = useEditor(activeLevel);
  const view = useEditor((s) => s.view);
  const display = useEditor((s) => s.display);
  const selection = useEditor((s) => s.selection);
  const toolId = useEditor((s) => s.tool);
  const setView = useEditor((s) => s.setView);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  const pan = useRef<{ pointerId: number; start: Vec2; view: View } | null>(null);
  const [panning, setPanning] = useState(false);
  const { onResize } = p;

  // container size
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setSize(next);
      onResize(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onResize]);

  // fit the plan once per opened project, as soon as the container has a size
  const fittedFor = useRef<Id | null>(null);
  const projectId = project?.id ?? null;
  useEffect(() => {
    if (!projectId || fittedFor.current === projectId) return;
    const v = fitActiveLevel(size);
    if (!v) return;
    fittedFor.current = projectId;
    setView(v);
  }, [projectId, size, setView]);

  const local = useCallback((e: { clientX: number; clientY: number }): Vec2 => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const ctx = useMemo<ToolContext>(
    () => ({
      store: useEditor,
      toWorld: (screen) => screenToWorld(useEditor.getState().view, screen),
      pxPerCm: () => useEditor.getState().view.pxPerCm,
    }),
    [],
  );

  // tell the previous tool it is no longer active
  useEffect(() => {
    return () => TOOLS[toolId]?.onDeactivate?.(ctx);
  }, [toolId, ctx]);

  // wheel zoom (non passive to prevent the page from scrolling)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? WHEEL_PAGE_PX : 1;
      const factor = Math.exp(-e.deltaY * unit * WHEEL_ZOOM);
      const s = useEditor.getState();
      s.setView(zoomAt(s.view, local(e), factor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [local]);

  // space (pan modifier) and 0 (fit), ignored while typing in a field
  useEffect(() => {
    const setSpace = (v: boolean) => {
      spaceRef.current = v;
      setSpaceDown(v);
    };
    const onDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space') {
        // only on the plan (or nothing focused): elsewhere space keeps pressing buttons, in dialogs too
        const onPlan = e.target === document.body || (e.target instanceof Node && !!ref.current?.contains(e.target));
        if (!onPlan) return;
        e.preventDefault();
        if (!e.repeat) setSpace(true);
      } else if (e.key === '0' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const v = fitActiveLevel({ width: ref.current?.clientWidth ?? 0, height: ref.current?.clientHeight ?? 0 });
        if (v) {
          e.preventDefault();
          useEditor.getState().setView(v);
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    const onBlur = () => setSpace(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const info = (e: MouseEvent): PointerInfo => {
    const screen = local(e);
    return {
      screen,
      world: ctx.toWorld(screen),
      button: e.button,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey || e.ctrlKey,
      detail: e.detail,
    };
  };
  const tool = TOOLS[toolId];

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    ref.current?.focus({ preventScroll: true });
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pan.current = { pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, view: useEditor.getState().view };
      setPanning(true);
      return;
    }
    if (!tool?.onPointerDown) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    tool.onPointerDown(info(e), ctx);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const pn = pan.current;
    if (pn && pn.pointerId === e.pointerId) {
      setView({ ...pn.view, tx: pn.view.tx + e.clientX - pn.start.x, ty: pn.view.ty + e.clientY - pn.start.y });
      return;
    }
    tool?.onPointerMove?.(info(e), ctx);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (pan.current && pan.current.pointerId === e.pointerId) {
      pan.current = null;
      setPanning(false);
      return;
    }
    tool?.onPointerUp?.(info(e), ctx);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(CATALOG_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const refText = e.dataTransfer.getData(CATALOG_DRAG_TYPE);
    if (!refText) return;
    e.preventDefault();
    placeObjectAt(useEditor, refText, ctx.toWorld(local(e)));
  };

  if (!project || !level) return null;
  const lowerIndex = project.levels.findIndex((l) => l.id === level.id) - 1;
  const lowerLevel = display.showLowerLevel && lowerIndex >= 0 ? project.levels[lowerIndex] : null;
  const z = view.pxPerCm;
  const cursor = panning ? 'grabbing' : spaceDown ? 'grab' : (tool?.cursor ?? 'default');

  return (
    <div
      ref={ref}
      className="plan-canvas"
      data-testid="plan-canvas"
      tabIndex={0}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onDoubleClick={(e) => tool?.onDoubleClick?.(info(e), ctx)}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {size.width > 0 && size.height > 0 && (
        <PlanSvg
          project={project}
          level={level}
          lowerLevel={lowerLevel}
          viewBox={{ x: -view.tx / z, y: -view.ty / z, width: size.width / z, height: size.height / z }}
          lineUnit={1 / z}
          dimMode={display.dimMode}
          showGrid={display.showGrid}
          mode="screen"
          imageUrls={p.imageUrls}
          selection={selection}
          width={size.width}
          height={size.height}
        />
      )}
    </div>
  );
}
