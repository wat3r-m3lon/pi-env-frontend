import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { initTwin } from '../twin/twin.js';
import type { TwinHandle } from '../twin/twin';
import type { Reading } from '../types';

interface TwinCanvasProps {
  reading: Reading | null;
  /** Parent-owned ref that receives the imperative twin handle once initialised. */
  twinRef: MutableRefObject<TwinHandle | null>;
}

interface HoverState {
  label: string;
  x: number;
  y: number;
}

export function TwinCanvas({ reading, twinRef }: TwinCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  // init once
  useEffect(() => {
    if (!canvasRef.current) return;
    const handle = initTwin(canvasRef.current, {
      variant: 'enviro',
      onHover: (label, x, y) => setHover(label ? { label, x, y } : null),
    });
    twinRef.current = handle;
    return () => {
      handle.dispose();
      twinRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // push live readings
  useEffect(() => {
    if (reading) twinRef.current?.setReadings(reading);
  }, [reading, twinRef]);

  return (
    <div className="twin-stage">
      <canvas ref={canvasRef} className="twin-canvas" />
      {hover && (
        <div className="twin-tooltip" style={{ left: hover.x, top: hover.y }}>
          {hover.label}
        </div>
      )}
    </div>
  );
}
