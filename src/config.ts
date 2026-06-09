// All runtime config comes from Vite env (.env.development / .env.production),
// resolved at build time. Sensible defaults keep the app working if a var is
// missing.
const env = import.meta.env;

export const wsUrl: string = env.VITE_WS_URL ?? 'ws://192.168.8.179:8080/ws/readings';

// Mock mode is a build-time switch, not a hot-path runtime check.
export const mockMode: boolean = (env.VITE_MOCK_MODE ?? 'true') === 'true';

// If no frame arrives within this window, the connection is flagged "stale"
// (~3x the nominal 5s reading cadence).
export const heartbeatTimeoutMs: number = Number(env.VITE_WS_HEARTBEAT_TIMEOUT_MS ?? 15000);
