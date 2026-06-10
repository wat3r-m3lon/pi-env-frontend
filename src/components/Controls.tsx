import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { TwinHandle, TwinVariant } from '../twin/twin';

interface ControlsProps {
  twinRef: MutableRefObject<TwinHandle | null>;
  variant: TwinVariant;
  onVariantChange: (v: TwinVariant) => void;
}

export function Controls({ twinRef, variant, onVariantChange }: ControlsProps) {
  const [wire, setWire] = useState(true);
  const [flow, setFlow] = useState(true);
  const [hud, setHud] = useState(true);
  const [rotate, setRotate] = useState(true);

  const setVariant = (v: TwinVariant) => {
    twinRef.current?.setVariant(v);
    onVariantChange(v);
  };

  // functional update so two clicks in the same tick can't both read the same
  // stale closure value
  const toggle = (fn: (on: boolean) => void, setter: Dispatch<SetStateAction<boolean>>) => {
    setter((prev) => {
      const next = !prev;
      fn(next);
      return next;
    });
  };

  return (
    <div className="controls">
      <div className="seg" role="tablist" aria-label="Board variant">
        <button
          className={variant === 'enviro' ? 'seg-btn active' : 'seg-btn'}
          onClick={() => setVariant('enviro')}
          role="tab"
          aria-selected={variant === 'enviro'}
        >
          Pi + Enviro HAT
        </button>
        <button
          className={variant === 'server' ? 'seg-btn active' : 'seg-btn'}
          onClick={() => setVariant('server')}
          role="tab"
          aria-selected={variant === 'server'}
        >
          Pi 5 · Server
        </button>
      </div>

      <div className="ctrl-group">
        <button
          className={wire ? 'ctrl active' : 'ctrl'}
          onClick={() => toggle((on) => twinRef.current?.setWire(on), setWire)}
        >
          Wireframe
        </button>
        <button
          className={flow ? 'ctrl active' : 'ctrl'}
          onClick={() => toggle((on) => twinRef.current?.setFlow(on), setFlow)}
        >
          Data flow
        </button>
        <button
          className={hud ? 'ctrl active' : 'ctrl'}
          onClick={() => toggle((on) => twinRef.current?.setHUD(on), setHud)}
        >
          Labels
        </button>
        <button
          className={rotate ? 'ctrl active' : 'ctrl'}
          onClick={() => toggle((on) => twinRef.current?.setAutoRotate(on), setRotate)}
        >
          Auto-rotate
        </button>
        <button className="ctrl" onClick={() => twinRef.current?.reset()}>
          Reset view
        </button>
      </div>
    </div>
  );
}
