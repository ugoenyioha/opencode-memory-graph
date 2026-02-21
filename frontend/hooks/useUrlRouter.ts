'use client';

import { useEffect, useCallback, useRef } from 'react';

export interface RouteState {
  contextId: string | null;
  turnId: string | null;
}

interface UseUrlRouterOptions {
  onRouteChange?: (state: RouteState) => void;
}

/**
 * Parse the current URL path into route state.
 * Supports:
 *   /           -> { contextId: null, turnId: null }
 *   /c/123      -> { contextId: "123", turnId: null }
 *   /c/123/t/456 -> { contextId: "123", turnId: "456" }
 */
export function parseUrl(pathname: string): RouteState {
  const parts = pathname.split('/').filter(Boolean);

  // /c/{contextId}
  if (parts[0] === 'c' && parts[1]) {
    const contextId = parts[1];

    // /c/{contextId}/t/{turnId}
    if (parts[2] === 't' && parts[3]) {
      return { contextId, turnId: parts[3] };
    }

    return { contextId, turnId: null };
  }

  return { contextId: null, turnId: null };
}

/**
 * Build a URL path from route state.
 */
export function buildUrl(state: RouteState): string {
  if (!state.contextId) {
    return '/';
  }

  if (state.turnId) {
    return `/c/${state.contextId}/t/${state.turnId}`;
  }

  return `/c/${state.contextId}`;
}

/**
 * Hook for managing URL-based routing.
 *
 * - Parses URL on mount and calls onRouteChange
 * - Provides setRoute to update URL
 * - Handles browser back/forward navigation
 */
export function useUrlRouter(options: UseUrlRouterOptions = {}) {
  const { onRouteChange } = options;
  const isInitialMount = useRef(true);
  const lastPushedUrl = useRef<string | null>(null);

  // Parse initial URL on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const state = parseUrl(window.location.pathname);
    if (isInitialMount.current) {
      isInitialMount.current = false;
      onRouteChange?.(state);
    }
  }, [onRouteChange]);

  // Handle browser back/forward
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const state = parseUrl(window.location.pathname);
      onRouteChange?.(state);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onRouteChange]);

  // Update URL without triggering popstate
  const setRoute = useCallback((state: RouteState, replace = false) => {
    if (typeof window === 'undefined') return;

    const url = buildUrl(state);

    // Avoid pushing duplicate URLs
    if (url === lastPushedUrl.current && !replace) {
      return;
    }

    lastPushedUrl.current = url;

    if (replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
  }, []);

  // Navigate to context (optionally with turn)
  const navigateToContext = useCallback((contextId: string, turnId?: string | null) => {
    setRoute({ contextId, turnId: turnId ?? null });
  }, [setRoute]);

  // Navigate to home
  const navigateHome = useCallback(() => {
    setRoute({ contextId: null, turnId: null });
  }, [setRoute]);

  // Update just the turn (keep context)
  const setTurn = useCallback((contextId: string, turnId: string | null, replace = false) => {
    setRoute({ contextId, turnId }, replace);
  }, [setRoute]);

  return {
    setRoute,
    navigateToContext,
    navigateHome,
    setTurn,
    parseUrl,
    buildUrl,
  };
}
