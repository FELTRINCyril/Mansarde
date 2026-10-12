import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type JSX, type MouseEvent, type PointerEvent } from 'react';
import { checkSeverityByTarget } from '@/core/checks/computeChecks';
import { deriveLevel } from '@/core/geometry/derived';
import type { Id, Vec2 } from '@/core/model/types';
import { fitBounds } from '@/editor/background';
import { handleTarget, objectHandles, volumeHandles } from '@/editor/handles';
import { handleGlobalKey, isIgnoredKey, isTypingTarget } from '@/editor/keyboard';
import { CATALOG_DRAG_TYPE, placeObjectAt } from '@/editor/placeObject';
import { activeLevel, useEditor } from '@/editor/store';
import { TOOLS } from '@/editor/tools/registry';
import type { PointerInfo, ToolContext } from '@/editor/tools/types';
import { fitView, keepCenterOnResize, screenToWorld, zoomAt, type View } from '@/editor/view';
import { trackControlKey, wheelIntent, wheelPlanView, WheelSourceLatch } from '@/editor/wheel';
import { levelBounds } from '@/export/pageLayout';
import { OverlayLayer } from '@/render/OverlayLayer';
import { PlanSvg } from '@/render/PlanSvg';
import { NumericOverlayInput } from './NumericOverlayInput';
import { RoomRenameInput } from './RoomRenameInput';
import { useLevelChecks } from './ChecksPanel';
import { NavigationHint } from './NavigationHint';
import { WallReferenceBar } from './WallReferenceBar';

export interface Size { width: number; height: number }

/** Safari's pinch (GestureEvent, non-standard): its scale since the gesture started, at a client point. */
type GestureLike = Event & { scale?: number; clientX?: number; clientY?: number };

/** View that shows the whole active level, tracing image included, in a viewport of the given size. */
function fitActiveLevel(size: Size): View | null {
  const level = activeLevel(useEditor.getState());
  if (!level || size.width <= 0 || size.height <= 0) return null;
  return fitView(fitBounds(levelBounds(level, deriveLevel(level)), level.background), size);
}

/**
 * Interaction layer of the plan, a component of its own: it alone subscribes to the overlay, so a
 * pointer move that only changes the overlay (selection rectangle, guides) does not re-render the
 * static plan layers. Handles: select tool, exactly one object, slope or beam selected.
 */
function PlanOverlay(): JSX.Element | null {
  const overlay = useEditor((s) => s.overlay);
  const selection = useEditor((s) => s.selection);
  const toolId = useEditor((s) => s.tool);
  const level = useEditor(activeLevel);
  const z = useEditor((s) => s.view.pxPerCm);
  const target = toolId === 'select' ? handleTarget(selection, level) : null;
  const select = toolId === 'select';
  const handles = useMemo(
    () => (target ? objectHandles(target, z) : select ? volumeHandles(selection, level) : []),
    [target, z, select, selection, level],
  );
  return <OverlayLayer overlay={overlay} handles={handles} lineUnit={1 / z} />;
}

/**
 * The plan: PlanSvg sized to the container, the world viewBox derived from the view, the
 * interaction overlay (OverlayLayer) and the in-place room name field on top. Zoom and pan live
 * here: a two-finger trackpad scroll pans, a mouse wheel, Ctrl / Cmd + wheel and a pinch (ctrlKey
 * wheel, Safari gesture events) zoom around the cursor, Shift + wheel pans sideways (heuristic and
 * rules: src/editor/wheel.ts); a right, middle or Space + left drag pans (the plan has no context
 * menu: it is always suppressed); every other pointer event goes to the active tool (TOOLS, which
 * only act on the left button) and catalog items can be dropped. A press interrupted
 * without a pointerup (pointercancel, capture lost, window blur) calls the tool's onCancel. The single window key
 * handler of the editor is here too: guard (isIgnoredKey: typing in a field, key already handled,
 * dialog open), space for panning (released without a pan: the tool's onSpaceTap), then
 * handleGlobalKey (tool keys, shortcuts, 0 = fit). Space is followed wherever the focus is (the 3D
 * view takes it on a click, so does a button): Space + left press over the plan always pans, the
 * press never reaches the tool; only a press made on the plan (or with nothing focused) is kept
 * from the browser and can be a tap. The wall tool's option bar sits on top.
 */
