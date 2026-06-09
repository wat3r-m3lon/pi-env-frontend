import { useEffect, useState } from 'react';
import { ReadingClient } from '../ws/ReadingClient';
import { heartbeatTimeoutMs, mockMode, wsUrl } from '../config';
import type { ConnectionStatus, Reading } from '../types';

export interface ReadingsState {
  status: ConnectionStatus;
  reading: Reading | null;
  error?: string;
  lastFrameAt?: number;
  mock: boolean;
}

/**
 * Owns a single ReadingClient for the app's lifetime: connect on mount,
 * disconnect on unmount. Exposes the latest reading + connection status as
 * React state so the UI re-renders naturally.
 */
export function useReadings(): ReadingsState {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [lastFrameAt, setLastFrameAt] = useState<number | undefined>(undefined);

  useEffect(() => {
    const client = new ReadingClient({
      url: wsUrl,
      mock: mockMode,
      heartbeatTimeoutMs,
      onReading: (r) => {
        setReading(r);
        setLastFrameAt(Date.now());
      },
      onStatus: (s, info) => {
        setStatus(s);
        if (info?.error) setError(info.error);
      },
    });
    client.connect();
    return () => client.disconnect();
  }, []);

  return { status, reading, error, lastFrameAt, mock: mockMode };
}
