'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { X, Loader2, AlertCircle, File } from './icons';
import { cn } from '@/lib/utils';
import { fetchFsFile, ApiError } from '@/lib/api';

interface FileViewerProps {
  turnId: string;
  filePath: string;
  onClose: () => void;
}

export function FileViewer({ turnId, filePath, onClose }: FileViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);

  // Fetch file content
  useEffect(() => {
    let cancelled = false;

    async function loadFile() {
      setLoading(true);
      setError(null);
      setContent(null);

      try {
        const response = await fetchFsFile(turnId, filePath);
        if (!cancelled) {
          // Decode base64 content
          const decoded = atob(response.content_base64);
          setContent(decoded);
          setFileSize(response.size);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to load file');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadFile();
    return () => { cancelled = true; };
  }, [turnId, filePath]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  // Focus container on mount for keyboard events
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const fileName = filePath.split('/').pop() || filePath;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="absolute inset-0 bg-theme-bg flex flex-col outline-none z-10"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-theme-border-dim bg-theme-bg-secondary/50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <File className="w-4 h-4 text-theme-text-muted flex-shrink-0" />
          <span className="text-sm text-theme-text-secondary font-medium truncate">{fileName}</span>
          <span className="text-xs text-theme-text-dim font-mono truncate hidden sm:block">
            {filePath}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {fileSize > 0 && (
            <span className="text-xs text-theme-text-dim">
              {formatFileSize(fileSize)}
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-tertiary rounded transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-theme-text-dim animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-theme-text-dim">
            <AlertCircle className="w-6 h-6 mb-2" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          <pre className="text-sm text-theme-text-secondary font-mono whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </pre>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-1.5 border-t border-theme-border-dim bg-theme-bg-secondary/50 text-[11px] text-theme-text-faint flex-shrink-0">
        <span><kbd className="px-1 py-0.5 bg-theme-bg-tertiary rounded">Esc</kbd> Close file</span>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default FileViewer;
