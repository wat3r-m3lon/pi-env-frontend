// Mirror of the Java `SensorReadingEvent` record (camelCase, schemaVersion 1).
// Every field is optional/nullable: the Java record uses boxed types and
// `@JsonIgnoreProperties(ignoreUnknown = true)`, and a frame may arrive before
// all sensors have produced a value.
export interface Reading {
  schemaVersion?: number;
  eventType?: string;
  deviceId?: string;
  recordedAt?: string; // ISO-8601 with offset, e.g. "2026-04-29T16:00:00+09:00"
  temperatureC?: number | null;
  humidityPct?: number | null;
  pressureHpa?: number | null;
  lightLux?: number | null;
  noiseLevel?: number | null;
  source?: string;
  metadata?: Record<string, unknown> | null;
}

// The numeric telemetry fields the HUD can render. Used for "has any field?" guards.
export const TELEMETRY_FIELDS = [
  'temperatureC',
  'humidityPct',
  'pressureHpa',
  'lightLux',
  'noiseLevel',
] as const;

export type ConnectionStatus =
  | 'connecting' // opening the socket / between reconnect attempts
  | 'connected' // socket open, frames flowing (or just opened)
  | 'stale' // open but no frame for > heartbeat timeout
  | 'error' // repeated parse failures or socket error
  | 'offline'; // socket closed unexpectedly, waiting to reconnect
