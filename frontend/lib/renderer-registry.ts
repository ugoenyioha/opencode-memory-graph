/**
 * Runtime renderer registry for dynamically loading turn renderers.
 *
 * Supports:
 * - Builtin renderers via "builtin:ComponentName" URLs
 * - External ESM modules from allowlisted origins
 */

import type { ComponentType } from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * Props interface that all turn renderers must accept.
 */
export interface TurnRendererProps {
  /** The decoded payload data from the turn */
  data: unknown;
  /** Type ID from the registry (e.g., "cxdb:ConversationItem") */
  typeId: string;
  /** Type version number */
  typeVersion: number;
  /** Optional CSS class name */
  className?: string;
}

/**
 * Specification for a renderer loaded from the registry.
 */
export interface RendererSpec {
  /** ESM URL or "builtin:ComponentName" */
  esm_url: string;
  /** Named export from the module (defaults to "default") */
  component?: string;
  /** Subresource integrity hash for security */
  integrity?: string;
}

/**
 * Manifest of all type -> renderer mappings from the backend.
 */
export interface RendererManifest {
  renderers: Record<string, RendererSpec>;
}

// ============================================================================
// Builtin Renderers
// ============================================================================

/**
 * Lazy import functions for builtin renderers.
 * Using dynamic imports to enable code splitting.
 *
 * Each renderer is wrapped with a component that accepts TurnRendererProps.
 */
const BUILTIN_RENDERERS: Record<string, () => Promise<{ default: ComponentType<TurnRendererProps> }>> = {
  // Conversation types (cxdb:ConversationItem)
  ConversationRenderer: () => import('@/components/ConversationRenderer').then(m => ({
    default: m.ConversationRendererWrapper
  })),

  // Agent SDK message types (ai-agents-sdk:Message)
  MessageRenderer: () => import('@/components/MessageRenderer').then(m => ({
    default: m.MessageRendererWrapper
  })),

  // Quest event types (quest:Event)
  QuestEventRenderer: () => import('@/components/QuestRenderer').then(m => ({
    default: m.QuestEventRendererWrapper
  })),

  // Quest snapshot types (quest:Snapshot)
  QuestSnapshotRenderer: () => import('@/components/QuestRenderer').then(m => ({
    default: m.QuestSnapshotRendererWrapper
  })),

  // Fallback renderer for unknown types
  FallbackRenderer: () => import('@/components/FallbackRenderer').then(m => ({
    default: m.FallbackRendererWrapper
  })),
};

// ============================================================================
// URL Allowlist
// ============================================================================

/**
 * Origins allowed to load external ESM modules from.
 * This is a security measure to prevent loading arbitrary code.
 */
const ALLOWED_ORIGINS: string[] = [
  'https://cdn.strongdm.ai',
  'https://esm.sh',
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
];

/**
 * Check if a URL is from an allowed origin.
 */
function isAllowedOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_ORIGINS.some(origin => {
      const allowedUrl = new URL(origin);
      return parsed.origin === allowedUrl.origin;
    });
  } catch {
    return false;
  }
}

// ============================================================================
// Renderer Cache
// ============================================================================

/**
 * Cache of loaded renderer components.
 */
const rendererCache = new Map<string, ComponentType<TurnRendererProps>>();

/**
 * Cache of in-flight loading promises to prevent duplicate loads.
 */
const loadingPromises = new Map<string, Promise<ComponentType<TurnRendererProps>>>();

// ============================================================================
// Loader Functions
// ============================================================================

/**
 * Load a renderer from a RendererSpec.
 *
 * @param spec - The renderer specification
 * @returns Promise resolving to the renderer component
 * @throws Error if the URL is not allowed or the module fails to load
 */
export async function loadRenderer(spec: RendererSpec): Promise<ComponentType<TurnRendererProps>> {
  const cacheKey = `${spec.esm_url}#${spec.component || 'default'}`;

  // Check cache first
  const cached = rendererCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Check for in-flight load
  const inFlight = loadingPromises.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  // Start loading
  const loadPromise = loadRendererInternal(spec, cacheKey);
  loadingPromises.set(cacheKey, loadPromise);

  try {
    const component = await loadPromise;
    rendererCache.set(cacheKey, component);
    return component;
  } finally {
    loadingPromises.delete(cacheKey);
  }
}

/**
 * Internal loader implementation.
 */
async function loadRendererInternal(
  spec: RendererSpec,
  cacheKey: string
): Promise<ComponentType<TurnRendererProps>> {
  const { esm_url, component = 'default' } = spec;

  // Handle builtin renderers
  if (esm_url.startsWith('builtin:')) {
    const builtinName = esm_url.slice('builtin:'.length);
    const loader = BUILTIN_RENDERERS[builtinName];

    if (!loader) {
      throw new Error(`Unknown builtin renderer: ${builtinName}`);
    }

    const loadedModule = await loader();
    return loadedModule.default;
  }

  // Validate external URL
  if (!isAllowedOrigin(esm_url)) {
    throw new Error(
      `Renderer URL not from allowed origin: ${esm_url}. ` +
      `Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`
    );
  }

  // Dynamic import from external URL
  // Note: This uses the browser's native ESM loader
  const loadedModule = await import(/* webpackIgnore: true */ esm_url);

  // Get the specified export
  const exportedComponent = loadedModule[component];

  if (!exportedComponent) {
    throw new Error(
      `Module ${esm_url} does not export "${component}". ` +
      `Available exports: ${Object.keys(loadedModule).join(', ')}`
    );
  }

  if (typeof exportedComponent !== 'function') {
    throw new Error(
      `Export "${component}" from ${esm_url} is not a function/component`
    );
  }

  return exportedComponent as ComponentType<TurnRendererProps>;
}

/**
 * Get a renderer spec for a type ID from the manifest.
 *
 * @param manifest - The renderer manifest
 * @param typeId - The type ID to look up
 * @returns The renderer spec or null if not found
 */
export function getRendererSpec(
  manifest: RendererManifest | null,
  typeId: string
): RendererSpec | null {
  if (!manifest) return null;
  return manifest.renderers[typeId] ?? null;
}

/**
 * Clear the renderer cache. Useful for testing or hot-reloading.
 */
export function clearRendererCache(): void {
  rendererCache.clear();
  loadingPromises.clear();
}

/**
 * Get cache statistics. Useful for debugging.
 */
export function getRendererCacheStats(): { cached: number; loading: number } {
  return {
    cached: rendererCache.size,
    loading: loadingPromises.size,
  };
}
