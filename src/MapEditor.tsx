import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addMap, getMap, getSceneMaps, saveFog, saveGridSettings, saveLabels, setMapScene,
  type GridSettings, type GridType, type MapLabel, type MapRecord,
} from './db';
import {
  buildGridPath, strokeGrid, GRID_MIN_SIZE, GRID_MAX_SIZE, type GridConfig,
} from './grid';
import { drawLabels, hitTestLabel, measureLabel } from './labels';
import { MAP_FONTS, DEFAULT_FONT, LABEL_COLORS, ensureMapFontsLoaded } from './fonts';
import { openPresentChannel, type PresentMessage, PRESENT_PARAM } from './present';
import { MapPicker } from './MapPicker';
import {
  IconBack, IconClearFog, IconExitFullscreen, IconFit, IconFog, IconFogAll, IconFullscreen,
  IconGridOff, IconHexGrid, IconLayers, IconPresent, IconReveal, IconSave, IconSquareGrid,
  IconText, IconTrash, IconUndo,
} from './icons';

interface MapEditorProps {
  mapId: string;
  onBack: () => void;
}

type Tool = 'reveal' | 'fog' | 'text';
type SaveState = 'saved' | 'unsaved' | 'saving';
/** Screen-pixel radius of the label resize handle hit area. */
const HANDLE_HIT = 12;

interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 12;
const UNDO_LIMIT = 12;
const AUTOSAVE_DELAY = 1200;
const FOG_SEND_INTERVAL = 90;

