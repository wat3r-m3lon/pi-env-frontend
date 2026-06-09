# pi-env-frontend

实时数字孪生看板：把 `twin.js`（树莓派 5 + Pimoroni Enviro HAT 的 three.js 模型）的 HUD 遥测标签
（温/湿/气压/光照/噪声）用 **WebSocket 实时传感器数据** 驱动。

数据来自部署在 `.179` 的 Java `realtime-service`（`ws://192.168.8.179:8080/ws/readings`）。
设计与决策见 [`project_md/pi-env-frontend-实时孪生看板规划.md`](../project_md/pi-env-frontend-实时孪生看板规划.md)。

## 运行

```bash
npm install
npm run dev        # 默认 mock 模式，不依赖 .179 在线
npm run build      # tsc --noEmit + vite build
npm run preview    # 预览生产构建
```

打开 dev server 打印的 URL（默认 http://localhost:5173，被占用时自动顺延）。

## 连真机（.179）

dev 默认走内置 mock 生成器。要连真实的 realtime-service：

- 临时：建 `.env.local`，写 `VITE_MOCK_MODE=false`（会覆盖 `.env.development`）。
- 或生产构建：`.env.production` 已经是 `VITE_MOCK_MODE=false`。

环境变量（`.env.development` / `.env.production` / `.env.local`）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `VITE_WS_URL` | `ws://192.168.8.179:8080/ws/readings` | realtime-service WebSocket |
| `VITE_MOCK_MODE` | dev=`true`, prd=`false` | `true`=用 mock 数据，不连 WS |
| `VITE_WS_HEARTBEAT_TIMEOUT_MS` | `15000` | 超过此时长没收到帧 → 状态置 `stale` |

> `https` 页面会拦截 `ws://`（混合内容）。本机 dev / 同源 `http` 没问题；
> 服务端 `setAllowedOriginPatterns("*")` 已允许跨源、无鉴权。

## 结构

```
src/
  twin/twin.js        从 PersonalWeb 复制改造：导出 initTwin(canvas) -> handle，HUD 可实时改字
  twin/twin.d.ts      handle 的类型声明
  ws/ReadingClient.ts WebSocket 封装：解析裸帧 / 指数退避重连 / stale 检测 / mock 模式
  ws/mockGenerator.ts 离线 mock 读数（正弦+噪声）
  hooks/useReadings.ts 连接生命周期 -> {status, reading, error, lastFrameAt}
  components/          TwinCanvas / ConnectionStatus / Controls
  config.ts types.ts App.tsx main.tsx styles.css
```

## 说明 / 已知项

- **帧格式**已对照 Java 源码确认：每帧是裸 `SensorReadingEvent` JSON 对象（无信封）；
  连上时按设备各推一条 snapshot，之后实时；缓存空时 snapshot 0 条 → "已连接·暂无数据"。
- **`noiseLevel`** 单位未定（Java 透传 `Double`），HUD 暂显示原始值（如 `0.42`），
  确认 dB 换算后再改。
- server 变体的 HUD 是板卡规格，非传感器值，实时数据只驱动 **enviro 变体**。
