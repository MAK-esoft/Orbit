'use client';

import { Download, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const MIN = 1;
const MAX = 5;
const STEP = 0.5;

/**
 * Inline image preview that opens a full-screen lightbox with zoom (buttons +
 * scroll-wheel), pan-by-drag, reset, and a download action.
 */
export function ImageViewer({
  url,
  fileName,
}: {
  url: string;
  fileName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(MAX, z + STEP));
      if (e.key === '-') setZoom((z) => Math.max(MIN, z - STEP));
    }
    if (open) {
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [open]);

  function reset() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function download() {
    try {
      const res = await fetch(url, { credentials: 'include' });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName || 'attachment';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  }

  return (
    <>
      {/* Inline preview */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full overflow-hidden rounded-md border border-border"
        title="Click to view"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Request attachment"
          className="max-h-[420px] w-full object-contain bg-bg"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-md bg-black/70 px-3 py-1.5 text-meta text-white">
            <Maximize2 className="h-4 w-4" /> Click to zoom
          </span>
        </span>
      </button>

      {/* Lightbox */}
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/90">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <span className="truncate text-meta text-white/80">{fileName}</span>
            <div className="flex items-center gap-1.5">
              <ToolbarBtn onClick={() => setZoom((z) => Math.max(MIN, z - STEP))} title="Zoom out">
                <Minus className="h-4 w-4" />
              </ToolbarBtn>
              <span className="w-12 text-center text-meta text-white/80">
                {Math.round(zoom * 100)}%
              </span>
              <ToolbarBtn onClick={() => setZoom((z) => Math.min(MAX, z + STEP))} title="Zoom in">
                <Plus className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn onClick={reset} title="Reset">
                <RotateCcw className="h-4 w-4" />
              </ToolbarBtn>
              <Button size="sm" variant="secondary" onClick={download}>
                <Download className="h-4 w-4" /> Save
              </Button>
              <ToolbarBtn onClick={close} title="Close">
                <X className="h-4 w-4" />
              </ToolbarBtn>
            </div>
          </div>

          {/* Canvas */}
          <div
            className="flex flex-1 cursor-grab items-center justify-center overflow-hidden active:cursor-grabbing"
            onWheel={(e) => {
              setZoom((z) =>
                Math.min(MAX, Math.max(MIN, z + (e.deltaY < 0 ? STEP : -STEP))),
              );
            }}
            onMouseDown={(e) => setDrag({ x: e.clientX - offset.x, y: e.clientY - offset.y })}
            onMouseMove={(e) => {
              if (drag) setOffset({ x: e.clientX - drag.x, y: e.clientY - drag.y });
            }}
            onMouseUp={() => setDrag(null)}
            onMouseLeave={() => setDrag(null)}
            onClick={(e) => e.target === e.currentTarget && close()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Request attachment"
              draggable={false}
              className="max-h-full max-w-full select-none transition-transform"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function ToolbarBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}
