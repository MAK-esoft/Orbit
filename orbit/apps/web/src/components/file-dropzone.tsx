'use client';

import { FileText, UploadCloud, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024;

/** Click-to-browse + drag-and-drop upload, one file, 10MB, JPG/PNG/WEBP/PDF. */
export function FileDropzone({
  value,
  onChange,
}: {
  value: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(file: File) {
    setError(null);
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Unsupported type. Use JPG, PNG, WEBP or PDF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('File exceeds the 10MB limit.');
      return;
    }
    onChange(file);
  }

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2 truncate">
          <FileText className="h-5 w-5 shrink-0 text-primary" />
          <span className="truncate text-body">{value.name}</span>
          <span className="shrink-0 text-meta text-text-secondary">
            {(value.size / 1024 / 1024).toFixed(1)} MB
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded p-1 text-text-secondary hover:bg-bg"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) accept(f);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors',
          dragging ? 'border-primary bg-primary-light' : 'border-border hover:border-primary',
        )}
      >
        <UploadCloud className="h-7 w-7 text-text-secondary" />
        <p className="text-body text-text-primary">
          <span className="text-primary">Click to upload</span> or drag and drop
        </p>
        <p className="text-meta text-text-secondary">JPG, PNG, WEBP or PDF — max 10MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) accept(f);
        }}
      />
      {error && <p className="mt-1 text-meta text-status-rejected">{error}</p>}
    </div>
  );
}
