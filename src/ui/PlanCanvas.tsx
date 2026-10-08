import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type JSX, type MouseEvent, type PointerEvent } from 'react';
import { deriveLevel } from '@/core/geometry/derived';
import type { Id, Vec2 } from '@/core/model/types';
import { handleTarget, objectHandles } from '@/editor/handles';
import { handleGlobalKey, isIgnoredKey } from '@/editor/keyboard';
import { CATALOG_DRAG_TYPE, placeObjectAt } from '@/editor/placeObject';
import { activeLevel, useEditor } from '@/editor/store';
import { TOOLS } from '@/editor/tools/registry';
import type { PointerInfo, ToolContext } from '@/editor/tools/types';
import { fitView, screenToWorld, zoomAt, type View } from '@/editor/view';
import { levelBounds } from '@/export/pageLayout';
import { OverlayLayer } from '@/render/OverlayLayer';
import { PlanSvg } from '@/render/PlanSvg';
import { NumericOverlayInput } from './NumericOverlayInput';
import { RoomRenameInput } from './RoomRenameInput';

export interface Size { width: number; height: number }

/** Zoom factor per wheel pixel (pixel delta mode); lines and pages are converted first. */
const WHEEL_ZOOM = 0.0015;
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 400;

/** View that shows the whole active level in a viewport of the given size. */
function fitActiveLevel(size: Size): View | null {
  const level = activeLevel(useEditor.getState());
  if (!level || size.width <= 0 || size.height <= 0) return null;
  return fitView(levelBounds(level, deriveLevel(level)), size);
}

/**
 * Interaction layer of the plan, a component of its own: it alone subscribes to the overlay, so a
 * pointer move that only changes the overlay (selection rectangle, guides) does not re-render the
 * static plan layers. Handles: select tool, exactly one object selected.
 */
function PlanOverlay(): JSX.Element | null {
  const overlay = useEditor((s) => s.overlay);
  const selection = useEditor((s) => s.selection);
  const toolId = useEditor((s) => s.tool);
  const level = useEditor(activeLevel);
  const z = useEditor((s) => s.view.pxPerCm);
  const target = toolId === 'select' ? handleTarget(selection, level) : null;
  const handles = useMemo(() => (target ? objectHandles(target, z) : []), [target, z]);
  return <OverlayLayer overlay={overlay} handles={handles} lineUnit={1 / z} />;
}

/**
 * The plan: PlanSvg sized to the container, the world viewBox derived from the view, the
 * interaction overlay (OverlayLayer) and the in-place room name field on top. Zoom and pan live
 * here (wheel = zoom around the cursor, space + drag or middle button = pan); every other pointer
 * event goes to the active tool (TOOLS) and catalog items can be dropped. A press interrupted
 * without a pointerup (pointercancel, capture lost, window blur) calls the tool's onCancel. The single window key
 * handler of the editor is here too: guard (isIgnoredKey: typing in a field, key already handled,
 * dialog open), space for panning, then handleGlobalKey (tool keys, shortcuts, 0 = fit).
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
  /** Pointer pressed for the active tool (captured), until its pointerup or its cancellation. */
  const toolPointer = useRef<number | null>(null);
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
      fitView: () => {
        const v = fitActiveLevel({ width: ref.current?.clientWidth ?? 0, height: ref.current?.clientHeight ?? 0 });
        if (v) useEditor.getState().setView(v);
      },
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

  const endPan = useCallback(() => {
    if (!pan.current) return;
    pan.current = null;
    setPanning(false);
  }, []);

  // the editor's single key handler: nothing while typing in a field or behind a dialog. A layout
  // effect: it is attached in the commit that shows the plan, so a key pressed as soon as the
  // editor is visible is not lost (a passive effect runs later, input events can come first)
  useLayoutEffect(() => {
    const setSpace = (v: boolean) => {
      spaceRef.current = v;
      setSpaceDown(v);
    };
    const onDown = (e: KeyboardEvent) => {
      if (isIgnoredKey(e)) return;
      if (e.code === 'Space') {
        // only on the plan (or nothing focused): elsewhere space keeps pressing buttons
        const onPlan = e.target === document.body || (e.target instanceof Node && !!ref.current?.contains(e.target));
        if (!onPlan) return;
        e.preventDefault();
        if (!e.repeat) setSpace(true);
        return;
      }
      if (handleGlobalKey(e, useEditor, ctx)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    const onBlur = () => {
      setSpace(false);
      // the window lost the focus during a press: no pointerup will come, abandon the interaction
      endPan();
      if (toolPointer.current !== null) {
        toolPointer.current = null;
        TOOLS[useEditor.getState().tool]?.onCancel?.(ctx);
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [ctx, endPan]);

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
    toolPointer.current = e.pointerId;
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
      endPan();
      return;
    }
    if (toolPointer.current === e.pointerId) toolPointer.current = null;
    tool?.onPointerUp?.(info(e), ctx);
  };
  /** pointercancel, or the capture lost without a pointerup: the press is abandoned, nothing is committed. */
  const onPointerInterrupted = (e: PointerEvent<HTMLDivElement>) => {
    if (pan.current && pan.current.pointerId === e.pointerId) {
      endPan();
      return;
    }
    if (toolPointer.current !== e.pointerId) return; // lostpointercapture right after a normal pointerup
    toolPointer.current = null;
    tool?.onCancel?.(ctx);
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
      onPointerCancel={onPointerInterrupted}
      onLostPointerCapture={onPointerInterrupted}
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
          overlay={<PlanOverlay />}
          width={size.width}
          height={size.height}
        />
      )}
      <RoomRenameInput />
      <NumericOverlayInput ctx={ctx} canvas={size} restoreFocus={() => ref.current?.focus({ preventScroll: true })} />
    </div>
  );
}
