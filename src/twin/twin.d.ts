import type { Reading } from '../types';

export type TwinVariant = 'server' | 'enviro';

export interface TwinOptions {
  variant?: TwinVariant;
  wire?: boolean;
  flow?: boolean;
  hud?: boolean;
  autoRotate?: boolean;
  /** Called on hover; label is null when nothing is under the pointer. x/y are canvas-relative px. */
  onHover?: (label: string | null, x: number, y: number) => void;
  /** Called when a clickable component is clicked. */
  onPick?: (id: string, label: string) => void;
}

export interface TwinHandle {
  /** Push a live reading; updates the 5 enviro telemetry labels (no-op in server variant). */
  setReadings(reading: Reading | null): void;
  setVariant(v: TwinVariant): void;
  setWire(on: boolean): void;
  setFlow(on: boolean): void;
  setHUD(on: boolean): void;
  setAutoRotate(on: boolean): void;
  reset(): void;
  getVariant(): TwinVariant;
  dispose(): void;
}

export function initTwin(canvas: HTMLCanvasElement, opts?: TwinOptions): TwinHandle;
