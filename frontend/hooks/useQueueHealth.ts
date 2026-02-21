'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface QueueStats {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  total: number;
  oldest_pending_at: number | null;
  avg_processing_ms: number | null;
}

export interface DeadLetterItem {
  uuid: string;
  project_id: string;
  session_id: string;
  message_id: string;
  error: string | null;
  attempts: number;
  payload: string;
  created_at: number;
  updated_at: number;
}

export interface DeadLetterResponse {
  items: DeadLetterItem[];
  total: number;
}

export interface QueueHealthState {
  stats: QueueStats | null;
  deadLetters: DeadLetterResponse | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: Error | null;
}

export interface UseQueueHealthOptions {
  enabled?: boolean;
  interval?: number;
}

export function useQueueHealth(options: UseQueueHealthOptions = {}) {
  const { enabled = true, interval = 5000 } = options;
  const mountedRef = useRef(true);

  const [state, setState] = useState<QueueHealthState>({
    stats: null,
    deadLetters: null,
    status: 'idle',
    error: null,
  });

  const fetchHealth = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setState(prev => ({ ...prev, status: prev.stats ? 'success' : 'loading' }));

      const [statsRes, dlRes] = await Promise.all([
        fetch('/v1/queue/stats'),
        fetch('/v1/queue/dead-letters?limit=50'),
      ]);

      if (!statsRes.ok) throw new Error(`Stats: HTTP ${statsRes.status}`);
      if (!dlRes.ok) throw new Error(`Dead letters: HTTP ${dlRes.status}`);

      const stats = await statsRes.json();
      const deadLetters = await dlRes.json();

      if (!mountedRef.current) return;

      setState({ stats, deadLetters, status: 'success', error: null });
    } catch (err) {
      if (!mountedRef.current) return;
      setState(prev => ({ ...prev, status: 'error', error: err as Error }));
    }
  }, []);

  const retryItem = useCallback(async (uuid: string) => {
    const res = await fetch(`/v1/queue/dead-letters/${uuid}/retry`, { method: 'POST' });
    if (!res.ok) throw new Error(`Retry failed: HTTP ${res.status}`);
    await fetchHealth();
  }, [fetchHealth]);

  const retryAll = useCallback(async () => {
    const res = await fetch('/v1/queue/dead-letters/retry-all', { method: 'POST' });
    if (!res.ok) throw new Error(`Retry all failed: HTTP ${res.status}`);
    await fetchHealth();
  }, [fetchHealth]);

  const purge = useCallback(async (before?: number) => {
    const url = before ? `/v1/queue/dead-letters?before=${before}` : '/v1/queue/dead-letters';
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Purge failed: HTTP ${res.status}`);
    await fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setState({ stats: null, deadLetters: null, status: 'idle', error: null });
      return;
    }

    fetchHealth();
    const timer = setInterval(fetchHealth, interval);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [enabled, interval, fetchHealth]);

  return { ...state, refresh: fetchHealth, retryItem, retryAll, purge };
}
