// === Raspberry Pi 5 digital twin (React-driven port) ===
//
// Ported from PersonalWeb/twin.js. Changes vs. the original:
//   - No auto-run / DOM wiring / window globals. Instead exports
//     initTwin(canvas, opts) -> handle { setReadings, setVariant, setWire,
//     setFlow, setHUD, setAutoRotate, reset, dispose }.
//   - makeHUDLabel() returns { sprite, setText } so the 5 enviro telemetry
//     labels can be redrawn in place from live sensor readings (CanvasTexture
//     redraw + needsUpdate, no sprite churn).
//   - The hero showpiece scene is dropped; this app uses a single canvas.
//
// The geometry (makePi5 / makeEnviroHAT / data-flow curves / palette) is copied
// near-verbatim — only the init + HUD plumbing was restructured.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PCB_W = 8.56; // x  (real Pi5 is 85.6mm)
const PCB_D = 5.65; // z  (56.5mm)
const PCB_H = 0.16; // y  (1.6mm thick)

// === material palette ===
function pal() {
  return {
    pcb: new THREE.MeshStandardMaterial({ color: 0x1f4d2b, roughness: 0.7, metalness: 0.05 }),
    pcbTrace: new THREE.MeshStandardMaterial({ color: 0xb8a04a, roughness: 0.4, metalness: 0.5 }),
    soc: new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.45, metalness: 0.3 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.5, metalness: 0.2 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.35, metalness: 0.85 }),
    silverDull: new THREE.MeshStandardMaterial({ color: 0x8d9097, roughness: 0.55, metalness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9b774, roughness: 0.35, metalness: 0.85 }),
    usbBlue: new THREE.MeshStandardMaterial({ color: 0x0c2d52, roughness: 0.5, metalness: 0.2 }),
    cap: new THREE.MeshStandardMaterial({ color: 0xc8a85a, roughness: 0.4, metalness: 0.5 }),
    capBlack: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.45, metalness: 0.2 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeaeaea, roughness: 0.6, metalness: 0.1 }),
    ledRed: new THREE.MeshStandardMaterial({ color: 0x661010, roughness: 0.3, metalness: 0.1, emissive: 0xff2020, emissiveIntensity: 1.6 }),
    ledGreen: new THREE.MeshStandardMaterial({ color: 0x0c4a1c, roughness: 0.3, metalness: 0.1, emissive: 0x44ff66, emissiveIntensity: 1.2 }),
  };
}

// === data-bus paths between components (industrial-twin style) ===
const FLOW_PATHS = [
  { color: 0x9cf3a8, points: [[-0.4, 0.42, -0.2], [0.95, 0.42, -0.2]], speed: 1.4, count: 5, label: 'MEM BUS' },
  { color: 0x9cf3a8, points: [[-0.4, 0.42, -0.2], [-0.4, 0.42, 1.4], [1.4, 0.42, 1.4]], speed: 0.9, count: 6, label: 'PCIE' },
  { color: 0x6cc5ff, points: [[1.4, 0.42, 1.4], [PCB_W / 2 - 0.85, 0.42, 1.4], [PCB_W / 2 - 0.85, 0.42, -PCB_D / 2 + 4.4]], speed: 1.2, count: 4, label: 'ETH' },
  { color: 0xffb060, points: [[1.4, 0.42, 1.4], [PCB_W / 2 - 0.85, 0.42, 1.4], [PCB_W / 2 - 0.85, 0.42, -PCB_D / 2 + 1.1]], speed: 0.8, count: 3, label: 'USB3' },
  { color: 0xff7ac6, points: [[-0.4, 0.42, -0.2], [-1.6, 0.42, -1.0], [-2.6, 0.42, -1.4]], speed: 1.0, count: 3, label: 'WIFI' },
  { color: 0xffe66c, points: [[-0.4, 0.42, -0.2], [-PCB_W / 2 + 2.4, 0.42, -PCB_D / 2 + 0.55]], speed: 0.6, count: 3, label: 'GPIO' },
];

