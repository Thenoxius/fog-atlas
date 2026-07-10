import { useCallback, useEffect, useRef, useState } from 'react';
import { getCharacter, getMap, type MapLabel, type MapToken } from './db';
import { buildGridPath, strokeGrid, type GridConfig } from './grid';
import { drawLabels } from './labels';
import { drawTokens } from './tokens';
import { ensureMapFontsLoaded } from './fonts';
import { openPresentChannel, type PresentMessage, type PublicInitiativeState } from './present';
import { IconExitFullscreen, IconFit, IconFlipVertical, IconFullscreen, IconLayers, IconMap } from './icons';

// The player screen: a dedicated window the DM drags onto the TV / board.
// It shows the active map with fully opaque black fog and the grid — no
// tools. Everything is driven by the DM window over a BroadcastChannel;
// map images and saved fog are read from IndexedDB.
//
// The DM can slide the mouse onto this window (extended display) to pan and
// zoom the board and point at things with the highlight ring.

const NO_GRID: GridConfig = {
  gridType: 'none',
  gridSize: 100,
  gridOffsetX: 0,
  gridOffsetY: 0,
  gridLineWidth: 1.2,
  gridOpacity: 0.7,
};

const MIN_SCALE = 0.05;
const MAX_SCALE = 12;
const HIGHLIGHT_RADIUS = 22;

// Persisted per-device, not synced from the DM: a table-mounted TV keeps its
// own physical orientation regardless of who's presenting, so these survive
// reloads instead of resetting every time the DM opens the player screen.
const STORAGE_SHOW_BOTTOM = 'fog-atlas-initiative-bottom';
const STORAGE_FLIP_TOP = 'fog-atlas-initiative-flip-top';
const STORAGE_FLIP_BOTTOM = 'fog-atlas-initiative-flip-bottom';

function loadBoolPref(key: string): boolean {
  return localStorage.getItem(key) === 'true';
}

interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

