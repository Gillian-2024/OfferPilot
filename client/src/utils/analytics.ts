/**
 * OfferPilot Analytics SDK — client-side event tracking.
 *
 * Design principles:
 * - Zero dependency (no external SDK)
 * - Fail-safe (never breaks main flow)
 * - Batch flush to server endpoint (/api/analytics/batch)
 * - Anonymous by default (device_id in localStorage)
 *
 * Usage:
 *   import { track, device } from '../utils/analytics';
 *   track('jd_file_upload', { file_type: 'pdf', file_size_bytes: 12345 });
 */

import { authHeaders } from '../api/auth';

// ── Device ID ─────────────────────────────────────────────────

const DEVICE_ID_KEY = 'analytics_device_id';

function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      // Simple UUID v4 generation
      id = 'dp_' + Math.random().toString(36).slice(2, 8) + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dp_anon_' + Date.now().toString(36);
  }
}

export const device = { getId: getDeviceId };

// ── Event queue ───────────────────────────────────────────────

const STORAGE_KEY = 'analytics_queue';
const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 30_000; // 30s auto-flush
const MAX_QUEUE = 200; // safety cap

let queue: Array<{
  event: string;
  path: string;
  extra: Record<string, any>;
  ts: number;
}> = [];

function loadQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) queue = JSON.parse(raw);
  } catch {
    queue = [];
  }
}

function saveQueue() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full — drop oldest half
    queue.splice(0, Math.floor(queue.length / 2));
  }
}

loadQueue();

// ── Flush ─────────────────────────────────────────────────────

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, Math.min(BATCH_SIZE, queue.length));
  saveQueue();

  try {
    await fetch('/api/analytics/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        events: batch.map((e) => ({
          device_id: device.getId(),
          event: e.event,
          path: e.path,
          extra: e.extra,
          ts: e.ts,
        })),
      }),
    }).catch(() => {}); // silent fail
  } catch {
    // Re-queue on failure
    queue.unshift(...batch);
    saveQueue();
  }
}

// Auto-flush interval
let flushTimer: ReturnType<typeof setInterval> | null = null;
function startFlushInterval() {
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
}

// Flush on page unload (beforeunload fires before tab close/refresh)
window.addEventListener('beforeunload', () => {
  // navigator.sendBeacon is ideal but unreliable across all browsers
  // Using simple fetch — may not always complete but worth trying
  flush();
});

startFlushInterval();

// Initial flush for queued events from previous visits
if (queue.length > 0) {
  flush();
}

// ── Track API ─────────────────────────────────────────────────

interface TrackExtra {
  [key: string]: any;
}

/**
 * Queue an analytics event. Flushed automatically.
 * @param event Event name (e.g. 'jd_file_upload')
 * @param extra Optional metadata
 */
export function track(event: string, extra: TrackExtra = {}) {
  if (queue.length >= MAX_QUEUE) {
    queue.shift(); // drop oldest
  }

  queue.push({
    event,
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    extra,
    ts: Date.now(),
  });

  // Immediate flush if batch ready
  if (queue.length >= BATCH_SIZE) {
    flush();
  }
}

// ── Convenience helpers ───────────────────────────────────────

/** Track a route/page change */
export function trackPageChange(page: string) {
  track('page_enter', { page });
}

/** Track a button click */
export function trackClick(label: string) {
  track('click', { label });
}

/** Track an error */
export function trackError(context: string, message: string) {
  track('error_client', { context, message });
}