function makeFlowMaterials(color) {
  return {
    line: new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }),
    dot: new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4 }),
  };
}

// halo sprite (radial-gradient canvas) used to make data-flow dots pop
function makeHaloSprite(hexColor) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const cx = 64, cy = 64;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 64);
  const col = new THREE.Color(hexColor);
  const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.6)`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},0.15)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
}

function addDataFlow(parent) {
  const flows = [];
  for (const p of FLOW_PATHS) {
    const curve = new THREE.CatmullRomCurve3(p.points.map((c) => new THREE.Vector3(...c)));
    const mats = makeFlowMaterials(p.color);
    const linePoints = curve.getPoints(80);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    parent.add(new THREE.Line(lineGeo, mats.line));
    const dotGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const haloMat = makeHaloSprite(p.color);
    const dots = [];
    for (let i = 0; i < p.count; i++) {
      const dot = new THREE.Mesh(dotGeo, mats.dot);
      const halo = new THREE.Sprite(haloMat);
      halo.scale.set(0.55, 0.55, 1);
      dot.add(halo);
      parent.add(dot);
      dots.push({ mesh: dot, halo, offset: i / p.count });
    }
    const ends = [linePoints[0], linePoints[linePoints.length - 1]];
    ends.forEach((pt) => {
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 12),
        new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 1.2, transparent: true, opacity: 0.7 })
      );
      node.position.copy(pt);
      parent.add(node);
    });
    flows.push({ curve, dots, speed: p.speed });
  }
  return flows;
}

// === HUD telemetry labels ===
// Returns { sprite, setText } so the rendered value can be updated in place by
// redrawing the same canvas and flagging the texture for re-upload.
function makeHUDLabel(text, color = '#a3f3a3') {
  const dpr = 2;
  const w = 240, h = 56;
  const canvas = document.createElement('canvas');
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  function draw(value) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10, 14, 12, 0.85)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    // corner brackets
    const c = 8;
    ctx.beginPath();
    ctx.moveTo(0, c); ctx.lineTo(0, 0); ctx.lineTo(c, 0);
    ctx.moveTo(w - c, 0); ctx.lineTo(w, 0); ctx.lineTo(w, c);
    ctx.moveTo(w, h - c); ctx.lineTo(w, h); ctx.lineTo(w - c, h);
    ctx.moveTo(c, h); ctx.lineTo(0, h); ctx.lineTo(0, h - c);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '700 24px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, w / 2, h / 2);
  }
  draw(text);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.38, 1);

  return {
    sprite,
    setText(value) {
      draw(value);
      tex.needsUpdate = true;
    },
  };
}

// server-variant labels: static board specs (NOT sensor data — never overwritten)
function addHUDLabels(parent) {
  const items = [
    { text: '2.4 GHz', pos: [-0.4, 1.4, -0.2], color: '#a3f3a3' },
    { text: '8 GB', pos: [0.95, 1.2, -0.2], color: '#a3f3a3' },
    { text: '1 GB/S', pos: [PCB_W / 2 - 0.85, 2.0, -PCB_D / 2 + 4.4], color: '#6cc5ff' },
    { text: '5 GB/S', pos: [PCB_W / 2 - 0.85, 1.4, -PCB_D / 2 + 1.1], color: '#ffb060' },
    { text: 'WIFI 5', pos: [-2.6, 1.2, -1.4], color: '#ff7ac6' },
  ];
  const labels = [];
  for (const it of items) {
    const lbl = makeHUDLabel(it.text, it.color);
    lbl.sprite.position.set(...it.pos);
    parent.add(lbl.sprite);
    labels.push(lbl);
  }
  return labels;
}

function makePi5(palette, opts = {}) {
  const wireframe = !!opts.wireframe;
  const root = new THREE.Group();
  root.userData.label = 'RASPBERRY PI 5 · 8GB';

  const pcb = new THREE.Mesh(new THREE.BoxGeometry(PCB_W, PCB_H, PCB_D), palette.pcb);
  pcb.position.y = 0;
  root.add(pcb);

  for (let i = 0; i < 6; i++) {
    const trace = new THREE.Mesh(new THREE.BoxGeometry(PCB_W * 0.7, 0.003, 0.02), palette.pcbTrace);
    trace.position.set(0, PCB_H / 2 + 0.002, -PCB_D / 2 + 0.5 + i * 0.4);
    root.add(trace);
  }

  const holePos = [
    [-PCB_W / 2 + 0.35, -PCB_D / 2 + 0.35],
    [PCB_W / 2 - 0.35, -PCB_D / 2 + 0.35],
    [-PCB_W / 2 + 0.35, PCB_D / 2 - 0.35],
    [PCB_W / 2 - 0.35, PCB_D / 2 - 0.35],
  ];
  for (const [x, z] of holePos) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, PCB_H + 0.005, 24), palette.silver);
    ring.position.set(x, 0, z);
    root.add(ring);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, PCB_H + 0.02, 20), palette.soc);
    hole.position.set(x, 0, z);
    root.add(hole);
  }

  const topY = PCB_H / 2;

  const soc = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 1.6), palette.soc);
  soc.position.set(-0.4, topY + 0.09, -0.2);
  soc.userData.label = 'BCM2712 · ARM CORTEX-A76 @ 2.4GHZ';
  soc.userData.click = 'soc';
  root.add(soc);
  const socEtch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.005, 0.4), palette.silverDull);
  socEtch.position.set(-0.4, topY + 0.18 + 0.001, -0.2);
  root.add(socEtch);

  const ram = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 1.0), palette.chip);
  ram.position.set(0.95, topY + 0.07, -0.2);
  ram.userData.label = 'LPDDR4X · 8GB @ 4267MT/S';
  ram.userData.click = 'ram';
  root.add(ram);

  const rp1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 1.1), palette.chip);
  rp1.position.set(1.4, topY + 0.07, 1.4);
  rp1.userData.label = 'RP1 · I/O CONTROLLER';
  rp1.userData.click = 'rp1';
  root.add(rp1);

  const pmic = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), palette.chip);
  pmic.position.set(-1.6, topY + 0.05, 1.6);
  pmic.userData.label = 'PMIC · POWER MGMT';
  root.add(pmic);

  const wifi = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 1.0), palette.silverDull);
  wifi.position.set(-2.6, topY + 0.09, -1.4);
  wifi.userData.label = 'WIFI 5 · BLUETOOTH 5.0';
  wifi.userData.click = 'wifi';
  root.add(wifi);
  const ant = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.005, 0.6), palette.pcbTrace);
  ant.position.set(-3.7, topY + 0.003, -2.0);
  root.add(ant);

  // USB 3.0 (blue)
  const usbA = new THREE.Group();
  const u1 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.4), palette.silver);
  u1.position.set(0, 0.35, 0);
  usbA.add(u1);
  const u1blue = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.2), palette.usbBlue);
  u1blue.position.set(0.05, 0.35, 0);
  usbA.add(u1blue);
  usbA.position.set(PCB_W / 2 - 0.85, topY, -PCB_D / 2 + 1.1);
  usbA.userData.label = 'USB 3.0 (×2)';
  usbA.userData.click = 'usb3';
  root.add(usbA);

  // USB 2.0 (black)
  const usbB = new THREE.Group();
  const u2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.4), palette.silver);
  u2.position.set(0, 0.35, 0);
  usbB.add(u2);
  const u2black = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.2), palette.capBlack);
  u2black.position.set(0.05, 0.35, 0);
  usbB.add(u2black);
  usbB.position.set(PCB_W / 2 - 0.85, topY, -PCB_D / 2 + 2.7);
  usbB.userData.label = 'USB 2.0 (×2)';
  usbB.userData.click = 'usb2';
  root.add(usbB);

  // Ethernet RJ45
  const eth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 1.6), palette.silver);
  eth.position.set(PCB_W / 2 - 0.85, topY + 0.65, -PCB_D / 2 + 4.4);
  eth.userData.label = 'GIGABIT ETHERNET';
  eth.userData.click = 'eth';
  root.add(eth);
  const ethSlot = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.8, 1.2), palette.capBlack);
  ethSlot.position.set(PCB_W / 2 - 0.78, topY + 0.55, -PCB_D / 2 + 4.4);
  root.add(ethSlot);
  const ethLed1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.18), palette.ledGreen);
  ethLed1.position.set(PCB_W / 2 - 0.05, topY + 1.05, -PCB_D / 2 + 4.0);
  ethLed1.userData.blink = 'eth-link';
  root.add(ethLed1);

  // USB-C power
  const usbc = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.5), palette.silver);
  usbc.position.set(-PCB_W / 2 + 0.45, topY + 0.22, PCB_D / 2 - 0.55);
  usbc.userData.label = 'USB-C POWER · 5V/5A';
  usbc.userData.click = 'power';
  root.add(usbc);

  for (let i = 0; i < 2; i++) {
    const hdmi = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.4, 0.7), palette.silver);
    hdmi.position.set(-PCB_W / 2 + 0.42, topY + 0.2, PCB_D / 2 - 1.6 - i * 1.0);
    hdmi.userData.label = `MICRO HDMI ${i + 1} · 4K@60`;
    hdmi.userData.click = 'hdmi';
    root.add(hdmi);
  }

  const fanHdr = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.18), palette.white);
  fanHdr.position.set(-PCB_W / 2 + 1.7, topY + 0.09, PCB_D / 2 - 0.4);
  root.add(fanHdr);

  // 40-pin GPIO header
  const gpio = new THREE.Group();
  const pinG = new THREE.BoxGeometry(0.07, 0.4, 0.07);
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 20; i++) {
      const pin = new THREE.Mesh(pinG, palette.gold);
      pin.position.set(-PCB_W / 2 + 1.4 + i * 0.18, 0.2, -PCB_D / 2 + 0.45 + r * 0.18);
      gpio.add(pin);
    }
  }
  const gpioBase = new THREE.Mesh(new THREE.BoxGeometry(20 * 0.18 + 0.1, 0.1, 0.46), palette.capBlack);
  gpioBase.position.set(-PCB_W / 2 + 1.4 + 9.5 * 0.18, topY + 0.05, -PCB_D / 2 + 0.45 + 0.09);
  root.add(gpioBase);
  gpio.position.y = topY;
  gpio.userData.label = '40-PIN GPIO HEADER';
  gpio.userData.click = 'gpio';
  root.add(gpio);

  for (let i = 0; i < 18; i++) {
    const w = 0.06 + Math.random() * 0.1;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, w * 0.5), Math.random() > 0.5 ? palette.cap : palette.capBlack);
    cap.position.set((Math.random() - 0.5) * (PCB_W - 1.5), topY + 0.025, (Math.random() - 0.5) * (PCB_D - 1.5));
    cap.rotation.y = Math.random() * Math.PI;
    root.add(cap);
  }

  const pwrLed = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.1), palette.ledRed);
  pwrLed.position.set(-PCB_W / 2 + 0.5, topY + 0.05, -PCB_D / 2 + 1.1);
  pwrLed.userData.blink = 'pwr';
  pwrLed.userData.label = 'PWR LED';
  root.add(pwrLed);
  const actLed = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.1), palette.ledGreen);
  actLed.position.set(-PCB_W / 2 + 0.5, topY + 0.05, -PCB_D / 2 + 1.4);
  actLed.userData.blink = 'act';
  actLed.userData.label = 'ACT LED';
  root.add(actLed);

  const sd = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 1.6), palette.silverDull);
  sd.position.set(PCB_W / 2 - 0.7, -PCB_H / 2 - 0.09, 0);
  sd.userData.label = 'MICROSD SLOT';
  sd.userData.click = 'sd';
  root.add(sd);

  for (let i = 0; i < 2; i++) {
    const csi = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 1.4), palette.capBlack);
    csi.position.set(0.6 + i * 0.6, topY + 0.09, 0.95);
    csi.userData.label = i === 0 ? 'DISPLAY 0 (DSI)' : 'CAMERA 1 (CSI)';
    root.add(csi);
  }

  if (wireframe) {
    root.traverse((o) => {
      if (o.isMesh) {
        const m = o.material.clone();
        m.wireframe = true;
        m.emissive = new THREE.Color(0x44ff88);
        m.emissiveIntensity = 0.3;
        m.color = new THREE.Color(0x44ff88);
        m.transparent = true;
        m.opacity = 0.4;
        o.material = m;
      }
    });
  }

  return root;
}

// === setup helpers ===
function setupScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(8, 7, 9);
  camera.lookAt(0, 0, 0);

  const amb = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(6, 10, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88ddff, 0.35);
  fill.position.set(-8, 4, -4);
  scene.add(fill);
  const accent = new THREE.PointLight(0x66ff99, 0.8, 18);
  accent.position.set(0, 4, 0);
  scene.add(accent);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  return { renderer, scene, camera, ro };
}

// === Pimoroni Enviro indoor HAT ===
const HAT_W = 6.5;
const HAT_D = 3.0;
const HAT_H = 0.16;
const HAT_LIFT = 1.1;

function makeEnviroHAT(palette, opts = {}) {
  const wireframe = !!opts.wireframe;
  const root = new THREE.Group();
  root.userData.label = 'PIMORONI ENVIRO · INDOOR HAT';

  const pcbHat = new THREE.MeshStandardMaterial({ color: 0x1d5fc4, roughness: 0.55, metalness: 0.1 });
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(HAT_W, HAT_H, HAT_D), pcbHat);
  root.add(pcb);

  const silk = new THREE.MeshStandardMaterial({ color: 0xf2e8d8, roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.004, 0.025), silk);
    line.position.set(-1.6, HAT_H / 2 + 0.003, -HAT_D / 2 + 0.15 + i * 0.1);
    root.add(line);
  }

  const holes = [
    [-HAT_W / 2 + 0.25, -HAT_D / 2 + 0.25],
    [HAT_W / 2 - 0.25, -HAT_D / 2 + 0.25],
    [-HAT_W / 2 + 0.25, HAT_D / 2 - 0.25],
    [HAT_W / 2 - 0.25, HAT_D / 2 - 0.25],
  ];
  for (const [x, z] of holes) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, HAT_H + 0.005, 20), palette.silver);
    ring.position.set(x, 0, z);
    root.add(ring);
  }

  const femHeader = new THREE.Mesh(new THREE.BoxGeometry(20 * 0.18 + 0.2, 0.7, 0.55), palette.capBlack);
  femHeader.position.set(0.5, -HAT_H / 2 - 0.35, HAT_D / 2 - 0.6);
  femHeader.userData.label = '40-PIN FEMALE HEADER';
  femHeader.userData.click = 'header';
  root.add(femHeader);
  for (let i = 0; i < 20; i++) {
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), palette.gold);
    dot.position.set(0.5 - 1.8 + i * 0.18, -HAT_H / 2 - 0.02, HAT_D / 2 - 0.6);
    root.add(dot);
  }

  const lcdBezel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.3), palette.capBlack);
  lcdBezel.position.set(-1.4, HAT_H / 2 + 0.06, 0.2);
  lcdBezel.userData.label = '0.96" SPI COLOUR LCD';
  lcdBezel.userData.click = 'lcd';
  root.add(lcdBezel);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x0a4a52, emissive: 0x4ad6c2, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.2 });
  const screen = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.02, 1.0), screenMat);
  screen.position.set(-1.4, HAT_H / 2 + 0.13, 0.2);
  root.add(screen);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xe9fff8, emissive: 0xe9fff8, emissiveIntensity: 1.6 });
  for (let i = 0; i < 4; i++) {
    const w = 0.5 + Math.random() * 1.2;
    const ln = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, 0.06), lineMat);
    ln.position.set(-1.4 - 1.0 + w / 2 + 0.15, HAT_H / 2 + 0.14, 0.2 - 0.35 + i * 0.18);
    root.add(ln);
  }

  const bme = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), palette.chip);
  bme.position.set(1.5, HAT_H / 2 + 0.05, -0.5);
  bme.userData.label = 'BME688 · TEMP / HUM / PRES / GAS';
  bme.userData.click = 'bme688';
  root.add(bme);
  const bmeHole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), palette.silver);
  bmeHole.position.set(1.5, HAT_H / 2 + 0.115, -0.5);
  root.add(bmeHole);

  const ltr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), palette.chip);
  ltr.position.set(2.4, HAT_H / 2 + 0.04, -0.5);
  ltr.userData.label = 'LTR-559 · LIGHT & PROXIMITY';
  ltr.userData.click = 'ltr559';
  root.add(ltr);
  const ltrEye = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.2, metalness: 0.8, emissive: 0x8888ff, emissiveIntensity: 0.4 })
  );
  ltrEye.position.set(2.4, HAT_H / 2 + 0.09, -0.5);
  root.add(ltrEye);

  const micBody = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.3), palette.silverDull);
  micBody.position.set(1.5, HAT_H / 2 + 0.04, 0.5);
  micBody.userData.label = 'MEMS MICROPHONE · I²S';
  micBody.userData.click = 'mic';
  root.add(micBody);
  const micPort = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), palette.capBlack);
  micPort.position.set(1.5, HAT_H / 2 + 0.085, 0.5);
  root.add(micPort);

  const btnPos = [
    [-HAT_W / 2 + 0.5, -HAT_D / 2 + 0.6, 'A'],
    [-HAT_W / 2 + 0.5, HAT_D / 2 - 0.6, 'B'],
    [HAT_W / 2 - 0.5, -HAT_D / 2 + 0.6, 'X'],
    [HAT_W / 2 - 0.5, HAT_D / 2 - 0.6, 'Y'],
  ];
  for (const [x, z, name] of btnPos) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), palette.silverDull);
    base.position.set(x, HAT_H / 2 + 0.05, z);
    base.userData.label = `BUTTON ${name}`;
    base.userData.click = 'btn';
    root.add(base);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16), palette.capBlack);
    cap.position.set(x, HAT_H / 2 + 0.12, z);
    root.add(cap);
  }

  for (let i = 0; i < 10; i++) {
    const w = 0.05 + Math.random() * 0.07;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, w * 0.5), Math.random() > 0.5 ? palette.cap : palette.capBlack);
    cap.position.set((Math.random() - 0.5) * (HAT_W - 1.5), HAT_H / 2 + 0.02, (Math.random() - 0.5) * (HAT_D - 1.5));
    cap.rotation.y = Math.random() * Math.PI;
    root.add(cap);
  }

  if (wireframe) {
    root.traverse((o) => {
      if (o.isMesh && o.material) {
        const m = o.material.clone();
        m.wireframe = true;
        m.transparent = true;
        m.opacity = 0.55;
        m.emissive = new THREE.Color(0xffb347);
        m.emissiveIntensity = 0.5;
        m.color = new THREE.Color(0xffc56e);
        o.material = m;
      }
    });
  }

  return root;
}

const ENVIRO_FLOWS = [
  { color: 0x9cf3a8, points: [[3.6, 1.5, -2.0], [2.0, 1.5, -2.0], [0.0, 0.5, -1.2], [-0.4, 0.42, -0.2]], speed: 0.9, count: 4, label: 'I²C BME' },
  { color: 0xffe66c, points: [[4.5, 1.5, -2.0], [2.4, 1.5, -2.0], [0.4, 0.5, -1.2], [-0.4, 0.42, -0.2]], speed: 0.8, count: 3, label: 'I²C LIGHT' },
  { color: 0xff7ac6, points: [[3.6, 1.5, -1.0], [1.8, 1.5, -0.6], [0.2, 0.42, -0.3], [-0.4, 0.42, -0.2]], speed: 1.3, count: 5, label: 'I²S MIC' },
  { color: 0x6cc5ff, points: [[-0.4, 0.42, -0.2], [-0.8, 0.6, -1.0], [-1.4, 1.4, -0.8], [-1.4, 1.55, 0.0]], speed: 1.1, count: 4, label: 'SPI LCD' },
];

function addEnviroFlow(parent) {
  const flows = [];
  for (const p of ENVIRO_FLOWS) {
    const curve = new THREE.CatmullRomCurve3(p.points.map((c) => new THREE.Vector3(...c)));
    const mats = makeFlowMaterials(p.color);
    const linePoints = curve.getPoints(80);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    parent.add(new THREE.Line(lineGeo, mats.line));
    const dotGeo = new THREE.SphereGeometry(0.07, 12, 12);
    const haloMat = makeHaloSprite(p.color);
    const dots = [];
    for (let i = 0; i < p.count; i++) {
      const dot = new THREE.Mesh(dotGeo, mats.dot);
      const halo = new THREE.Sprite(haloMat);
      halo.scale.set(0.5, 0.5, 1);
      dot.add(halo);
      parent.add(dot);
      dots.push({ mesh: dot, halo, offset: i / p.count });
    }
    flows.push({ curve, dots, speed: p.speed });
  }
  return flows;
}

// enviro telemetry labels — ORDER MATTERS, it maps to reading fields in
// formatTelemetry(): [0] temp, [1] humidity, [2] light, [3] noise, [4] pressure.
function addEnviroHUDLabels(parent) {
  const items = [
    { text: '—', pos: [1.5, 2.3, -2.4], color: '#a3f3a3' }, // temperatureC
    { text: '—', pos: [1.5, 2.7, -2.4], color: '#a3f3a3' }, // humidityPct
    { text: '—', pos: [3.4, 2.3, -2.4], color: '#ffe66c' }, // lightLux
    { text: '—', pos: [3.4, 2.7, -1.0], color: '#ff7ac6' }, // noiseLevel
    { text: '—', pos: [-0.2, 2.7, -2.4], color: '#a3f3a3' }, // pressureHpa
  ];
  const labels = [];
  for (const it of items) {
    const lbl = makeHUDLabel(it.text, it.color);
    lbl.sprite.position.set(...it.pos);
    parent.add(lbl.sprite);
    labels.push(lbl);
  }
  return labels;
}

// Map a reading to the 5 enviro label strings, in the order above. Missing
// fields render as "—". noiseLevel is shown raw (unit unconfirmed — see plan).
function formatTelemetry(reading) {
  const r = reading || {};
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  return [
    num(r.temperatureC) ? `${r.temperatureC.toFixed(1)}°C` : '—',
    num(r.humidityPct) ? `${Math.round(r.humidityPct)}% RH` : '—',
    num(r.lightLux) ? `${Math.round(r.lightLux)} LUX` : '—',
    num(r.noiseLevel) ? `${r.noiseLevel.toFixed(2)}` : '—',
    num(r.pressureHpa) ? `${Math.round(r.pressureHpa)} HPA` : '—',
  ];
}

// === public factory ===
export function initTwin(canvas, opts = {}) {
  const palette = pal();
  const { renderer, scene, camera, ro } = setupScene(canvas);

  const state = {
    variant: opts.variant === 'server' ? 'server' : 'enviro',
    wire: opts.wire !== false,
    flow: opts.flow !== false,
    hud: opts.hud !== false,
    rotate: opts.autoRotate !== false,
  };

  let board = null;
  let flows = [];
  let hudLabels = []; // current label handles ({ sprite, setText })
  let lastReading = null; // replayed onto enviro HUD after each rebuild

  function disposeBoard() {
    if (!board) return;
    scene.remove(board);
    board.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }

  function build() {
    disposeBoard();
    board = new THREE.Group();
    board.rotation.x = -0.3;

    const pi = makePi5(palette, { wireframe: state.wire });
    board.add(pi);

    if (state.variant === 'enviro') {
      const hat = makeEnviroHAT(palette, { wireframe: state.wire });
      hat.position.set(-1.67, HAT_LIFT, -1.3);
      board.add(hat);
      flows = addEnviroFlow(board);
      hudLabels = addEnviroHUDLabels(board);
    } else {
      flows = addDataFlow(board);
      hudLabels = addHUDLabels(board);
    }

    flows.forEach((f) => f.dots.forEach((d) => (d.mesh.visible = state.flow)));
    hudLabels.forEach((l) => (l.sprite.visible = state.hud));

    scene.add(board);

    // re-apply the latest live reading so a variant/wire toggle doesn't reset
    // the enviro HUD back to placeholder "—".
    applyReading();
  }

  function applyReading() {
    if (state.variant !== 'enviro' || !lastReading) return;
    const text = formatTelemetry(lastReading);
    hudLabels.forEach((l, i) => l.setText(text[i] ?? '—'));
  }

  build();

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 20;
  controls.autoRotate = state.rotate;
  controls.autoRotateSpeed = 0.5;
  controls.target.set(0, 0, 0);

  // raycast for hover/click -> callbacks (React owns the tooltip DOM)
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(ev) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(board, true);
    for (const h of hits) {
      let n = h.object;
      while (n && !n.userData?.label && n.parent) n = n.parent;
      if (n && n.userData?.label) return n;
    }
    return null;
  }

  function onPointerMove(ev) {
    const n = pick(ev);
    const rect = canvas.getBoundingClientRect();
    if (n) {
      canvas.style.cursor = 'pointer';
      opts.onHover?.(n.userData.label, ev.clientX - rect.left, ev.clientY - rect.top);
    } else {
      canvas.style.cursor = 'grab';
      opts.onHover?.(null, 0, 0);
    }
  }
  function onPointerLeave() {
    opts.onHover?.(null, 0, 0);
  }
  function onClick(ev) {
    const n = pick(ev);
    if (n && n.userData.click) opts.onPick?.(n.userData.click, n.userData.label);
  }
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('click', onClick);

  // animation loop
  let rafId = 0;
  let disposed = false;
  const t0 = performance.now();
  function loop() {
    if (disposed) return;
    const t = (performance.now() - t0) / 1000;
    controls.update();
    board.traverse((o) => {
      if (o.userData?.blink && o.material) {
        const v =
          o.userData.blink === 'act'
            ? 0.6 + Math.abs(Math.sin(t * 4)) * 1.8
            : o.userData.blink === 'eth-link'
              ? 0.4 + Math.abs(Math.sin(t * 6)) * 1.4
              : 1.4 + Math.sin(t * 1.2) * 0.2;
        o.material.emissiveIntensity = v;
      }
    });
    flows.forEach((f) => {
      f.dots.forEach((d) => {
        const u = ((t * f.speed * 0.25) + d.offset) % 1;
        d.mesh.position.copy(f.curve.getPointAt(u));
        d.mesh.material.emissiveIntensity = 1.8 + Math.sin(t * 8 + d.offset * 6) * 0.6;
      });
    });
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(loop);
  }
  loop();

  return {
    setReadings(reading) {
      lastReading = reading;
      applyReading();
    },
    setVariant(v) {
      if (v !== 'server' && v !== 'enviro') return;
      if (v === state.variant) return;
      state.variant = v;
      build();
    },
    setWire(on) {
      state.wire = !!on;
      build();
    },
    setFlow(on) {
      state.flow = !!on;
      flows.forEach((f) => f.dots.forEach((d) => (d.mesh.visible = state.flow)));
    },
    setHUD(on) {
      state.hud = !!on;
      hudLabels.forEach((l) => (l.sprite.visible = state.hud));
    },
    setAutoRotate(on) {
      state.rotate = !!on;
      controls.autoRotate = state.rotate;
    },
    reset() {
      camera.position.set(8, 7, 9);
      controls.target.set(0, 0, 0);
      controls.update();
    },
    getVariant() {
      return state.variant;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onClick);
      controls.dispose();
      disposeBoard();
      renderer.dispose();
    },
  };
}