export function PlanCanvas(p: { imageUrls: Record<Id, string>; onResize(size: Size): void }): JSX.Element | null {
  const project = useEditor((s) => s.project);
  const level = useEditor(activeLevel);
  const view = useEditor((s) => s.view);
  const display = useEditor((s) => s.display);
  const selection = useEditor((s) => s.selection);
  const toolId = useEditor((s) => s.tool);
  const setView = useEditor((s) => s.setView);
  // check alerts of the active level (spec 7.3), none when "Masquer les alertes" is checked
  const checks = useLevelChecks();
  const alerts = useMemo(() => (display.hideAlerts ? undefined : checkSeverityByTarget(checks)), [checks, display.hideAlerts]);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  /** The view was panned with the current space press: its release is not a tap (Tool.onSpaceTap). */
  const spacePanned = useRef(false);
  /** The current space press was made on the plan (or with nothing focused): its release may be a tap. */
  const spaceTap = useRef(false);
  const pan = useRef<{ pointerId: number; start: Vec2; view: View } | null>(null);
  /** Pointer pressed for the active tool (captured), until its pointerup or its cancellation. */
  const toolPointer = useRef<number | null>(null);
  const [panning, setPanning] = useState(false);
  const { onResize } = p;

  // container size; the view keeps its center when the visible size changes (Plan + 3D, split
  // separator, window), measured against the last visible size (hidden behind the 3D view: 0 x 0)
  const lastVisible = useRef<Size | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      if (next.width > 0 && next.height > 0) {
        const s = useEditor.getState();
        if (lastVisible.current) {
          const v = keepCenterOnResize(s.view, lastVisible.current, next);
          if (v !== s.view) s.setView(v);
        }
        lastVisible.current = next;
      }
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

  // wheel and pinch (non passive to prevent the page from scrolling and the browser from zooming)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const source = new WheelSourceLatch();
    // a ctrlKey wheel with Control up is a pinch, with Control down a Ctrl + wheel (wheel.ts)
    const control = trackControlKey(window);
    /** Scale of the Safari pinch in progress, null outside one. */
    let gesture: number | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Safari may send its pinch as gesture events and ctrlKey wheels: count it once
      if (gesture !== null && e.ctrlKey) return;
      const s = useEditor.getState();
      s.setView(wheelPlanView(s.view, wheelIntent(e, source.source(e, performance.now()), control.held()), local(e)));
    };
    const onGestureStart = (e: GestureLike) => {
      e.preventDefault();
      gesture = e.scale ?? 1;
    };
    const onGestureChange = (e: GestureLike) => {
      e.preventDefault();
      const scale = e.scale ?? 1;
      if (gesture === null || !(scale > 0)) return;
      const s = useEditor.getState();
      const r = el.getBoundingClientRect();
      const at = { x: (e.clientX ?? r.left + r.width / 2) - r.left, y: (e.clientY ?? r.top + r.height / 2) - r.top };
      s.setView(zoomAt(s.view, at, scale / gesture));
      gesture = scale;
    };
    const onGestureEnd = (e: GestureLike) => {
      e.preventDefault();
      gesture = null;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('gestureend', onGestureEnd);
    return () => {
      control.dispose();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
    };
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
    // capture: whatever has the focus (the 3D canvas after a click in it, a button) and whatever
    // its handlers do with the key, a held space makes a left press on the plan pan (onPointerDown)
    const onSpaceDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      spacePanned.current = false;
      spaceTap.current = false;
      spaceRef.current = true;
      // no grab cursor while a space is typed in a field
      setSpaceDown(!isTypingTarget(e.target));
    };
    const onDown = (e: KeyboardEvent) => {
      if (isIgnoredKey(e)) return;
      if (e.code === 'Space') {
        // kept from the browser only on the plan (or nothing focused): elsewhere space keeps
        // pressing buttons; a release there is not a tap for the plan's tool either
        const onPlan = e.target === document.body || (e.target instanceof Node && !!ref.current?.contains(e.target));
        if (!onPlan) return;
        e.preventDefault();
        if (!e.repeat) spaceTap.current = true;
        return;
      }
      if (handleGlobalKey(e, useEditor, ctx)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tap = spaceRef.current && spaceTap.current && !spacePanned.current;
      spaceTap.current = false;
      setSpace(false);
      if (tap) TOOLS[useEditor.getState().tool]?.onSpaceTap?.(ctx);
    };
    const onBlur = () => {
      spaceTap.current = false;
      setSpace(false);
      // the window lost the focus during a press: no pointerup will come, abandon the interaction
      endPan();
      if (toolPointer.current !== null) {
        toolPointer.current = null;
        TOOLS[useEditor.getState().tool]?.onCancel?.(ctx);
      }
    };
    window.addEventListener('keydown', onSpaceDown, true);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onSpaceDown, true);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp, true);
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
    if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      if (spaceRef.current) spacePanned.current = true;
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
          alerts={alerts}
          overlay={<PlanOverlay />}
          width={size.width}
          height={size.height}
        />
      )}
      <WallReferenceBar />
      <NavigationHint view="plan" />
      <RoomRenameInput />
      <NumericOverlayInput ctx={ctx} canvas={size} restoreFocus={() => ref.current?.focus({ preventScroll: true })} />
    </div>
  );
}
