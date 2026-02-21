'use client';

import { useEffect, useState, useCallback } from 'react';
import { Folder, File, Link2, ChevronRight, ChevronDown, Loader2, AlertCircle } from './icons';
import { cn } from '@/lib/utils';
import { fetchFsDirectory, ApiError } from '@/lib/api';
import type { FsEntry } from '@/types/filesystem';

interface FileBrowserProps {
  turnId: string;
  onFileSelect: (path: string) => void;
  className?: string;
}

interface TreeNodeProps {
  entry: FsEntry;
  path: string;
  turnId: string;
  depth: number;
  expandedPaths: Set<string>;
  entriesCache: Map<string, FsEntry[]>;
  loadingPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileSelect: (path: string) => void;
}

function TreeNode({
  entry,
  path,
  turnId,
  depth,
  expandedPaths,
  entriesCache,
  loadingPaths,
  onToggle,
  onFileSelect,
}: TreeNodeProps) {
  const fullPath = path ? `${path}/${entry.name}` : entry.name;
  const isExpanded = expandedPaths.has(fullPath);
  const isLoading = loadingPaths.has(fullPath);
  const children = entriesCache.get(fullPath);

  const handleClick = () => {
    if (entry.kind === 'dir') {
      onToggle(fullPath);
    } else {
      onFileSelect(fullPath);
    }
  };

  const Icon = entry.kind === 'dir' ? Folder : entry.kind === 'symlink' ? Link2 : File;
  const iconColor = entry.kind === 'dir' ? 'text-amber-400' : entry.kind === 'symlink' ? 'text-cyan-400' : 'text-theme-text-muted';

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'w-full text-left px-2 py-1 flex items-center gap-1.5 hover:bg-theme-bg-tertiary/50 transition-colors text-xs',
          entry.kind !== 'dir' && 'hover:text-theme-text'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {entry.kind === 'dir' && (
          isLoading ? (
            <Loader2 className="w-3 h-3 text-theme-text-dim animate-spin flex-shrink-0" />
          ) : isExpanded ? (
            <ChevronDown className="w-3 h-3 text-theme-text-dim flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-theme-text-dim flex-shrink-0" />
          )
        )}
        {entry.kind !== 'dir' && <span className="w-3 flex-shrink-0" />}
        <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', iconColor)} />
        <span className="truncate text-theme-text-secondary">{entry.name}</span>
      </button>

      {isExpanded && children && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.name}
              entry={child}
              path={fullPath}
              turnId={turnId}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              entriesCache={entriesCache}
              loadingPaths={loadingPaths}
              onToggle={onToggle}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileBrowser({ turnId, onFileSelect, className }: FileBrowserProps) {
  const [rootEntries, setRootEntries] = useState<FsEntry[] | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [entriesCache, setEntriesCache] = useState<Map<string, FsEntry[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch root directory
  useEffect(() => {
    let cancelled = false;

    async function loadRoot() {
      setLoading(true);
      setError(null);
      setRootEntries(null);
      setExpandedPaths(new Set());
      setEntriesCache(new Map());

      try {
        const response = await fetchFsDirectory(turnId, '');
        if (!cancelled) {
          // Sort entries: directories first, then files, alphabetically within each group
          const sorted = sortEntries(response.entries);
          setRootEntries(sorted);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to load filesystem');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRoot();
    return () => { cancelled = true; };
  }, [turnId]);

  const handleToggle = useCallback(async (path: string) => {
    if (expandedPaths.has(path)) {
      // Collapse
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      return;
    }

    // Already have entries cached?
    if (entriesCache.has(path)) {
      setExpandedPaths((prev) => new Set(prev).add(path));
      return;
    }

    // Need to fetch
    setLoadingPaths((prev) => new Set(prev).add(path));

    try {
      const response = await fetchFsDirectory(turnId, path);
      const sorted = sortEntries(response.entries);
      setEntriesCache((prev) => new Map(prev).set(path, sorted));
      setExpandedPaths((prev) => new Set(prev).add(path));
    } catch (err) {
      // Could show error, but for now just don't expand
      console.error('Failed to load directory:', path, err);
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [turnId, expandedPaths, entriesCache]);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <Loader2 className="w-5 h-5 text-theme-text-dim animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-4 text-theme-text-dim', className)}>
        <AlertCircle className="w-5 h-5 mb-2" />
        <span className="text-xs">{error}</span>
      </div>
    );
  }

  if (!rootEntries || rootEntries.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-4 text-theme-text-dim text-xs', className)}>
        Empty filesystem
      </div>
    );
  }

  return (
    <div className={cn('overflow-y-auto', className)}>
      {rootEntries.map((entry) => (
        <TreeNode
          key={entry.name}
          entry={entry}
          path=""
          turnId={turnId}
          depth={0}
          expandedPaths={expandedPaths}
          entriesCache={entriesCache}
          loadingPaths={loadingPaths}
          onToggle={handleToggle}
          onFileSelect={onFileSelect}
        />
      ))}
    </div>
  );
}

// Sort entries: directories first, then alphabetically
function sortEntries(entries: FsEntry[]): FsEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind === 'dir' && b.kind !== 'dir') return -1;
    if (a.kind !== 'dir' && b.kind === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });
}

export default FileBrowser;
