import type { ConnectionStatus, Reading } from '../types';
import { TELEMETRY_FIELDS } from '../types';
import { generateMockReading } from './mockGenerator';

export interface ReadingClientOptions {
  url: string;
  mock?: boolean;
  heartbeatTimeoutMs?: number;
  /** Interval for the mock generator (ms). Ignored when not in mock mode. */
  mockIntervalMs?: number;
  onReading: (reading: Reading) => void;
  onStatus: (status: ConnectionStatus, info?: { error?: string }) => void;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

/**
 * Wraps the realtime-service WebSocket (`/ws/readings`). The server sends bare
 * SensorReadingEvent JSON objects (confirmed from source) — one snapshot per
 * cached device on connect, then live readings — so parsing is just JSON.parse
 * plus a light guard. Handles exponential-backoff reconnect and stale detection.
 *
 * In mock mode it never opens a socket; it emits synthetic readings on a timer.
 */
export class ReadingClient {
  private readonly opts: ReadingClientOptions;
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private mockTimer: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;
  private closedByUser = false;
  private consecutiveBadFrames = 0;
  private currentStatus: ConnectionStatus = 'connecting';

  constructor(opts: ReadingClientOptions) {
    this.opts = opts;
  }

  connect(): void {
    this.closedByUser = false;
    if (this.opts.mock) {
      this.startMock();
      return;
    }
    this.openSocket();
  }

  disconnect(): void {
    this.closedByUser = true;
    this.clearTimers();
    if (this.ws) {
      // drop handlers so the close doesn't trigger a reconnect
      this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  // --- mock mode ---
  private startMock(): void {
    this.setStatus('connected');
    const emit = () => {
      this.lastFrameAt = Date.now();
      this.opts.onReading(generateMockReading());
    };
    emit();
    this.mockTimer = setInterval(emit, this.opts.mockIntervalMs ?? 5_000);
  }

  // --- live socket ---
  private openSocket(): void {
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url);
    } catch (err) {
      this.setStatus('error', { error: String(err) });
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.consecutiveBadFrames = 0;
      this.lastFrameAt = Date.now();
      this.setStatus('connected');
      this.startStaleWatch();
    };

    ws.onmessage = (ev) => {
      const reading = parseFrame(typeof ev.data === 'string' ? ev.data : '');
      if (!reading) {
        this.consecutiveBadFrames += 1;
        if (this.consecutiveBadFrames >= 3) {
          this.setStatus('error', { error: 'repeated unparseable frames' });
        }
        return;
      }
      this.consecutiveBadFrames = 0;
      this.lastFrameAt = Date.now();
      if (this.currentStatus !== 'connected') this.setStatus('connected');
      this.opts.onReading(reading);
    };

    ws.onerror = () => {
      // onclose will follow and drive the reconnect; just surface the state.
      if (this.currentStatus === 'connecting') this.setStatus('error', { error: 'websocket error' });
    };

    ws.onclose = (ev) => {
      this.stopStaleWatch();
      this.ws = null;
      if (this.closedByUser) return;
      this.setStatus('offline', { error: `socket closed (${ev.code})` });
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    const delay = Math.min(BASE_BACKOFF_MS * 1.5 ** this.reconnectAttempt, MAX_BACKOFF_MS);
    const jittered = delay * (0.9 + Math.random() * 0.2);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.openSocket(), jittered);
  }

  private startStaleWatch(): void {
    this.stopStaleWatch();
    const timeout = this.opts.heartbeatTimeoutMs ?? 15_000;
    this.staleTimer = setInterval(() => {
      if (this.currentStatus !== 'connected' && this.currentStatus !== 'stale') return;
      const age = Date.now() - this.lastFrameAt;
      if (age > timeout && this.currentStatus !== 'stale') {
        this.setStatus('stale');
      } else if (age <= timeout && this.currentStatus === 'stale') {
        this.setStatus('connected');
      }
    }, 1_000);
  }

  private stopStaleWatch(): void {
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopStaleWatch();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.mockTimer) {
      clearInterval(this.mockTimer);
      this.mockTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus, info?: { error?: string }): void {
    this.currentStatus = status;
    this.opts.onStatus(status, info);
  }
}

/**
 * Parse one WS frame. The server is confirmed to send a bare JSON object, but
 * we keep a thin guard: tolerate an accidental array wrapper, reject non-objects
 * and frames with no telemetry fields at all. Individual missing fields are fine
 * (rendered as "—" downstream).
 */
export function parseFrame(raw: string): Reading | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    console.warn('[ws] dropped non-JSON frame:', raw.slice(0, 120));
    return null;
  }
  if (Array.isArray(obj)) obj = obj[0];
  if (!obj || typeof obj !== 'object') {
    console.warn('[ws] dropped non-object frame');
    return null;
  }
  const r = obj as Reading;
  const hasTelemetry = TELEMETRY_FIELDS.some((k) => r[k] != null);
  if (!hasTelemetry) {
    console.warn('[ws] dropped frame with no telemetry fields:', r);
    return null;
  }
  return r;
}
