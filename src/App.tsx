import { useRef, useState } from 'react';
import { TwinCanvas } from './components/TwinCanvas';
import { Controls } from './components/Controls';
import { ConnectionStatus } from './components/ConnectionStatus';
import { useReadings } from './hooks/useReadings';
import type { TwinHandle, TwinVariant } from './twin/twin';

export default function App() {
  const twinRef = useRef<TwinHandle | null>(null);
  const [variant, setVariant] = useState<TwinVariant>('enviro');
  const { status, reading, error, lastFrameAt, mock } = useReadings();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">pi-env</span>
          <span className="brand-sub">live digital twin</span>
        </div>
        <ConnectionStatus
          status={status}
          reading={reading}
          error={error}
          lastFrameAt={lastFrameAt}
          mock={mock}
        />
      </header>

      <main className="stage-wrap">
        <TwinCanvas reading={reading} twinRef={twinRef} />
        {variant === 'server' && (
          <div className="variant-note">
            Server view shows board specs — switch to <strong>Pi + Enviro HAT</strong> for live telemetry.
          </div>
        )}
      </main>

      <footer className="bottombar">
        <Controls twinRef={twinRef} variant={variant} onVariantChange={setVariant} />
      </footer>
    </div>
  );
}
