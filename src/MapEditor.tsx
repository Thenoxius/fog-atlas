import { useCallback, useEffect, useRef, useState } from 'react';
import { getMap, saveFog } from './db';
import {
  IconBack, IconClearFog, IconFit, IconFog, IconFogAll, IconReveal, IconSave, IconUndo,
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

export function MapEditor({ mapId, onBack }: MapEditorProps) {
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

  const brushSizeRef = useRef(brushSize);
  brushSizeRef.current = brushSize;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const fogOpacityRef = useRef(fogOpacity);
  fogOpacityRef.current = fogOpacity;

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
    <div className="editor">
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
        <span><kbd>R</kbd> reveal · <kbd>F</kbd> fog · <kbd>[</kbd><kbd>]</kbd> brush size · <kbd>Space</kbd>+drag or right-drag to pan · scroll to zoom · <kbd>0</kbd> fit · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>S</kbd> save</span>
      </footer>
    </div>
  );
}
