import { useCallback, useEffect, useRef, useState } from 'react';
import { getMap, saveFog, saveGridSettings, type GridSettings, type GridType } from './db';
import {
  IconBack, IconClearFog, IconExitFullscreen, IconFit, IconFog, IconFogAll, IconFullscreen,
  IconGridOff, IconHexGrid, IconReveal, IconSave, IconSquareGrid, IconUndo,
} from './icons';

interface MapEditorProps {
  mapId: string;
  onBack: () => void;
}

type Tool = 'reveal' | 'fog';
type SaveState = 'saved' | 'unsaved' | 'saving';

interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 12;
const UNDO_LIMIT = 12;
const AUTOSAVE_DELAY = 1200;
const GRID_MIN_SIZE = 20;
const GRID_MAX_SIZE = 400;
/** Below this on-screen cell size the grid is unreadable; skip drawing it. */
const GRID_MIN_SCREEN_CELL = 5;

/**
 * Build the grid overlay as a single path in map coordinates, restricted to
 * the visible region so huge maps stay fast. Returns null when the grid is
 * off or would be too dense to read at the current zoom.
 */
function buildGridPath(
  type: GridType,
  size: number,
  offsetX: number,
  offsetY: number,
  mapWidth: number,
  mapHeight: number,
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number,
  scale: number
): Path2D | null {
  if (type === 'none' || size * scale < GRID_MIN_SCREEN_CELL) return null;

  const left = Math.max(0, viewLeft);
  const top = Math.max(0, viewTop);
  const right = Math.min(mapWidth, viewRight);
  const bottom = Math.min(mapHeight, viewBottom);
  if (right <= left || bottom <= top) return null;

  const path = new Path2D();

  if (type === 'square') {
    for (let gx = Math.floor((left - offsetX) / size) * size + offsetX; gx <= right; gx += size) {
      if (gx < left) continue;
      path.moveTo(gx, top);
      path.lineTo(gx, bottom);
    }
    for (let gy = Math.floor((top - offsetY) / size) * size + offsetY; gy <= bottom; gy += size) {
      if (gy < top) continue;
      path.moveTo(left, gy);
      path.lineTo(right, gy);
    }
    return path;
  }

  // Pointy-top hexagons; `size` is the hex width (distance across flats),
  // so the circumradius is size / sqrt(3).
  const r = size / Math.sqrt(3);
  const rowStep = 1.5 * r;
  const firstRow = Math.floor((top - offsetY) / rowStep) - 1;
  const lastRow = Math.ceil((bottom - offsetY) / rowStep) + 1;
  const firstCol = Math.floor((left - offsetX) / size) - 1;
  const lastCol = Math.ceil((right - offsetX) / size) + 1;

  for (let row = firstRow; row <= lastRow; row++) {
    const cy = row * rowStep + offsetY;
    const rowShift = row % 2 !== 0 ? size / 2 : 0;
    for (let col = firstCol; col <= lastCol; col++) {
      const cx = col * size + rowShift + offsetX;
      for (let k = 0; k < 6; k++) {
        const angle = Math.PI / 6 + (k * Math.PI) / 3;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (k === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
      path.closePath();
    }
  }
  return path;
}

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

  const [mapName, setMapName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tool, setTool] = useState<Tool>('reveal');
  const [brushSize, setBrushSize] = useState(80);
  const [fogOpacity, setFogOpacity] = useState(0.85);
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
      // Visible map-space region, for culling
      -x / scale,
      -y / scale,
      (canvas.width / dpr - x) / scale,
      (canvas.height / dpr - y) / scale,
      scale
    );
    if (gridPath) {
      // Line thickness is in screen pixels (constant while zooming);
      // visibility scales both strokes of the dark-under-light pair
      const lineWidth = gridLineWidthRef.current;
      const visibility = gridOpacityRef.current;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, image.width, image.height);
      ctx.clip();
      ctx.lineWidth = (lineWidth * 2.1) / scale;
      ctx.strokeStyle = `rgba(8, 10, 16, ${0.72 * visibility})`;
      ctx.stroke(gridPath);
      ctx.lineWidth = lineWidth / scale;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * visibility})`;
      ctx.stroke(gridPath);
      ctx.restore();
    }

    // Brush cursor preview (screen space)
    const cursor = cursorRef.current;
    if (cursor && !panningRef.current) {
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
    await saveFog(mapId, blob);
    dirtyRef.current = false;
    setSaveState('saved');
  }, [mapId]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState('unsaved');
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      save().catch(console.error);
    }, AUTOSAVE_DELAY);
  }, [save]);

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
      const record = await getMap(mapId);
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
      setMapName(record.name);
      setGridType(record.gridType ?? 'none');
      setGridSize(record.gridSize ?? 100);
      setGridOffsetX(record.gridOffsetX ?? 0);
      setGridOffsetY(record.gridOffsetY ?? 0);
      setGridLineWidth(record.gridLineWidth ?? 1.2);
      setGridOpacity(record.gridOpacity ?? 0.7);
      setLoading(false);
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
  }, [mapId]);

  // Size the canvas to its container (and re-fit on first load)
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
  }, [loading, fitToScreen, scheduleDraw]);

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
    const settings: GridSettings = { gridType, gridSize, gridOffsetX, gridOffsetY, gridLineWidth, gridOpacity };
    const timer = window.setTimeout(() => {
      saveGridSettings(mapId, settings).catch(console.error);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [gridType, gridSize, gridOffsetX, gridOffsetY, gridLineWidth, gridOpacity, loading, mapId, scheduleDraw]);

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

  /* ---------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        spaceHeldRef.current = true;
        e.preventDefault();
      } else if (e.key === 'r' || e.key === 'R') {
        setTool('reveal');
      } else if (e.key === 'f' || e.key === 'F') {
        setTool('fog');
      } else if (e.key === '[') {
        setBrushSize((s) => Math.max(8, s - 12));
      } else if (e.key === ']') {
        setBrushSize((s) => Math.min(400, s + 12));
      } else if (e.key === 'g' || e.key === 'G') {
        setGridType((t) => (t === 'none' ? 'hex' : t === 'hex' ? 'square' : 'none'));
      } else if (e.key === '0') {
        fitToScreen();
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
  }, [fitToScreen, save, undo]);

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
    if (e.button === 0) {
      pushUndo();
      paintingRef.current = true;
      const mapPoint = screenToMap(sx, sy);
      paintSegment(mapPoint, mapPoint);
      lastPointRef.current = mapPoint;
      markDirty();
      scheduleDraw();
    }
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
    } else if (paintingRef.current && lastPointRef.current) {
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
    paintingRef.current = false;
    panningRef.current = false;
    lastPointRef.current = null;
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
    onBack();
  };

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
          <span className="editor-title" title={mapName}>{mapName || '…'}</span>
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

        <div className="toolbar-group slider-group" title="How opaque the fog looks while you prepare">
          <span className="slider-label">Fog opacity</span>
          <input
            type="range"
            min={30}
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
          <span className={`save-status save-${saveState}`}>
            {saveState === 'saved' && '● Saved locally'}
            {saveState === 'saving' && '● Saving…'}
            {saveState === 'unsaved' && '● Unsaved changes'}
          </span>
          <button className="btn btn-primary" onClick={() => save().catch(console.error)} disabled={saveState === 'saved'} title="Save fog (Ctrl+S)">
            <IconSave />
            Save
          </button>
        </div>
      </header>

      <div className="editor-canvas-wrap" ref={containerRef}>
        {loading ? (
          <div className="editor-message">Loading map…</div>
        ) : (
          <canvas
            ref={canvasRef}
            className="editor-canvas"
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
      </div>

      <footer className="editor-statusbar">
        <span><kbd>R</kbd> reveal · <kbd>F</kbd> fog · <kbd>[</kbd><kbd>]</kbd> brush size · <kbd>G</kbd> grid · <kbd>Space</kbd>+drag or right-drag to pan · scroll to zoom · <kbd>0</kbd> fit · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>S</kbd> save</span>
      </footer>
    </div>
  );
}
