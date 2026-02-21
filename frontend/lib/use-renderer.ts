/**
 * React hooks for the runtime renderer registry.
 */

import { useState, useEffect, useCallback, useMemo, type ComponentType } from 'react';
import { fetchRendererManifest } from './api';
import {
  loadRenderer,
  getRendererSpec,
  type RendererManifest,
  type RendererSpec,
  type TurnRendererProps,
} from './renderer-registry';

// ============================================================================
// Manifest Hook
// ============================================================================

interface UseRendererManifestResult {
  /** The loaded manifest, or null if loading/error */
  manifest: RendererManifest | null;
  /** True while loading */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch the manifest */
  refetch: () => void;
}

/**
 * Global manifest cache to avoid refetching on every component mount.
 */
let cachedManifest: RendererManifest | null = null;
let manifestFetchPromise: Promise<RendererManifest> | null = null;
let manifestFetchError: string | null = null;

/**
 * Hook to fetch and cache the renderer manifest.
 * The manifest is fetched once and cached globally.
 */
export function useRendererManifest(): UseRendererManifestResult {
  const [manifest, setManifest] = useState<RendererManifest | null>(cachedManifest);
  const [loading, setLoading] = useState(!cachedManifest && !manifestFetchError);
  const [error, setError] = useState<string | null>(manifestFetchError);

  const fetchManifest = useCallback(async () => {
    // If we already have a cached manifest, use it
    if (cachedManifest) {
      setManifest(cachedManifest);
      setLoading(false);
      setError(null);
      return;
    }

    // If a fetch is in progress, wait for it
    if (manifestFetchPromise) {
      try {
        const result = await manifestFetchPromise;
        setManifest(result);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch renderer manifest');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Start a new fetch
    setLoading(true);
    setError(null);

    manifestFetchPromise = fetchRendererManifest();

    try {
      const result = await manifestFetchPromise;
      cachedManifest = result;
      manifestFetchError = null;
      setManifest(result);
      setError(null);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch renderer manifest';
      manifestFetchError = errorMessage;
      setError(errorMessage);
      // Return empty manifest on error so fallback renderers work
      setManifest({ renderers: {} });
    } finally {
      setLoading(false);
      manifestFetchPromise = null;
    }
  }, []);

  const refetch = useCallback(() => {
    // Clear cache and refetch
    cachedManifest = null;
    manifestFetchPromise = null;
    manifestFetchError = null;
    fetchManifest();
  }, [fetchManifest]);

  useEffect(() => {
    fetchManifest();
  }, [fetchManifest]);

  return { manifest, loading, error, refetch };
}

// ============================================================================
// Renderer Loading Hook
// ============================================================================

interface UseRendererResult {
  /** The loaded renderer component, or null if loading/error */
  Renderer: ComponentType<TurnRendererProps> | null;
  /** True while loading */
  loading: boolean;
  /** Error message if load failed */
  error: string | null;
}

/**
 * Hook to load a renderer from a RendererSpec.
 *
 * @param spec - The renderer specification, or null to skip loading
 * @returns The loaded renderer component and loading state
 */
export function useRenderer(spec: RendererSpec | null): UseRendererResult {
  const [Renderer, setRenderer] = useState<ComponentType<TurnRendererProps> | null>(null);
  const [loading, setLoading] = useState(spec !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spec) {
      setRenderer(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadRenderer(spec)
      .then((component) => {
        if (!cancelled) {
          setRenderer(() => component);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load renderer');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // We intentionally only depend on the specific fields, not the whole spec object,
    // to avoid unnecessary re-renders when the object identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.esm_url, spec?.component]);

  return { Renderer, loading, error };
}

// ============================================================================
// Combined Hook
// ============================================================================

interface UseRendererForTypeResult extends UseRendererResult {
  /** The renderer spec for the type, if found */
  spec: RendererSpec | null;
  /** Whether the manifest is still loading */
  manifestLoading: boolean;
}

/**
 * Hook to get a renderer for a specific type ID.
 * Combines manifest fetching and renderer loading.
 *
 * @param typeId - The type ID to get a renderer for
 * @returns The renderer component and loading states
 */
export function useRendererForType(typeId: string): UseRendererForTypeResult {
  const { manifest, loading: manifestLoading, error: manifestError } = useRendererManifest();

  const spec = useMemo(() => getRendererSpec(manifest, typeId), [manifest, typeId]);

  const { Renderer, loading: rendererLoading, error: rendererError } = useRenderer(spec);

  return {
    Renderer,
    spec,
    loading: manifestLoading || rendererLoading,
    error: manifestError || rendererError,
    manifestLoading,
  };
}

/**
 * Clear the cached manifest. Useful for testing.
 */
export function clearManifestCache(): void {
  cachedManifest = null;
  manifestFetchPromise = null;
  manifestFetchError = null;
}
