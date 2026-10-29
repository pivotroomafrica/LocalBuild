"use client";

import { useEffect, useRef, useState } from "react";
import { canvasToPhotoFile } from "@/lib/expert/shrinkPhoto";

/** Photos show at 4:5 on cards and the profile page. */
const FRAME_W = 320;
const FRAME_H = 400;
const OUT_W = 640;
const OUT_H = 800;
const MAX_ZOOM = 4;
/** Working copy size: big enough to stay sharp at full zoom, small enough to stay quick. */
const WORK_MAX_SIDE = 2400;

type Source = { canvas: HTMLCanvasElement; url: string };
type View = { zoom: number; x: number; y: number };

function toBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("encode"))), "image/jpeg", 0.92),
  );
}

async function loadSource(file: File): Promise<Source> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, WORK_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { canvas, url: await toBlobUrl(canvas) };
}

async function rotateSource(source: Source): Promise<Source> {
  const canvas = document.createElement("canvas");
  canvas.width = source.canvas.height;
  canvas.height = source.canvas.width;
  const context = canvas.getContext("2d");
  if (context) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(source.canvas, 0, 0);
  }
  return { canvas, url: await toBlobUrl(canvas) };
}

/** Scale at zoom 1: the photo just covers the frame. */
function baseScale(source: Source) {
  return Math.max(FRAME_W / source.canvas.width, FRAME_H / source.canvas.height);
}

/** Keeps the photo covering the whole frame (no empty edges). */
function clamp(source: Source, view: View): View {
  const scale = baseScale(source) * view.zoom;
  const w = source.canvas.width * scale;
  const h = source.canvas.height * scale;
  return {
    zoom: view.zoom,
    x: Math.min(0, Math.max(FRAME_W - w, view.x)),
    y: Math.min(0, Math.max(FRAME_H - h, view.y)),
  };
}

function centred(source: Source): View {
  const scale = baseScale(source);
  return {
    zoom: 1,
    x: (FRAME_W - source.canvas.width * scale) / 2,
    // Slightly above centre, where faces usually are.
    y: Math.min(0, (FRAME_H - source.canvas.height * scale) * 0.3),
  };
}

/** Zoom keeping the middle of the frame fixed. */
function zoomTo(source: Source, view: View, zoom: number): View {
  const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const before = baseScale(source) * view.zoom;
  const after = baseScale(source) * next;
  const cx = (FRAME_W / 2 - view.x) / before;
  const cy = (FRAME_H / 2 - view.y) / before;
  return clamp(source, { zoom: next, x: FRAME_W / 2 - cx * after, y: FRAME_H / 2 - cy * after });
}

/**
 * Lets an expert drag, zoom and rotate their photo inside the 4:5 frame
 * clients will see, then hands back the cropped file (WebP, 640x800).
 */
export function PhotoCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (cropped: File) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ id: number; startX: number; startY: number; view: View } | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    let cancelled = false;
    loadSource(file)
      .then((loaded) => {
        if (cancelled) return URL.revokeObjectURL(loaded.url);
        setSource(loaded);
        setView(centred(loaded));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => () => {
    if (source) URL.revokeObjectURL(source.url);
  }, [source]);

  const scale = source ? baseScale(source) * view.zoom : 1;

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!source) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, view };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!source || !current || current.id !== event.pointerId) return;
    // The frame may be drawn smaller than FRAME_W on a narrow phone.
    const ratio = FRAME_W / event.currentTarget.getBoundingClientRect().width;
    setView(
      clamp(source, {
        zoom: current.view.zoom,
        x: current.view.x + (event.clientX - current.startX) * ratio,
        y: current.view.y + (event.clientY - current.startY) * ratio,
      }),
    );
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === event.pointerId) drag.current = null;
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!source) return;
    setView((current) => zoomTo(source, current, current.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!source) return;
    const step = 12;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      setView((current) => clamp(source, { ...current, x: current.x + dx, y: current.y + dy }));
    } else if (event.key === "+" || event.key === "=") {
      setView((current) => zoomTo(source, current, current.zoom + 0.1));
    } else if (event.key === "-") {
      setView((current) => zoomTo(source, current, current.zoom - 0.1));
    }
  }

  async function rotate() {
    if (!source) return;
    const rotated = await rotateSource(source);
    setSource(rotated);
    setView(centred(rotated));
  }

  async function save() {
    if (!source) return;
    setSaving(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const context = canvas.getContext("2d");
    if (context) {
      context.imageSmoothingQuality = "high";
      context.drawImage(source.canvas, -view.x / scale, -view.y / scale, FRAME_W / scale, FRAME_H / scale, 0, 0, OUT_W, OUT_H);
    }
    const cropped = await canvasToPhotoFile(canvas, file.name.replace(/\.[^.]+$/, ""));
    setSaving(false);
    if (cropped) onDone(cropped);
    else setFailed(true);
  }

  return (
    <dialog
      ref={dialogRef}
      className="crop-dialog"
      aria-labelledby="crop-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="crop-body">
        <h2 id="crop-title" className="crop-title">
          Adjust your photo
        </h2>
        <p className="crop-hint">Drag to move, zoom to frame your face. This is exactly how clients will see it.</p>

        {failed ? (
          <p className="notice err" role="alert">
            We couldn&apos;t open this photo. Try a JPG or PNG.
          </p>
        ) : (
          <div
            className="crop-frame"
            role="application"
            aria-label="Photo position. Use arrow keys to move and plus or minus to zoom."
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
          >
            {source ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img
                src={source.url}
                alt=""
                draggable={false}
                style={{
                  width: `${((source.canvas.width * scale) / FRAME_W) * 100}%`,
                  left: `${(view.x / FRAME_W) * 100}%`,
                  top: `${(view.y / FRAME_H) * 100}%`,
                }}
              />
            ) : (
              <span className="crop-loading">Loading…</span>
            )}
            <span className="crop-grid" aria-hidden="true" />
          </div>
        )}

        <div className="crop-tools">
          <span className="ms" aria-hidden="true">
            zoom_out
          </span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            aria-label="Zoom"
            disabled={!source}
            onChange={(event) => source && setView(zoomTo(source, view, Number(event.target.value)))}
          />
          <span className="ms" aria-hidden="true">
            zoom_in
          </span>
          <button type="button" className="btn btn-line md crop-rotate" onClick={rotate} disabled={!source}>
            <span className="ms" aria-hidden="true">
              rotate_right
            </span>
            Rotate
          </button>
        </div>

        <div className="crop-actions">
          <button type="button" className="btn btn-line md" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-ink md" onClick={save} disabled={!source || saving}>
            {saving ? "Saving…" : "Use this photo"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
