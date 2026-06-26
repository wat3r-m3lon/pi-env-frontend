# pi-env-frontend

Real-time digital twin dashboard: drives the HUD telemetry labels in `twin.js`
(a three.js model of a Raspberry Pi 5 + Pimoroni Enviro HAT) with **live sensor data over WebSocket**.

Data comes from the Java `realtime-service` deployed on `.179`
(`ws://192.168.8.179:8080/ws/readings`).
Design notes and decisions are documented in [`project_md/pi-env-frontend-实时孪生看板规划.md`](../project_md/pi-env-frontend-实时孪生看板规划.md).

## Run

```bash
npm install
npm run dev        # mock mode by default; does not require .179 to be online
npm run build      # tsc --noEmit + vite build
npm run preview    # preview the production build
```

Open the URL printed by the dev server. The default is http://localhost:5173;
Vite will automatically pick the next available port if it is already in use.

## Connect to the real device (.179)

Dev mode uses the built-in mock generator by default. To connect to the real realtime-service:

- Temporary override: create `.env.local` and set `VITE_MOCK_MODE=false` (this overrides `.env.development`).
- Production build: `.env.production` already sets `VITE_MOCK_MODE=false`.

Environment variables (`.env.development` / `.env.production` / `.env.local`):

| Variable | Default | Description |
|---|---|---|
| `VITE_WS_URL` | `ws://192.168.8.179:8080/ws/readings` | realtime-service WebSocket |
| `VITE_MOCK_MODE` | dev=`true`, prd=`false` | `true` = use mock data and do not connect to WS |
| `VITE_WS_HEARTBEAT_TIMEOUT_MS` | `15000` | Mark status as `stale` when no frame is received within this timeout |

> `https` pages block `ws://` as mixed content. Local dev / same-origin `http` is fine.
> The server uses `setAllowedOriginPatterns("*")`, so cross-origin access is allowed and no auth is required.

## Structure

```
src/
  twin/twin.js        Adapted from PersonalWeb: exports initTwin(canvas) -> handle; HUD text can be updated live
  twin/twin.d.ts      Type declarations for the handle
  ws/ReadingClient.ts WebSocket wrapper: bare-frame parsing / exponential-backoff reconnect / stale detection / mock mode
  ws/mockGenerator.ts Offline mock readings (sine wave + noise)
  hooks/useReadings.ts Connection lifecycle -> {status, reading, error, lastFrameAt}
  components/          TwinCanvas / ConnectionStatus / Controls
  config.ts types.ts App.tsx main.tsx styles.css
```

## Notes / Known Items

- **Frame format** has been confirmed against the Java source: each frame is a bare
  `SensorReadingEvent` JSON object with no envelope. On connect, the server pushes
  one snapshot per cached device, then live readings. If the cache is empty, the
  snapshot contains 0 rows and the UI shows "Connected, no data yet".
- The unit for **`noiseLevel`** is still undecided. Java passes it through as a
  `Double`, so the HUD currently displays the raw value, such as `0.42`. Update this
  after the dB conversion is confirmed.
- The HUD on the server variant shows board specifications, not sensor values.
  Real-time data only drives the **enviro variant**.