export function PlayerView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const fogRef = useRef<ImageBitmap | null>(null);
  const gridRef = useRef<GridConfig>(NO_GRID);
  const labelsRef = useRef<MapLabel[]>([]);
  const tokensRef = useRef<MapToken[]>([]);
  const currentMapIdRef = useRef<string | null>(null);
  const genRef = useRef(0);
  const rafRef = useRef(0);

  const viewRef = useRef<ViewTransform>({ scale: 1, x: 0, y: 0 });
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const panningRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Until the DM pans/zooms, keep the map fit to the window (so going
  // fullscreen re-frames). Once they navigate, resizes preserve their view.
  const userMovedRef = useRef(false);

  const [waiting, setWaiting] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [initiative, setInitiative] = useState<PublicInitiativeState | null>(null);

  // Portrait chips: only the characterId arrives over the channel — the Blob
  // is read here from the shared IndexedDB 'characters' store and cached as an
  // object URL (revoked on unmount). attemptedIds avoids re-fetching a
  // character we've already looked up (whether or not it had a portrait).
  const portraitUrls = useRef<Map<string, string>>(new Map());
  const attemptedIds = useRef<Set<string>>(new Set());
  const [, bumpPortraits] = useState(0);

  // Table-TV layout: mirror the turn order at the bottom of the screen too,
  // and flip either copy upside down, so players on both sides of a
  // flat-mounted TV can each read it right-side up from where they sit.
  const [showBottomInitiative, setShowBottomInitiative] = useState(() => loadBoolPref(STORAGE_SHOW_BOTTOM));
  const [flipTopInitiative, setFlipTopInitiative] = useState(() => loadBoolPref(STORAGE_FLIP_TOP));
  const [flipBottomInitiative, setFlipBottomInitiative] = useState(() => loadBoolPref(STORAGE_FLIP_BOTTOM));

  const toggleShowBottomInitiative = () => {
    setShowBottomInitiative((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_SHOW_BOTTOM, String(next));
      return next;
    });
  };
  const toggleFlipTopInitiative = () => {
    setFlipTopInitiative((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_FLIP_TOP, String(next));
      return next;
    });
  };
  const toggleFlipBottomInitiative = () => {
    setFlipBottomInitiative((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_FLIP_BOTTOM, String(next));
      return next;
    });
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!image) return;

    const { scale, x, y } = viewRef.current;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * x, dpr * y);
    ctx.drawImage(image, 0, 0);

    // Tokens, labels, and the grid all sit under the fog, so they only
    // become visible where the party has actually explored — a grid glowing
    // across still-hidden areas would give away the shape of the unknown.
    if (tokensRef.current.length) drawTokens(ctx, tokensRef.current);
    if (labelsRef.current.length) drawLabels(ctx, labelsRef.current);

    const grid = gridRef.current;
    const path = buildGridPath(
      grid.gridType,
      grid.gridSize,
      grid.gridOffsetX,
      grid.gridOffsetY,
      image.width,
      image.height,
      -x / scale,
      -y / scale,
      (canvas.width / dpr - x) / scale,
      (canvas.height / dpr - y) / scale,
      scale
    );
    if (path) strokeGrid(ctx, path, scale, grid.gridLineWidth, grid.gridOpacity, image.width, image.height);

    // Fog is fully opaque for players — solid black over hidden areas
    const fog = fogRef.current;
    if (fog) ctx.drawImage(fog, 0, 0);

    // Highlight ring — the DM's pointer, for calling attention to the board
    const cursor = cursorRef.current;
    if (cursor) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, HIGHLIGHT_RADIUS + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 214, 112, 0.12)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, HIGHLIGHT_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 214, 112, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(255, 200, 80, 0.9)';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 214, 112, 0.95)';
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

  const fitToWindow = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const dpr = window.devicePixelRatio || 1;
    const winW = canvas.width / dpr;
    const winH = canvas.height / dpr;
    const scale = Math.min(winW / image.width, winH / image.height);
    viewRef.current = {
      scale,
      x: (winW - image.width * scale) / 2,
      y: (winH - image.height * scale) / 2,
    };
    userMovedRef.current = false;
    scheduleDraw();
  }, [scheduleDraw]);

  // Load a map (image + saved fog) from IndexedDB when the DM switches.
  // The grid arrives inline from the DM so it is correct immediately.
  const loadMap = useCallback(
    async (mapId: string, grid: GridConfig, labels: MapLabel[], tokens: MapToken[]) => {
      const gen = ++genRef.current;
      currentMapIdRef.current = mapId;
      fogRef.current?.close();
      fogRef.current = null;
      gridRef.current = grid;
      labelsRef.current = labels;
      tokensRef.current = tokens;
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
      fitToWindow();
    },
    [fitToWindow]
  );

  // BroadcastChannel wiring
  useEffect(() => {
    const channel = openPresentChannel();
    channel.onmessage = (e: MessageEvent<PresentMessage>) => {
      const msg = e.data;
      if (msg.type === 'scene') {
        loadMap(msg.mapId, msg.grid, msg.labels, msg.tokens).catch(console.error);
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
      } else if (msg.type === 'labels') {
        if (msg.mapId !== currentMapIdRef.current) return;
        labelsRef.current = msg.labels;
        scheduleDraw();
      } else if (msg.type === 'tokens') {
        if (msg.mapId !== currentMapIdRef.current) return;
        tokensRef.current = msg.tokens;
        scheduleDraw();
      } else if (msg.type === 'initiative') {
        setInitiative(msg.state);
      } else if (msg.type === 'stopped') {
        setWaiting(true);
        imageRef.current?.close();
        imageRef.current = null;
        fogRef.current?.close();
        fogRef.current = null;
        labelsRef.current = [];
        tokensRef.current = [];
        currentMapIdRef.current = null;
        setInitiative(null);
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
      if (userMovedRef.current) scheduleDraw();
      else fitToWindow();
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, [fitToWindow, scheduleDraw]);

  // Redraw once the label fonts have loaded
  useEffect(() => {
    ensureMapFontsLoaded().then(() => scheduleDraw());
  }, [scheduleDraw]);

  // Revoke cached portrait object URLs on unmount.
  useEffect(() => {
    const urls = portraitUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  // When the turn order changes, lazily fetch portraits for any linked
  // characters we haven't tried yet, then re-render so the chips pick them up.
  useEffect(() => {
    if (!initiative) return;
    const missing = initiative.order
      .map((c) => c.characterId)
      .filter((id): id is string => !!id && !attemptedIds.current.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      let changed = false;
      for (const id of missing) {
        attemptedIds.current.add(id);
        const character = await getCharacter(id).catch(() => undefined);
        if (cancelled) return;
        if (character?.portrait) {
          portraitUrls.current.set(id, URL.createObjectURL(character.portrait));
          changed = true;
        }
      }
      if (changed && !cancelled) bumpPortraits((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [initiative]);

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

  /* -------------------------------------------------- pan / zoom / point */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // best-effort
    }
    const rect = canvas.getBoundingClientRect();
    panningRef.current = true;
    lastPointRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
      userMovedRef.current = true;
    }
    scheduleDraw();
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // best-effort
    }
    panningRef.current = false;
    lastPointRef.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const view = viewRef.current;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    const ratio = newScale / view.scale;
    view.x = sx - (sx - view.x) * ratio;
    view.y = sy - (sy - view.y) * ratio;
    view.scale = newScale;
    userMovedRef.current = true;
    scheduleDraw();
  };

  return (
    <div className="player-view">
      <canvas
        ref={canvasRef}
        className="player-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerLeave={(e) => {
          cursorRef.current = null;
          endPointer(e);
          scheduleDraw();
        }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      {initiative && initiative.order.length > 0 && (() => {
        const chips = initiative.order.map((c) => {
          const portrait = c.characterId ? portraitUrls.current.get(c.characterId) : undefined;
          return (
            <span
              key={c.id}
              className={`player-initiative-chip ${c.id === initiative.currentTurnId ? 'player-initiative-chip-active' : ''} ${c.isEnemy ? 'player-initiative-chip-enemy' : ''} ${c.down ? 'player-initiative-chip-down' : ''}`}
            >
              <span className="player-initiative-chip-portrait">
                {portrait ? (
                  <img src={portrait} alt="" />
                ) : (
                  <span className="player-initiative-chip-initial">{(c.name.trim().charAt(0) || '?').toUpperCase()}</span>
                )}
              </span>
              <span className="player-initiative-chip-name">{c.name}</span>
            </span>
          );
        });
        return (
          <>
            <div className={`player-initiative-bar ${flipTopInitiative ? 'player-initiative-bar-flipped' : ''}`}>
              {initiative.round > 0 && <span className="player-initiative-round">Round {initiative.round}</span>}
              <div className="player-initiative-order">{chips}</div>
            </div>
            {showBottomInitiative && (
              <div
                className={`player-initiative-bar player-initiative-bar-bottom ${flipBottomInitiative ? 'player-initiative-bar-flipped' : ''}`}
              >
                {initiative.round > 0 && <span className="player-initiative-round">Round {initiative.round}</span>}
                <div className="player-initiative-order">{chips}</div>
              </div>
            )}
          </>
        );
      })()}
      {waiting && (
        <div className="player-waiting">
          <span className="brand-icon welcome-icon"><IconMap size={26} /></span>
          <h2>Player screen ready</h2>
          <p>Waiting for the DM to open a map…</p>
          <p className="player-hint">Drag this window onto your TV or board and go fullscreen.</p>
        </div>
      )}
      <div className={`player-controls ${controlsVisible ? '' : 'hidden'}`}>
        <button className="player-fs-btn" onClick={fitToWindow} title="Fit map to screen">
          <IconFit />
        </button>
        <button className="player-fs-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
        </button>
        {initiative && initiative.order.length > 0 && (
          <>
            <button
              className={`player-fs-btn ${showBottomInitiative ? 'player-fs-btn-active' : ''}`}
              onClick={toggleShowBottomInitiative}
              title={
                showBottomInitiative
                  ? 'Hide the duplicate initiative bar at the bottom'
                  : 'Also show initiative at the bottom — for a table-mounted TV with players on both sides'
              }
            >
              <IconLayers />
            </button>
            <button
              className={`player-fs-btn ${flipTopInitiative ? 'player-fs-btn-active' : ''}`}
              onClick={toggleFlipTopInitiative}
              title="Flip the top initiative bar upside down, to read correctly from the far side of the table"
            >
              <IconFlipVertical />
            </button>
            {showBottomInitiative && (
              <button
                className={`player-fs-btn ${flipBottomInitiative ? 'player-fs-btn-active' : ''}`}
                onClick={toggleFlipBottomInitiative}
                title="Flip the bottom initiative bar upside down, to read correctly from the near side of the table"
              >
                <IconFlipVertical />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