export function MapEditor({ mapId, onBack }: MapEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const viewRef = useRef<ViewTransform>({ scale: 1, x: 0, y: 0 });
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const paintingRef = useRef(false);
  const panningRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef(0);
  const undoStackRef = useRef<Blob[]>([]);
  const autosaveTimerRef = useRef(0);
  const dirtyRef = useRef(false);

  const [currentMapId, setCurrentMapId] = useState(mapId);
  const currentMapIdRef = useRef(currentMapId);
  currentMapIdRef.current = currentMapId;

  const [mapName, setMapName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tool, setTool] = useState<Tool>('reveal');
  const [brushSize, setBrushSize] = useState(80);
  // Display opacity of the fog for the DM only — lower makes it easy to see
  // what lies under the fog while deciding what to reveal. The player screen
  // always shows fully opaque black.
  const [fogOpacity, setFogOpacity] = useState(0.4);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [undoCount, setUndoCount] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [gridType, setGridType] = useState<GridType>('none');
  const [gridSize, setGridSize] = useState(100);
  const [gridOffsetX, setGridOffsetX] = useState(0);
  const [gridOffsetY, setGridOffsetY] = useState(0);
  const [gridLineWidth, setGridLineWidth] = useState(1.2);
  const [gridOpacity, setGridOpacity] = useState(0.7);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Scenes: sibling maps that share a sceneId
  const [sceneId, setSceneId] = useState<string | undefined>(undefined);
  const [sceneName, setSceneName] = useState('');
  const [sceneMaps, setSceneMaps] = useState<MapRecord[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const sceneThumbUrls = useRef<Map<string, string>>(new Map());

  // Text labels
  const [labels, setLabels] = useState<MapLabel[]>([]);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const labelsRef = useRef<MapLabel[]>([]);
  labelsRef.current = labels;
  const selectedLabelIdRef = useRef<string | null>(null);
  selectedLabelIdRef.current = selectedLabelId;
  const draggingLabelRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const resizingLabelRef = useRef<{ id: string } | null>(null);
  const labelsDirtyRef = useRef(false);
  const labelsSaveTimerRef = useRef(0);
  const labelTextInputRef = useRef<HTMLTextAreaElement>(null);
  const selectedLabel = labels.find((l) => l.id === selectedLabelId) ?? null;

  // Presentation (player screen)
  const [presenting, setPresenting] = useState(false);
  const [presentHint, setPresentHint] = useState('');
  const presentingRef = useRef(false);
  presentingRef.current = presenting;
  const channelRef = useRef<BroadcastChannel | null>(null);
  const playerWindowRef = useRef<Window | null>(null);
  const fogThrottleRef = useRef(0);
  const fogPendingRef = useRef(false);

  const brushSizeRef = useRef(brushSize);
  brushSizeRef.current = brushSize;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const fogOpacityRef = useRef(fogOpacity);
  fogOpacityRef.current = fogOpacity;
  const gridTypeRef = useRef(gridType);
  gridTypeRef.current = gridType;
  const gridSizeRef = useRef(gridSize);
  gridSizeRef.current = gridSize;
  const gridOffsetXRef = useRef(gridOffsetX);
  gridOffsetXRef.current = gridOffsetX;
  const gridOffsetYRef = useRef(gridOffsetY);
  gridOffsetYRef.current = gridOffsetY;
  const gridLineWidthRef = useRef(gridLineWidth);
  gridLineWidthRef.current = gridLineWidth;
  const gridOpacityRef = useRef(gridOpacity);
  gridOpacityRef.current = gridOpacity;

  /* ---------------------------------------------------- presentation send */

  const currentGrid = useCallback((): GridConfig => ({
    gridType: gridTypeRef.current,
    gridSize: gridSizeRef.current,
    gridOffsetX: gridOffsetXRef.current,
    gridOffsetY: gridOffsetYRef.current,
    gridLineWidth: gridLineWidthRef.current,
    gridOpacity: gridOpacityRef.current,
  }), []);

  const postScene = useCallback(() => {
    channelRef.current?.postMessage({
      type: 'scene',
      mapId: currentMapIdRef.current,
      grid: currentGrid(),
      labels: labelsRef.current,
    } satisfies PresentMessage);
  }, [currentGrid]);

  const postGrid = useCallback(() => {
    channelRef.current?.postMessage({
      type: 'grid',
      mapId: currentMapIdRef.current,
      grid: currentGrid(),
    } satisfies PresentMessage);
  }, [currentGrid]);

  const postLabels = useCallback(() => {
    channelRef.current?.postMessage({
      type: 'labels',
      mapId: currentMapIdRef.current,
      labels: labelsRef.current,
    } satisfies PresentMessage);
  }, []);

  const postFog = useCallback(() => {
    const ch = channelRef.current;
    const fogCanvas = fogCanvasRef.current;
    if (!ch || !fogCanvas) return;
    createImageBitmap(fogCanvas)
      .then((bitmap) => {
        ch.postMessage({ type: 'fog', mapId: currentMapIdRef.current, bitmap } satisfies PresentMessage);
        bitmap.close();
      })
      .catch(() => {});
  }, []);

  // Throttle live fog updates while drawing; always trailing-send the final state
  const scheduleFogSend = useCallback(() => {
    if (!channelRef.current) return;
    const now = performance.now();
    if (now - fogThrottleRef.current > FOG_SEND_INTERVAL) {
      fogThrottleRef.current = now;
      postFog();
    } else if (!fogPendingRef.current) {
      fogPendingRef.current = true;
      window.setTimeout(() => {
        fogPendingRef.current = false;
        fogThrottleRef.current = performance.now();
        postFog();
      }, FOG_SEND_INTERVAL);
    }
  }, [postFog]);

  /* ---------------------------------------------------------- rendering */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const fogCanvas = fogCanvasRef.current;
    if (!canvas || !image || !fogCanvas) return;

    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const { scale, x, y } = viewRef.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * x, dpr * y);
    ctx.drawImage(image, 0, 0);
    ctx.globalAlpha = fogOpacityRef.current;
    ctx.drawImage(fogCanvas, 0, 0);
    ctx.globalAlpha = 1;

    // Grid overlay (drawn above the fog so the DM can measure through it)
    const gridPath = buildGridPath(
      gridTypeRef.current,
      gridSizeRef.current,
      gridOffsetXRef.current,
      gridOffsetYRef.current,
      image.width,
      image.height,
      -x / scale,
      -y / scale,
      (canvas.width / dpr - x) / scale,
      (canvas.height / dpr - y) / scale,
      scale
    );
    if (gridPath) {
      strokeGrid(ctx, gridPath, scale, gridLineWidthRef.current, gridOpacityRef.current, image.width, image.height);
    }

    // Text labels (above fog so the DM can always see and manage them)
    const labelsToDraw = labelsRef.current;
    if (labelsToDraw.length) drawLabels(ctx, labelsToDraw);

    // Selection box + resize handle for the selected label
    const selId = selectedLabelIdRef.current;
    if (toolRef.current === 'text' && selId) {
      const sel = labelsToDraw.find((l) => l.id === selId);
      if (sel) {
        const box = measureLabel(ctx, sel);
        const pad = sel.fontSize * 0.15;
        ctx.strokeStyle = 'rgba(79, 124, 255, 0.95)';
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.strokeRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2);
        ctx.setLineDash([]);
        const hx = box.x + box.w + pad;
        const hy = box.y + box.h + pad;
        ctx.beginPath();
        ctx.arc(hx, hy, HANDLE_HIT / scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(79, 124, 255, 0.95)';
        ctx.fill();
      }
    }

    // Brush cursor preview (screen space) — not shown for the text tool
    const cursor = cursorRef.current;
    if (cursor && !panningRef.current && toolRef.current !== 'text') {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const radius = (brushSizeRef.current / 2) * scale;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = toolRef.current === 'reveal' ? 'rgba(255, 214, 112, 0.95)' : 'rgba(148, 163, 255, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  }, []);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  const fitToScreen = useCallback(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) return;
    const rect = container.getBoundingClientRect();
    const scale = Math.min(rect.width / image.width, rect.height / image.height) * 0.96;
    viewRef.current = {
      scale,
      x: (rect.width - image.width * scale) / 2,
      y: (rect.height - image.height * scale) / 2,
    };
    setZoomPct(Math.round(scale * 100));
    scheduleDraw();
  }, [scheduleDraw]);

  /* ------------------------------------------------------------- saving */

  const save = useCallback(async () => {
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas || !dirtyRef.current) return;
    setSaveState('saving');
    const blob = await new Promise<Blob | null>((resolve) => fogCanvas.toBlob(resolve, 'image/png'));
    await saveFog(currentMapIdRef.current, blob);
    dirtyRef.current = false;
    setSaveState('saved');
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState('unsaved');
    if (presentingRef.current) scheduleFogSend();
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      save().catch(console.error);
    }, AUTOSAVE_DELAY);
  }, [save, scheduleFogSend]);

  /* --------------------------------------------------------------- undo */

  const pushUndo = useCallback(() => {
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas) return;
    fogCanvas.toBlob((blob) => {
      if (!blob) return;
      undoStackRef.current.push(blob);
      if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
      setUndoCount(undoStackRef.current.length);
    }, 'image/png');
  }, []);

  const undo = useCallback(async () => {
    const fogCanvas = fogCanvasRef.current;
    const snapshot = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    if (!fogCanvas || !snapshot) return;
    const bitmap = await createImageBitmap(snapshot);
    const ctx = fogCanvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    markDirty();
    scheduleDraw();
  }, [markDirty, scheduleDraw]);

  /* ------------------------------------------------------------- labels */

  const flushLabels = useCallback(async () => {
    if (!labelsDirtyRef.current) return;
    window.clearTimeout(labelsSaveTimerRef.current);
    await saveLabels(currentMapIdRef.current, labelsRef.current);
    labelsDirtyRef.current = false;
  }, []);

  // Update the label array: redraw, debounce-save, and stream to the player
  const commitLabels = useCallback((next: MapLabel[]) => {
    labelsRef.current = next;
    setLabels(next);
    labelsDirtyRef.current = true;
    if (presentingRef.current) postLabels();
    scheduleDraw();
    window.clearTimeout(labelsSaveTimerRef.current);
    labelsSaveTimerRef.current = window.setTimeout(() => {
      saveLabels(currentMapIdRef.current, labelsRef.current)
        .then(() => { labelsDirtyRef.current = false; })
        .catch(console.error);
    }, 500);
  }, [postLabels, scheduleDraw]);

  const updateLabel = useCallback((id: string, patch: Partial<MapLabel>) => {
    commitLabels(labelsRef.current.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, [commitLabels]);

  const deleteLabel = useCallback((id: string) => {
    commitLabels(labelsRef.current.filter((l) => l.id !== id));
    setSelectedLabelId(null);
  }, [commitLabels]);

  /* ----------------------------------------------------------- painting */

  const screenToMap = (sx: number, sy: number) => {
    const { scale, x, y } = viewRef.current;
    return { x: (sx - x) / scale, y: (sy - y) / scale };
  };

  const paintSegment = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas) return;
    const ctx = fogCanvas.getContext('2d')!;
    ctx.globalCompositeOperation = toolRef.current === 'fog' ? 'source-over' : 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    ctx.lineWidth = brushSizeRef.current;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (from.x === to.x && from.y === to.y) {
      ctx.beginPath();
      ctx.arc(to.x, to.y, brushSizeRef.current / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const fillAll = useCallback((mode: 'fog' | 'clear') => {
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas) return;
    pushUndo();
    const ctx = fogCanvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    if (mode === 'fog') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
    } else {
      ctx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
    }
    markDirty();
    scheduleDraw();
  }, [markDirty, pushUndo, scheduleDraw]);

  /* ------------------------------------------------------------ loading */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const record = await getMap(currentMapId);
      if (!record) {
        setLoadError('Map not found in local storage.');
        setLoading(false);
        return;
      }
      const image = await createImageBitmap(record.image);
      const fogCanvas = document.createElement('canvas');
      fogCanvas.width = image.width;
      fogCanvas.height = image.height;
      if (record.fog) {
        const fogBitmap = await createImageBitmap(record.fog);
        fogCanvas.getContext('2d')!.drawImage(fogBitmap, 0, 0);
        fogBitmap.close();
      }
      if (cancelled) {
        image.close();
        return;
      }
      imageRef.current = image;
      fogCanvasRef.current = fogCanvas;
      dirtyRef.current = false;
      setSaveState('saved');
      setMapName(record.name);
      setSceneId(record.sceneId);
      setSceneName(record.sceneName ?? '');
      const loadedLabels = record.labels ?? [];
      labelsRef.current = loadedLabels;
      setLabels(loadedLabels);
      setSelectedLabelId(null);
      labelsDirtyRef.current = false;
      setGridType(record.gridType ?? 'none');
      setGridSize(record.gridSize ?? 100);
      setGridOffsetX(record.gridOffsetX ?? 0);
      setGridOffsetY(record.gridOffsetY ?? 0);
      setGridLineWidth(record.gridLineWidth ?? 1.2);
      setGridOpacity(record.gridOpacity ?? 0.7);
      setLoading(false);
      // Push the freshly loaded map to the player screen
      if (presentingRef.current) {
        postScene();
        postFog();
      }
    })().catch((err) => {
      console.error(err);
      setLoadError('Could not load this map.');
      setLoading(false);
    });
    return () => {
      cancelled = true;
      imageRef.current?.close();
      imageRef.current = null;
    };
  }, [currentMapId, postScene, postFog]);

  // Load scene siblings whenever the scene changes
  useEffect(() => {
    if (!sceneId) {
      setSceneMaps([]);
      return;
    }
    let cancelled = false;
    getSceneMaps(sceneId).then((members) => {
      if (!cancelled) setSceneMaps(members);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [sceneId]);

  useEffect(() => {
    const urls = sceneThumbUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  // Redraw once the label fonts have loaded so text renders in the right face
  useEffect(() => {
    ensureMapFontsLoaded().then(() => scheduleDraw());
  }, [scheduleDraw]);

  const sceneThumbUrl = (record: MapRecord): string => {
    let url = sceneThumbUrls.current.get(record.id);
    if (!url) {
      url = URL.createObjectURL(record.thumbnail);
      sceneThumbUrls.current.set(record.id, url);
    }
    return url;
  };

  // Size the canvas to its container (and re-fit on first load / map switch)
  useEffect(() => {
    if (loading) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      scheduleDraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    fitToScreen();
    return () => observer.disconnect();
  }, [loading, currentMapId, fitToScreen, scheduleDraw]);

  // Redraw and persist grid settings when they change (skip the initial
  // values that were just loaded from the record)
  const gridSettledRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!gridSettledRef.current) {
      gridSettledRef.current = true;
      return;
    }
    scheduleDraw();
    if (presentingRef.current) postGrid();
    const settings: GridSettings = { gridType, gridSize, gridOffsetX, gridOffsetY, gridLineWidth, gridOpacity };
    const timer = window.setTimeout(() => {
      saveGridSettings(currentMapIdRef.current, settings).catch(console.error);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [gridType, gridSize, gridOffsetX, gridOffsetY, gridLineWidth, gridOpacity, loading, postGrid, scheduleDraw]);

  // Track fullscreen state (covers Esc and browser-initiated exits too)
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    } else {
      editorRef.current?.requestFullscreen().catch(console.error);
    }
  }, []);

  // Flush unsaved fog when leaving the page
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        save().catch(console.error);
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [save]);

  // Close the presentation channel on unmount
  useEffect(() => {
    return () => {
      channelRef.current?.postMessage({ type: 'stopped' } satisfies PresentMessage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------ presentation */

  const startPresenting = () => {
    setPresentHint('');
    const url = `${window.location.origin}${window.location.pathname}?${PRESENT_PARAM}=1`;
    playerWindowRef.current = window.open(url, 'fog-atlas-player');
    if (!playerWindowRef.current) {
      setPresentHint('Allow pop-ups for this site to open the player screen.');
      return;
    }
    if (!channelRef.current) {
      const ch = openPresentChannel();
      ch.onmessage = (e: MessageEvent<PresentMessage>) => {
        if (e.data?.type === 'hello') {
          postScene();
          postGrid();
          postFog();
        }
      };
      channelRef.current = ch;
    }
    presentingRef.current = true;
    setPresenting(true);
    postScene();
    postGrid();
    postFog();
  };

  const stopPresenting = () => {
    channelRef.current?.postMessage({ type: 'stopped' } satisfies PresentMessage);
    channelRef.current?.close();
    channelRef.current = null;
    presentingRef.current = false;
    setPresenting(false);
  };

  /* ------------------------------------------------------------- scenes */

  const switchMap = async (id: string) => {
    if (id === currentMapId) return;
    window.clearTimeout(autosaveTimerRef.current);
    await save().catch(console.error);
    await flushLabels().catch(console.error);
    undoStackRef.current = [];
    setUndoCount(0);
    setLoading(true);
    setCurrentMapId(id);
  };

  const handlePickIntoScene = async (record: MapRecord) => {
    let sid = sceneId;
    let sname = sceneName;
    if (!sid) {
      // Upgrade the current solo map into a scene
      sid = crypto.randomUUID();
      sname = mapName || 'Scene';
      await setMapScene(currentMapIdRef.current, sid, sname);
    }
    record.sceneId = sid;
    record.sceneName = sname;
    await addMap(record);
    setSceneId(sid);
    setSceneName(sname);
    setSceneMaps(await getSceneMaps(sid));
  };

  /* ------------------------------------------------------ pointer input */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is best-effort (some synthetic/pen events can't be captured)
    }
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (e.button === 1 || e.button === 2 || spaceHeldRef.current) {
      panningRef.current = true;
      lastPointRef.current = { x: sx, y: sy };
      return;
    }
    if (e.button !== 0) return;

    if (toolRef.current === 'text') {
      const ctx = canvas.getContext('2d')!;
      const scale = viewRef.current.scale;
      const mapPoint = screenToMap(sx, sy);

      // Resize handle of the selected label?
      const selId = selectedLabelIdRef.current;
      if (selId) {
        const sel = labelsRef.current.find((l) => l.id === selId);
        if (sel) {
          const box = measureLabel(ctx, sel);
          const pad = sel.fontSize * 0.15;
          const hx = box.x + box.w + pad;
          const hy = box.y + box.h + pad;
          if (Math.hypot(mapPoint.x - hx, mapPoint.y - hy) * scale <= HANDLE_HIT + 5) {
            resizingLabelRef.current = { id: selId };
            return;
          }
        }
      }
      // Hit an existing label -> select and start dragging
      const hitId = hitTestLabel(ctx, labelsRef.current, mapPoint.x, mapPoint.y);
      if (hitId) {
        const l = labelsRef.current.find((x) => x.id === hitId)!;
        setSelectedLabelId(hitId);
        selectedLabelIdRef.current = hitId;
        draggingLabelRef.current = { id: hitId, dx: mapPoint.x - l.x, dy: mapPoint.y - l.y };
        scheduleDraw();
        return;
      }
      // Empty space -> create a new label there
      const image = imageRef.current;
      const defSize = image ? Math.round(Math.min(200, Math.max(24, image.width / 24))) : 64;
      const newLabel: MapLabel = {
        id: crypto.randomUUID(),
        text: 'New label',
        x: mapPoint.x,
        y: mapPoint.y,
        fontSize: defSize,
        fontFamily: DEFAULT_FONT,
        color: LABEL_COLORS[0],
      };
      commitLabels([...labelsRef.current, newLabel]);
      setSelectedLabelId(newLabel.id);
      selectedLabelIdRef.current = newLabel.id;
      window.setTimeout(() => {
        labelTextInputRef.current?.focus();
        labelTextInputRef.current?.select();
      }, 0);
      return;
    }

    pushUndo();
    paintingRef.current = true;
    const mapPoint = screenToMap(sx, sy);
    paintSegment(mapPoint, mapPoint);
    lastPointRef.current = mapPoint;
    markDirty();
    scheduleDraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    cursorRef.current = { x: sx, y: sy };

    if (panningRef.current && lastPointRef.current) {
      viewRef.current.x += sx - lastPointRef.current.x;
      viewRef.current.y += sy - lastPointRef.current.y;
      lastPointRef.current = { x: sx, y: sy };
      scheduleDraw();
      return;
    }

    if (toolRef.current === 'text') {
      const mp = screenToMap(sx, sy);
      if (resizingLabelRef.current) {
        const l = labelsRef.current.find((x) => x.id === resizingLabelRef.current!.id);
        if (l) {
          l.fontSize = Math.max(8, Math.round((Math.abs(mp.y - l.y) * 2) / 1.25));
          if (presentingRef.current) postLabels();
        }
      } else if (draggingLabelRef.current) {
        const d = draggingLabelRef.current;
        const l = labelsRef.current.find((x) => x.id === d.id);
        if (l) {
          l.x = mp.x - d.dx;
          l.y = mp.y - d.dy;
          if (presentingRef.current) postLabels();
        }
      }
      scheduleDraw();
      return;
    }

    if (paintingRef.current && lastPointRef.current) {
      const mapPoint = screenToMap(sx, sy);
      paintSegment(lastPointRef.current, mapPoint);
      lastPointRef.current = mapPoint;
      markDirty();
    }
    scheduleDraw();
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Matching best-effort release
    }
    const wasPainting = paintingRef.current;
    const labelChanged = !!(draggingLabelRef.current || resizingLabelRef.current);
    paintingRef.current = false;
    panningRef.current = false;
    lastPointRef.current = null;
    draggingLabelRef.current = null;
    resizingLabelRef.current = null;
    // Send the crisp final fog state to the player
    if (wasPainting && presentingRef.current) postFog();
    // Sync React state + persist after a label move/resize
    if (labelChanged) commitLabels([...labelsRef.current]);
    scheduleDraw();
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
  };

  const zoomAt = (sx: number, sy: number, factor: number) => {
    const view = viewRef.current;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    const ratio = newScale / view.scale;
    view.x = sx - (sx - view.x) * ratio;
    view.y = sy - (sy - view.y) * ratio;
    view.scale = newScale;
    setZoomPct(Math.round(newScale * 100));
    scheduleDraw();
  };

  const zoomCenter = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
  };

  const handleBack = async () => {
    window.clearTimeout(autosaveTimerRef.current);
    await save().catch(console.error);
    await flushLabels().catch(console.error);
    onBack();
  };

  /* ---------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        spaceHeldRef.current = true;
        e.preventDefault();
      } else if (e.key === 'r' || e.key === 'R') {
        setTool('reveal');
      } else if (e.key === 'f' || e.key === 'F') {
        setTool('fog');
      } else if (e.key === 't' || e.key === 'T') {
        setTool('text');
      } else if (e.key === '[') {
        setBrushSize((s) => Math.max(8, s - 12));
      } else if (e.key === ']') {
        setBrushSize((s) => Math.min(400, s + 12));
      } else if (e.key === 'g' || e.key === 'G') {
        setGridType((t) => (t === 'none' ? 'hex' : t === 'hex' ? 'square' : 'none'));
      } else if (e.key === '0') {
        fitToScreen();
      } else if (e.key === 'Escape') {
        setSelectedLabelId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLabelIdRef.current) {
        e.preventDefault();
        deleteLabel(selectedLabelIdRef.current);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save().catch(console.error);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeldRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [fitToScreen, save, undo, deleteLabel]);

  // Leaving the text tool clears the label selection (so the box disappears
  // and fog painting isn't blocked)
  useEffect(() => {
    if (tool !== 'text') setSelectedLabelId(null);
  }, [tool]);

  /* -------------------------------------------------------------- view */

  if (loadError) {
    return (
      <div className="editor-message">
        <p>{loadError}</p>
        <button className="btn btn-secondary" onClick={onBack}><IconBack /> Back to library</button>
      </div>
    );
  }

  return (
    <div className="editor" ref={editorRef}>
      <header className="editor-toolbar">
        <div className="toolbar-group">
          <button className="btn btn-ghost" onClick={handleBack} title="Back to library (saves fog)">
            <IconBack />
          </button>
          <span className="editor-title" title={sceneName || mapName}>{mapName || '…'}</span>
        </div>

        <div className="toolbar-group tool-toggle" role="group" aria-label="Fog tools">
          <button
            className={`btn tool-btn ${tool === 'reveal' ? 'tool-active-reveal' : 'btn-ghost'}`}
            onClick={() => setTool('reveal')}
            title="Reveal — erase fog with the mouse (R)"
          >
            <IconReveal />
            Reveal
          </button>
          <button
            className={`btn tool-btn ${tool === 'fog' ? 'tool-active-fog' : 'btn-ghost'}`}
            onClick={() => setTool('fog')}
            title="Fog — paint fog with the mouse (F)"
          >
            <IconFog />
            Fog
          </button>
          <button
            className={`btn tool-btn ${tool === 'text' ? 'tool-active-text' : 'btn-ghost'}`}
            onClick={() => setTool('text')}
            title="Text — place and edit labels on the map (T)"
          >
            <IconText />
            Text
          </button>
        </div>

        <div className="toolbar-group slider-group" title="Brush size ( [ and ] )">
          <span className="slider-label">Brush</span>
          <input
            type="range"
            min={8}
            max={400}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <span className="slider-value">{brushSize}</span>
        </div>

        <div className="toolbar-group">
          <button className="btn btn-ghost" onClick={() => fillAll('fog')} title="Cover the entire map in fog">
            <IconFogAll />
            Fog all
          </button>
          <button className="btn btn-ghost" onClick={() => fillAll('clear')} title="Remove all fog">
            <IconClearFog />
            Clear fog
          </button>
          <button className="btn btn-ghost" onClick={undo} disabled={undoCount === 0} title="Undo (Ctrl+Z)">
            <IconUndo />
          </button>
        </div>

        <div className="toolbar-group" role="group" aria-label="Grid overlay">
          <button
            className={`btn ${gridType === 'none' ? 'tool-active-grid' : 'btn-ghost'}`}
            onClick={() => setGridType('none')}
            title="No grid (G cycles)"
          >
            <IconGridOff />
          </button>
          <button
            className={`btn ${gridType === 'hex' ? 'tool-active-grid' : 'btn-ghost'}`}
            onClick={() => setGridType('hex')}
            title="Hex grid — honeycomb overlay (G cycles)"
          >
            <IconHexGrid />
          </button>
          <button
            className={`btn ${gridType === 'square' ? 'tool-active-grid' : 'btn-ghost'}`}
            onClick={() => setGridType('square')}
            title="Square grid overlay (G cycles)"
          >
            <IconSquareGrid />
          </button>
          <div className="slider-group" title="Cell size in map pixels">
            <span className="slider-label">Scale</span>
            <input
              type="range"
              min={GRID_MIN_SIZE}
              max={GRID_MAX_SIZE}
              value={gridSize}
              disabled={gridType === 'none'}
              onChange={(e) => setGridSize(Number(e.target.value))}
            />
            <span className="slider-value">{gridSize}</span>
          </div>
          {gridType !== 'none' && (
            <>
              <div className="slider-group" title="Shift the grid horizontally to line it up with the map's own grid">
                <span className="slider-label">X</span>
                <input
                  type="range"
                  className="slider-narrow"
                  min={0}
                  max={gridSize * 2}
                  value={gridOffsetX}
                  onChange={(e) => setGridOffsetX(Number(e.target.value))}
                />
              </div>
              <div className="slider-group" title="Shift the grid vertically to line it up with the map's own grid">
                <span className="slider-label">Y</span>
                <input
                  type="range"
                  className="slider-narrow"
                  min={0}
                  max={gridSize * 2}
                  value={gridOffsetY}
                  onChange={(e) => setGridOffsetY(Number(e.target.value))}
                />
              </div>
              <div className="slider-group" title="Grid line thickness">
                <span className="slider-label">Line</span>
                <input
                  type="range"
                  className="slider-narrow"
                  min={5}
                  max={50}
                  value={Math.round(gridLineWidth * 10)}
                  onChange={(e) => setGridLineWidth(Number(e.target.value) / 10)}
                />
              </div>
              <div className="slider-group" title="Grid visibility">
                <span className="slider-label">Visibility</span>
                <input
                  type="range"
                  className="slider-narrow"
                  min={10}
                  max={100}
                  value={Math.round(gridOpacity * 100)}
                  onChange={(e) => setGridOpacity(Number(e.target.value) / 100)}
                />
              </div>
            </>
          )}
        </div>

        <div className="toolbar-group slider-group" title="How opaque the fog looks on YOUR screen — the player screen is always solid black">
          <span className="slider-label">DM fog</span>
          <input
            type="range"
            min={20}
            max={100}
            value={Math.round(fogOpacity * 100)}
            onChange={(e) => {
              setFogOpacity(Number(e.target.value) / 100);
              scheduleDraw();
            }}
          />
        </div>

        <div className="toolbar-group">
          <button className="btn btn-ghost" onClick={() => zoomCenter(0.8)} title="Zoom out">−</button>
          <span className="zoom-label">{zoomPct}%</span>
          <button className="btn btn-ghost" onClick={() => zoomCenter(1.25)} title="Zoom in">+</button>
          <button className="btn btn-ghost" onClick={fitToScreen} title="Fit map to screen (0)">
            <IconFit />
          </button>
          <button
            className="btn btn-ghost"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen — perfect for at the table'}
          >
            {isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
          </button>
        </div>

        <div className="toolbar-group toolbar-right">
          <button
            className={`btn ${presenting ? 'tool-active-present' : 'btn-secondary'}`}
            onClick={presenting ? stopPresenting : startPresenting}
            title={presenting ? 'Stop the player screen' : 'Open a second screen for your players (drag it to your TV)'}
          >
            <IconPresent />
            {presenting ? 'Presenting' : 'Player screen'}
          </button>
          <span className={`save-status save-${saveState}`}>
            {saveState === 'saved' && '● Saved'}
            {saveState === 'saving' && '● Saving…'}
            {saveState === 'unsaved' && '● Unsaved'}
          </span>
          <button className="btn btn-primary" onClick={() => save().catch(console.error)} disabled={saveState === 'saved'} title="Save fog (Ctrl+S)">
            <IconSave />
            Save
          </button>
        </div>
      </header>

      {presentHint && <div className="present-hint">{presentHint}</div>}

      <div className="editor-canvas-wrap" ref={containerRef}>
        {loading ? (
          <div className="editor-message">Loading map…</div>
        ) : (
          <canvas
            ref={canvasRef}
            className="editor-canvas"
            style={{ cursor: tool === 'text' ? 'crosshair' : 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerLeave={(e) => {
              cursorRef.current = null;
              endPointer(e);
            }}
            onWheel={onWheel}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}

        {tool === 'text' && !loading && (
          selectedLabel ? (
            <div className="label-panel">
              <textarea
                ref={labelTextInputRef}
                className="label-text-input"
                rows={2}
                value={selectedLabel.text}
                placeholder="Label text"
                onChange={(e) => updateLabel(selectedLabel.id, { text: e.target.value })}
              />
              <div className="label-row">
                <select
                  className="label-font-select"
                  value={selectedLabel.fontFamily}
                  onChange={(e) => updateLabel(selectedLabel.id, { fontFamily: e.target.value })}
                >
                  {MAP_FONTS.map((f) => (
                    <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => deleteLabel(selectedLabel.id)}
                  title="Delete label (Del)"
                >
                  <IconTrash size={15} />
                </button>
              </div>
              <div className="label-row slider-group" title="Text size">
                <span className="slider-label">Size</span>
                <input
                  type="range"
                  min={12}
                  max={600}
                  value={Math.min(600, Math.round(selectedLabel.fontSize))}
                  onChange={(e) => updateLabel(selectedLabel.id, { fontSize: Number(e.target.value) })}
                />
              </div>
              <div className="label-colors">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`label-swatch ${selectedLabel.color === c ? 'label-swatch-active' : ''}`}
                    style={{ background: c }}
                    onClick={() => updateLabel(selectedLabel.id, { color: c })}
                    title={c}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="label-hint">Click the map to place a label · drag to move · corner handle to resize</div>
          )
        )}
      </div>

      {/* Scene bar: switch between maps of a multi-map scene, or start one */}
      <div className="scene-bar">
        <span className="scene-bar-label">
          <IconLayers size={15} />
          {sceneMaps.length > 1 ? sceneName || 'Scene' : 'Scene'}
        </span>
        <div className="scene-bar-maps">
          {sceneMaps.map((m) => (
            <button
              key={m.id}
              className={`scene-thumb ${m.id === currentMapId ? 'scene-thumb-active' : ''}`}
              onClick={() => switchMap(m.id)}
              title={m.name}
            >
              <img src={sceneThumbUrl(m)} alt={m.name} />
              {m.fog && <span className="scene-thumb-dot" title="fog prepared" />}
            </button>
          ))}
          <button className="scene-add" onClick={() => setPickerOpen(true)} title="Add another map to this scene">
            +
            <span className="scene-add-label">{sceneMaps.length > 1 ? 'Add map' : 'Add a linked map'}</span>
          </button>
        </div>
      </div>

      <footer className="editor-statusbar">
        <span><kbd>R</kbd> reveal · <kbd>F</kbd> fog · <kbd>[</kbd><kbd>]</kbd> brush size · <kbd>G</kbd> grid · <kbd>Space</kbd>+drag or right-drag to pan · scroll to zoom · <kbd>0</kbd> fit · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>S</kbd> save</span>
      </footer>

      {pickerOpen && (
        <MapPicker
          title="Add a map to this scene"
          subtitle="Pick another level or area — it gets its own fog. Great for stairs, floors, or linked locations."
          pickedLabel="In scene"
          onClose={() => setPickerOpen(false)}
          onPick={handlePickIntoScene}
        />
      )}
    </div>
  );
}
