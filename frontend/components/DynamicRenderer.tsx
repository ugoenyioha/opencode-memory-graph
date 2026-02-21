'use client';

import { useMemo, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { useRenderer } from '@/lib/use-renderer';
import { getRendererSpec, type RendererManifest, type TurnRendererProps } from '@/lib/renderer-registry';
import { FallbackRenderer } from './FallbackRenderer';
import { Loader2, AlertCircle } from './icons';

// ============================================================================
// Loading Spinner
// ============================================================================

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-4', className)}>
      <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
    </div>
  );
}

// ============================================================================
// Error Display
// ============================================================================

function RendererError({
  message,
  typeId,
  className,
}: {
  message: string;
  typeId: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2 text-amber-400 text-xs">
        <AlertCircle className="w-4 h-4" />
        <span>Renderer failed to load for {typeId}</span>
      </div>
      <div className="text-xs text-slate-500 bg-slate-800/50 rounded p-2 font-mono">
        {message}
      </div>
    </div>
  );
}

// ============================================================================
// Dynamic Renderer Component
// ============================================================================

interface DynamicRendererProps {
  /** The decoded payload data */
  data: unknown;
  /** Type ID from the registry */
  typeId: string;
  /** Type version number */
  typeVersion: number;
  /** Renderer manifest from the backend */
  manifest: RendererManifest | null;
  /** Optional CSS class name */
  className?: string;
  /** Show loading spinner (default: true) */
  showLoading?: boolean;
  /** Show error message on failure (default: true) */
  showError?: boolean;
}

/**
 * Dynamically renders turn data using a renderer from the registry.
 *
 * The component:
 * 1. Looks up the renderer spec for the typeId in the manifest
 * 2. Loads the renderer component (builtin or external ESM)
 * 3. Shows loading state during load
 * 4. Falls back to FallbackRenderer on error or if no renderer exists
 */
export function DynamicRenderer({
  data,
  typeId,
  typeVersion,
  manifest,
  className,
  showLoading = true,
  showError = true,
}: DynamicRendererProps) {
  // Look up the renderer spec for this type
  const spec = useMemo(
    () => getRendererSpec(manifest, typeId),
    [manifest, typeId]
  );

  // Load the renderer component
  const { Renderer, loading, error } = useRenderer(spec);

  // Build props for the renderer
  const rendererProps: TurnRendererProps = useMemo(
    () => ({
      data,
      typeId,
      typeVersion,
      className,
    }),
    [data, typeId, typeVersion, className]
  );

  // Show loading state
  if (loading && showLoading) {
    return <LoadingSpinner className={className} />;
  }

  // Show error state (but also show fallback below it)
  if (error && showError) {
    return (
      <div className={cn('space-y-3', className)}>
        <RendererError message={error} typeId={typeId} />
        <FallbackRenderer data={data} />
      </div>
    );
  }

  // Use the loaded renderer if available
  if (Renderer) {
    return (
      <Suspense fallback={<LoadingSpinner className={className} />}>
        <Renderer {...rendererProps} />
      </Suspense>
    );
  }

  // No renderer found - use fallback
  return <FallbackRenderer data={data} className={className} />;
}

// ============================================================================
// Simple Wrapper for Non-Manifest Use
// ============================================================================

interface SimpleRendererProps extends Omit<DynamicRendererProps, 'manifest'> {
  /** Use builtin renderer by name (e.g., "FallbackRenderer") */
  builtinName?: string;
}

/**
 * Simplified renderer that uses a specific builtin renderer.
 * Useful when you know which renderer to use without consulting the manifest.
 */
export function BuiltinRenderer({
  builtinName = 'FallbackRenderer',
  data,
  typeId,
  typeVersion,
  className,
  showLoading = true,
  showError = true,
}: SimpleRendererProps) {
  const spec = useMemo(
    () => ({
      esm_url: `builtin:${builtinName}`,
    }),
    [builtinName]
  );

  const { Renderer, loading, error } = useRenderer(spec);

  const rendererProps: TurnRendererProps = useMemo(
    () => ({
      data,
      typeId,
      typeVersion,
      className,
    }),
    [data, typeId, typeVersion, className]
  );

  if (loading && showLoading) {
    return <LoadingSpinner className={className} />;
  }

  if (error && showError) {
    return (
      <div className={cn('space-y-3', className)}>
        <RendererError message={error} typeId={typeId} />
        <FallbackRenderer data={data} />
      </div>
    );
  }

  if (Renderer) {
    return <Renderer {...rendererProps} />;
  }

  return <FallbackRenderer data={data} className={className} />;
}

export default DynamicRenderer;
