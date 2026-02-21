'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MetricsSnapshot } from '@/types';

export interface MetricsState {
  data: MetricsSnapshot | null;
  previousData: MetricsSnapshot | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  lastFetchTime: number | null;
  error: Error | null;
}

export interface UseMetricsOptions {
  enabled?: boolean;
  interval?: number;
  mockMode?: boolean;
}

/**
 * Generate realistic mock metrics for demo mode
 */
export function generateMockMetrics(): MetricsSnapshot {
  const baseRss = 10_200_547_328;
  const rssVariation = Math.random() * 1_000_000_000;
  const budget = 22_548_578_304;
  const pressureRatio = (baseRss + rssVariation) / budget;

  let pressureLevel: 'OK' | 'WARN' | 'HOT' | 'CRITICAL' = 'OK';
  if (pressureRatio >= 0.92) pressureLevel = 'CRITICAL';
  else if (pressureRatio >= 0.80) pressureLevel = 'HOT';
  else if (pressureRatio >= 0.60) pressureLevel = 'WARN';

  return {
    ts: new Date().toISOString(),
    uptime_seconds: 3600 + Math.random() * 7200,
    memory: {
      sys_total_bytes: 68_719_476_736,
      sys_available_bytes: 32_212_254_720,
      sys_free_bytes: 5_368_709_120,
      sys_cached_bytes: 21_474_836_480,
      sys_swap_total_bytes: 0,
      sys_swap_free_bytes: 0,
      process_rss_bytes: baseRss + rssVariation,
      process_vmem_bytes: 21_474_836_480,
      process_heap_bytes: null,
      process_open_fds: null,
      budget_bytes: budget,
      budget_pct: 0.7,
      hard_cap_bytes: 25_769_803_776,
      pressure_ratio: pressureRatio,
      pressure_level: pressureLevel,
      spill_threshold_bytes: 19_166_291_558,
      spill_critical_bytes: 21_421_149_491,
    },
    sessions: {
      total: 1284 + Math.floor(Math.random() * 10),
      active: 10 + Math.floor(Math.random() * 10),
      idle: Math.floor(Math.random() * 5),
      last_activity_unix_ms: Date.now(),
    },
    objects: {
      contexts_total: 812 + Math.floor(Math.random() * 5),
      turns_total: 92014 + Math.floor(Math.random() * 50),
      blobs_total: 4812 + Math.floor(Math.random() * 20),
      registry_types_total: 62,
      registry_bundles_total: 9,
      heads_total: 812,
    },
    storage: {
      turns_log_bytes: 3_221_225_472,
      turns_index_bytes: 268_435_456,
      turns_meta_bytes: 134_217_728,
      heads_table_bytes: 1_048_576,
      blobs_pack_bytes: 21_474_836_480,
      blobs_index_bytes: 134_217_728,
      data_dir_total_bytes: 53_687_091_200,
      data_dir_free_bytes: 21_474_836_480,
    },
    filesystem: {
      snapshots_total: 127 + Math.floor(Math.random() * 10),
      index_bytes: 5_588 + Math.floor(Math.random() * 1000),
      content_bytes: 536_870_912 + Math.floor(Math.random() * 100_000_000),
    },
    perf: {
      append_tps_1m: 35 + Math.random() * 15,
      append_tps_5m: 37.4,
      append_tps_history: Array.from({ length: 12 }, () => 30 + Math.random() * 20),
      get_last_tps_1m: 18 + Math.random() * 8,
      get_last_tps_5m: 19.2,
      get_last_tps_history: Array.from({ length: 12 }, () => 15 + Math.random() * 10),
      get_blob_tps_1m: 2 + Math.random() * 2,
      get_blob_tps_5m: 2.8,
      get_blob_tps_history: Array.from({ length: 12 }, () => 1 + Math.random() * 3),
      registry_ingest_tps_1m: 0.05 + Math.random() * 0.1,
      registry_ingest_tps_5m: 0.05,
      http_req_tps_1m: 55 + Math.random() * 18,
      http_req_tps_5m: 58.2,
      http_req_tps_history: Array.from({ length: 12 }, () => 50 + Math.random() * 20),
      http_errors_tps_1m: Math.random() * 0.4,
      http_errors_tps_5m: 0.1,
      append_latency_ms: { p50: 3.2, p95: 8.4, p99: 12.1, max: 19.7, count: 512 },
      get_last_latency_ms: { p50: 1.7, p95: 4.2, p99: 6.1, max: 9.5, count: 512 },
      get_blob_latency_ms: { p50: 0.9, p95: 2.5, p99: 4.7, max: 6.2, count: 256 },
      http_latency_ms: { p50: 2.1, p95: 6.4, p99: 9.8, max: 14.0, count: 1024 },
    },
    errors: {
      total: 12,
      by_type: { binary: 5, http: 7 },
    },
  };
}

export function useMetrics(options: UseMetricsOptions = {}) {
  const { enabled = true, interval = 5000, mockMode = false } = options;

  const [state, setState] = useState<MetricsState>({
    data: null,
    previousData: null,
    status: 'idle',
    lastFetchTime: null,
    error: null,
  });

  const mountedRef = useRef(true);

  const fetchMetrics = useCallback(async () => {
    if (!mountedRef.current) return;

    // In mock mode, generate fake data
    if (mockMode) {
      const data = generateMockMetrics();
      setState(prev => ({
        previousData: prev.data,
        data,
        status: 'success',
        lastFetchTime: Date.now(),
        error: null,
      }));
      return;
    }

    try {
      setState(prev => ({ ...prev, status: prev.data ? 'success' : 'loading' }));

      const response = await fetch('/v1/metrics');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      if (!mountedRef.current) return;

      setState(prev => ({
        previousData: prev.data,
        data,
        status: 'success',
        lastFetchTime: Date.now(),
        error: null,
      }));
    } catch (err) {
      if (!mountedRef.current) return;

      setState(prev => ({
        ...prev,
        status: 'error',
        error: err as Error,
      }));
    }
  }, [mockMode]);

  const retry = useCallback(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setState({
        data: null,
        previousData: null,
        status: 'idle',
        lastFetchTime: null,
        error: null,
      });
      return;
    }

    fetchMetrics();
    const timer = setInterval(fetchMetrics, interval);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [enabled, interval, fetchMetrics]);

  return { ...state, retry };
}
