import { useCallback, useEffect, useRef, useState } from 'react';
import { getMap } from './db';
import { buildGridPath, strokeGrid, type GridConfig } from './grid';
import { openPresentChannel, type PresentMessage } from './present';
import { IconExitFullscreen, IconFullscreen, IconMap } from './icons';

// The player screen: a dedicated window the DM drags onto the TV / board.
// It shows the whole active map fit to the window, the grid, and fully
// opaque black fog — no tools. Everything is driven by the DM window over
// a BroadcastChannel; map images and saved fog are read from IndexedDB.

const NO_GRID: GridConfig = {
  gridType: 'none',
  gridSize: 100,
  gridOffsetX: 0,
  gridOffsetY: 0,
  gridLineWidth: 1.2,
  gridOpacity: 0.7,
};

export function PlayerView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const fogRef = useRef<ImageBitmap | null>(null);
  const gridRef = useRef<GridConfig>(NO_GRID);
  const currentMapIdRef = useRef<string | null>(null);
  const genRef = useRef(0);
  const rafRef = useRef(0);

  const [waiting, setWaiting] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!image) return;

    const winW = canvas.width / dpr;
    const winH = canvas.height / dpr;
    const scale = Math.min(winW / image.width, winH / image.height);
    const x = (winW - image.width * scale) / 2;
    const y = (winH - image.height * scale) / 2;

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * x, dpr * y);
    ctx.drawImage(image, 0, 0);

    // Fog is fully opaque for players — solid black over hidden areas
    const fog = fogRef.current;
    if (fog) ctx.drawImage(fog, 0, 0);

    const grid = gridRef.current;
    const path = buildGridPath(
      grid.gridType,
      grid.gridSize,
      grid.gridOffsetX,
      grid.gridOffsetY,
      image.width,
      image.height,
      0,
      0,
      image.width,
      image.height,
      scale
    );
    if (path) strokeGrid(ctx, path, scale, grid.gridLineWidth, grid.gridOpacity, image.width, image.height);
  }, []);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  // Load a map (image + saved fog) from IndexedDB when the DM switches.
  // The grid arrives inline from the DM so it is correct immediately.
  const loadMap = useCallback(
    async (mapId: string, grid: GridConfig) => {
      const gen = ++genRef.current;
      currentMapIdRef.current = mapId;
      fogRef.current?.close();
      fogRef.current = null;
      gridRef.current = grid;
      const record = await getMap(mapId);
      if (!record || gen !== genRef.current) return;
      const image = await createImageBitmap(record.image);
      if (gen !== genRef.current) {
        image.close();
        return;
      }
      imageRef.current?.close();
      imageRef.current = image;
      // Only apply saved fog if no live fog has arrived for this map yet
      if (record.fog && fogRef.current === null) {
        const savedFog = await createImageBitmap(record.fog);
        if (gen === genRef.current && fogRef.current === null) {
          fogRef.current = savedFog;
        } else {
          savedFog.close();
        }
      }
      setWaiting(false);
      scheduleDraw();
    },
    [scheduleDraw]
  );

  // BroadcastChannel wiring
  useEffect(() => {
    const channel = openPresentChannel();
    channel.onmessage = (e: MessageEvent<PresentMessage>) => {
      const msg = e.data;
      if (msg.type === 'scene') {
        loadMap(msg.mapId, msg.grid).catch(console.error);
      } else if (msg.type === 'fog') {
        if (msg.mapId !== currentMapIdRef.current) {
          msg.bitmap.close();
          return;
        }
        fogRef.current?.close();
        fogRef.current = msg.bitmap;
        scheduleDraw();
      } else if (msg.type === 'grid') {
        if (msg.mapId !== currentMapIdRef.current) return;
        gridRef.current = msg.grid;
        scheduleDraw();
      } else if (msg.type === 'stopped') {
        setWaiting(true);
        imageRef.current?.close();
        imageRef.current = null;
        fogRef.current?.close();
        fogRef.current = null;
        currentMapIdRef.current = null;
        scheduleDraw();
      }
    };
    // Announce readiness so the DM pushes the current state
    channel.postMessage({ type: 'hello' } satisfies PresentMessage);
    return () => channel.close();
  }, [loadMap, scheduleDraw]);

  // Size the canvas to the window
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      scheduleDraw();
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, [scheduleDraw]);

  // Fullscreen + auto-hiding controls
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    let timer = 0;
    const show = () => {
      setControlsVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setControlsVisible(false), 2500);
    };
    window.addEventListener('mousemove', show);
    show();
    return () => {
      window.removeEventListener('mousemove', show);
      window.clearTimeout(timer);
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    } else {
      document.documentElement.requestFullscreen().catch(console.error);
    }
  };

  return (
    <div className="player-view">
      <canvas ref={canvasRef} className="player-canvas" />
      {waiting && (
        <div className="player-waiting">
          <span className="brand-icon welcome-icon"><IconMap size={26} /></span>
          <h2>Player screen ready</h2>
          <p>Waiting for the DM to open a map…</p>
          <p className="player-hint">Drag this window onto your TV or board and go fullscreen.</p>
        </div>
      )}
      <button
        className={`player-fs-btn ${controlsVisible ? '' : 'hidden'}`}
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
      </button>
    </div>
  );
}
