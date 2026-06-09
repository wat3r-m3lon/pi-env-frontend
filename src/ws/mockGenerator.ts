import type { Reading } from '../types';

// Synthetic readings for offline dev (no Pi needed). Smooth sine drift + light
// noise, matching the camelCase contract so it flows through the same parse +
// render path as real data.
let t = 0;

export function generateMockReading(): Reading {
  t += 1;
  const noise = (amp: number) => (Math.random() - 0.5) * amp;
  return {
    schemaVersion: 1,
    eventType: 'sensor.reading',
    deviceId: 'mock-pi',
    recordedAt: new Date().toISOString(),
    temperatureC: 22 + Math.sin(t * 0.1) * 2.5 + noise(0.3),
    humidityPct: 50 + Math.sin(t * 0.15 + 1) * 8 + noise(1),
    pressureHpa: 1013 + Math.sin(t * 0.05) * 3 + noise(1),
    lightLux: 150 + Math.sin(t * 0.25 + 2) * 100 + noise(10),
    noiseLevel: 0.25 + Math.sin(t * 0.3 + 3) * 0.15 + noise(0.05),
    source: 'mock',
    metadata: { mock: true },
  };
}
