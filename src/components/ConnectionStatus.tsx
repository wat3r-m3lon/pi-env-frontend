import { useEffect, useState } from 'react';
import type { ConnectionStatus as Status, Reading } from '../types';

interface ConnectionStatusProps {
  status: Status;
  reading: Reading | null;
  error?: string;
  lastFrameAt?: number;
  mock: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  stale: 'Stale',
  error: 'Error',
  offline: 'Offline',
};

function fmt(value: number | null | undefined, digits: number, unit: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}${unit}`;
}

function ageText(lastFrameAt?: number): string {
  if (!lastFrameAt) return 'no data yet';
  const secs = Math.max(0, Math.round((Date.now() - lastFrameAt) / 1000));
  return secs < 1 ? 'just now' : `${secs}s ago`;
}

export function ConnectionStatus({ status, reading, error, lastFrameAt, mock }: ConnectionStatusProps) {
  // tick once a second so the "Ns ago" age stays current
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const cpuTemp = reading?.metadata?.['cpuTempC'];

  return (
    <div className="panel">
      <div className="panel-head">
        <span className={`dot dot-${status}`} aria-hidden="true" />
        <span className="status-label" role="status" aria-live="polite">
          {STATUS_LABEL[status]}
        </span>
        <span className="source-tag">{mock ? 'MOCK' : 'LIVE'}</span>
      </div>

      <div className="meta-line">
        <span>{reading?.deviceId ?? (mock ? 'mock-pi' : '—')}</span>
        <span>{ageText(lastFrameAt)}</span>
      </div>

      {status === 'error' && error && <div className="err-line">{error}</div>}
      {status === 'connected' && !reading && (
        <div className="hint-line">Connected — waiting for first reading…</div>
      )}

      <dl className="readout">
        <div className="r-item">
          <dt>Temp</dt>
          <dd>{fmt(reading?.temperatureC, 1, '°C')}</dd>
        </div>
        <div className="r-item">
          <dt>Humidity</dt>
          <dd>{fmt(reading?.humidityPct, 0, '%')}</dd>
        </div>
        <div className="r-item">
          <dt>Pressure</dt>
          <dd>{fmt(reading?.pressureHpa, 0, ' hPa')}</dd>
        </div>
        <div className="r-item">
          <dt>Light</dt>
          <dd>{fmt(reading?.lightLux, 0, ' lux')}</dd>
        </div>
        <div className="r-item">
          <dt>Noise</dt>
          <dd>{fmt(reading?.noiseLevel, 2, '')}</dd>
        </div>
        <div className="r-item">
          <dt>CPU</dt>
          <dd>{fmt(typeof cpuTemp === 'number' ? cpuTemp : null, 1, '°C')}</dd>
        </div>
      </dl>

      {reading?.recordedAt && <div className="ts-line">rec. {reading.recordedAt}</div>}
    </div>
  );
}
