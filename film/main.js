import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ───────────── helpers ───────────── */
const W = 1920, H = 1080, DUR = 60;
const qs = new URLSearchParams(location.search);
const SCALE = +(qs.get('s') || 1);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const p = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, x) => a + (b - a) * x;
const eo = x => 1 - Math.pow(1 - x, 3);
const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const ei = x => x * x * x;
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const vis = (t, a, b, fi = .5, fo = .35) => eo(p(t, a, a + fi)) * (1 - eo(p(t, b - fo, b)));
const $ = (tag, cls, html, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || ui).appendChild(e); return e; };
const set = (el, o, dy = 0, extra = '') => {
  el.style.opacity = o.toFixed(3); el.style.visibility = o < .004 ? 'hidden' : 'visible';
  el.style.transform = `translate3d(0,${dy.toFixed(2)}px,0) ${extra}`;
};
const ui = document.getElementById('ui');
const svg = document.getElementById('lines');
const C = { green: [.5, 1.9, .05], cyan: [.2, 1.3, 1.9], violet: [.9, .6, 2.2], amber: [2.2, 1.1, .3], white: [1.6, 1.8, 2.1] };
const hdr = (c, k = 1) => new THREE.Color().setRGB(c[0] * k, c[1] * k, c[2] * k);

/* chapters */
const T = [0, 4.5, 13, 21.5, 28, 36, 47.5, 53, 60];
const OUTRO = 57.3;

/* ───────────── renderer ───────────── */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(SCALE); renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060b);
scene.fog = new THREE.FogExp2(0x04060b, 0.014);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 300);
scene.add(new THREE.AmbientLight(0x8899cc, 0.35));
const sun = new THREE.DirectionalLight(0xcfe0ff, 1.6); sun.position.set(6, 12, 8); scene.add(sun);

const rt = new THREE.WebGLRenderTarget(W * SCALE, H * SCALE, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(SCALE); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* camera path (Catmull-Rom over keys [t,[pos],[target]]) */
const cr = (a, b, c, d, s) => .5 * ((2 * b) + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (-a + 3 * b - 3 * c + d) * s * s * s);
const _tg = new THREE.Vector3();
function path(keys, lt) {
  let i = 0; while (i < keys.length - 2 && lt > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(i - 1, 0)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(i + 2, keys.length - 1)];
  const s = clamp((lt - k1[0]) / (k2[0] - k1[0]));
  const v = a => [0, 1, 2].map(c => cr(k0[a][c], k1[a][c], k2[a][c], k3[a][c], s));
  camera.position.fromArray(v(1)); _tg.fromArray(v(2)); camera.lookAt(_tg);
}
const _v = new THREE.Vector3();
function project(group, arr) {
  _v.fromArray(arr); if (group) _v.applyMatrix4(group.matrixWorld); _v.project(camera);
  return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H, ok: _v.z < 1 && _v.z > -1 };
}

const mStd = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .45, metalness: .5, ...o });
const mGlow = (c, k = 1, o = {}) => new THREE.MeshBasicMaterial({ color: hdr(c, k), ...o });
const dummy = new THREE.Object3D();
const G = [];
for (let i = 0; i < 8; i++) { G[i] = new THREE.Group(); scene.add(G[i]); }

const sprite = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#fff'); g.addColorStop(.35, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
/* dust everywhere */
{
  const n = 2600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (hash(i) - .5) * 90; pos[i * 3 + 1] = hash(i + .3) * 34 - 6; pos[i * 3 + 2] = (hash(i + .7) - .5) * 90; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var dust = new THREE.Points(g, new THREE.PointsMaterial({ map: sprite, color: 0x6f8fd0, size: .13, transparent: true, opacity: .55, depthWrite: false }));
  scene.add(dust);
}

/* ───────────── stack tower (intro + outro) ───────────── */
const TOWER_COL = [C.green, C.green, [.3, 1.7, .9], C.cyan, [.4, .9, 2.2], C.violet, C.white];
function makeTower() {
  const g = new THREE.Group(), slabs = [];
  for (let k = 0; k < 7; k++) {
    const s = new THREE.Group();
    const box = new THREE.BoxGeometry(3.4, .2, 3.4);
    s.add(new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: .3, metalness: .7, transparent: true, opacity: .82 })));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: hdr(TOWER_COL[k]) }));
    s.add(e); s.userData.e = e; s.userData.c = TOWER_COL[k];
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.1), new THREE.MeshBasicMaterial({ color: hdr(TOWER_COL[k], .25), transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
    pl.rotation.x = -Math.PI / 2; pl.position.y = .11; s.add(pl); s.userData.pl = pl;
    g.add(s); slabs.push(s);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 7, 8), mGlow(C.white, 1.2));
  beam.position.y = 2.6; g.add(beam);
  g.userData = { slabs, beam };
  return g;
}
function updTower(g, t, build, lit) { // build 0..1 assemble, lit = number of slabs lit (float)
  g.userData.slabs.forEach((s, k) => {
    const a = eo(p(build, k * .1, k * .1 + .4));
    s.position.set(0, k * .85 + (1 - a) * 7, 0); s.rotation.y = (1 - a) * 1.2;
    s.visible = a > .01;
    const on = clamp(lit - k), pulse = .75 + .25 * Math.sin(t * 2.4 - k * .8);
    s.userData.e.material.color.copy(hdr(s.userData.c, (.12 + on * 1.25) * pulse));
    s.userData.pl.material.opacity = .05 + .4 * on * pulse;
  });
  g.userData.beam.scale.y = clamp(lit / 7, .001, 1); g.userData.beam.position.y = clamp(lit / 7, .001, 1) * 2.6;
}
const tower0 = makeTower(); G[0].add(tower0);
const tower7 = makeTower(); G[7].add(tower7);

/* ───────────── 01 data center ───────────── */
const DC = {};
{
  const g = G[1];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mStd(0x05080e, { roughness: .28, metalness: .85 }));
  floor.rotation.x = -Math.PI / 2; g.add(floor);
  const grid = new THREE.GridHelper(120, 96, 0x1c3350, 0x0d1a2c); grid.position.y = .01; g.add(grid);
  const ROWS = 6, COLS = 14, N = ROWS * COLS;
  const racks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 2.4, 1.3), mStd(0x0c1018, { roughness: .35, metalness: .75 }), N);
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(.03, 2.2, .02), mGlow(C.cyan, .45), N * 2);
  const LED = 24, leds = new THREE.InstancedMesh(new THREE.PlaneGeometry(.15, .045), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N * LED);
  DC.leds = leds; DC.ledInfo = [];
  let n = 0, l = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++, n++) {
    const x = (c - 6.5) * 1.25, z = (r - 2.5) * 4.2, f = r % 2 ? -1 : 1;
    dummy.position.set(x, 1.2, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); racks.setMatrixAt(n, dummy.matrix);
    for (const sx of [-.5, .5]) { dummy.position.set(x + sx, 1.2, z + f * .665); dummy.updateMatrix(); strips.setMatrixAt(n * 2 + (sx > 0 ? 1 : 0), dummy.matrix); }
    for (let i = 0; i < LED; i++, l++) {
      dummy.position.set(x + ((i % 3) - 1) * .27, .35 + Math.floor(i / 3) * .25, z + f * .662); dummy.updateMatrix(); leds.setMatrixAt(l, dummy.matrix);
      const h = hash(l * 1.37); DC.ledInfo.push({ c: h < .7 ? C.green : h < .93 ? C.cyan : C.amber, f: 1.5 + hash(l + 9) * 7, o: hash(l + 5) * 10 });
    }
  }
  g.add(racks, strips, leds);
  // overhead cooling pipes + pulses
  DC.pulses = [];
  const pipeGeo = new THREE.CylinderGeometry(.07, .07, 19, 10); pipeGeo.rotateZ(Math.PI / 2);
  const pg = new THREE.SphereGeometry(.11, 10, 8);
  for (let r = 0; r < ROWS; r++) for (const [dz, col, dir] of [[-.28, [.15, .7, 2.4], 1], [.28, [2.2, .55, .2], -1]]) {
    const z = (r - 2.5) * 4.2 + dz;
    const pipe = new THREE.Mesh(pipeGeo, new THREE.MeshStandardMaterial({ color: 0x0c1220, emissive: hdr(col, .22), roughness: .3, metalness: .8 }));
    pipe.position.set(0, 2.95, z); g.add(pipe);
    for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(pg, mGlow(col, .9)); m.scale.set(2.6, 1, 1); g.add(m); DC.pulses.push({ m, z, y: 2.95, dir, o: k / 6 + hash(r * 7 + k) * .1, sp: .16, len: 19, axis: 'x' }); }
  }
  // fibre trays across rows
  const fg = new THREE.BoxGeometry(.03, .03, 26);
  const fp = new THREE.BoxGeometry(.05, .05, .9);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 2.6; const tray = new THREE.Mesh(fg, mGlow(C.cyan, .12)); tray.position.set(x, 3.5, 0); g.add(tray);
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(fp, mGlow(C.white, 1.0)); g.add(m); DC.pulses.push({ m, x, y: 3.5, dir: i % 2 ? 1 : -1, o: k / 4 + hash(i * 3 + k) * .2, sp: .55, len: 26, axis: 'z' }); }
  }
  const l1 = new THREE.PointLight(0x38c8ff, 8, 30); l1.position.set(0, 4, 0); g.add(l1);
}
function updDC(lt, t) {
  const col = new THREE.Color();
  DC.ledInfo.forEach((L, i) => {
    const on = hash(i * .731 + Math.floor(t * L.f + L.o) * 3.17) > .32 ? .85 : .05;
    DC.leds.setColorAt(i, col.setRGB(L.c[0] * on, L.c[1] * on, L.c[2] * on));
  });
  DC.leds.instanceColor.needsUpdate = true;
  for (const P of DC.pulses) {
    const u = ((t * P.sp + P.o) % 1 + 1) % 1, s = (P.dir > 0 ? u : 1 - u) * P.len - P.len / 2;
    if (P.axis === 'x') P.m.position.set(s, P.y, P.z); else P.m.position.set(P.x, P.y, s);
  }
  path([[0, [21, 19, 29], [0, 1, 0]], [3.4, [-15, 4.4, 2.2], [0, 1.6, 0]], [6.6, [-5.5, 1.75, 0], [8, 1.7, 0]], [7.7, [-1, 1.7, 0], [12, 1.7, 0]], [8.5, [8.5, 1.6, 0], [20, 1.6, 0]]], lt);
}

/* ───────────── 02 GPU ───────────── */
const GP = {};
{
  const g = G[2];
  const board = new THREE.Mesh(new THREE.BoxGeometry(10, .16, 5.8), mStd(0x07140e, { roughness: .55, metalness: .35 })); g.add(board);
  // traces
  const tp = [];
  for (let i = 0; i < 150; i++) {
    const a = hash(i) * Math.PI * 2, r0 = 1.7 + hash(i + 2) * .3, r1 = 2.4 + hash(i + 4) * 2.4;
    let x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0, x1 = clamp(Math.cos(a) * r1, -4.8, 4.8), z1 = clamp(Math.sin(a) * r1 * .6, -2.7, 2.7);
    tp.push(x0, .085, z0, x1, .085, z0, x1, .085, z0, x1, .085, z1);
  }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  g.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(.55, .42, .12), transparent: true, opacity: .55 })));
  const sub = new THREE.Mesh(new THREE.BoxGeometry(3.4, .1, 3.0), mStd(0x16261d, { roughness: .5 })); sub.position.y = .13; g.add(sub);
  const die = new THREE.Mesh(new THREE.BoxGeometry(2.0, .09, 2.0), mStd(0x0b0e13, { roughness: .18, metalness: .95 })); die.position.set(0, .225, 0); g.add(die);
  const NC = 30; GP.NC = NC;
  GP.cores = new THREE.InstancedMesh(new THREE.BoxGeometry(.048, .02, .048), new THREE.MeshBasicMaterial(), NC * NC);
  for (let i = 0; i < NC * NC; i++) { dummy.position.set(((i % NC) - (NC - 1) / 2) * (1.9 / NC), .282, (Math.floor(i / NC) - (NC - 1) / 2) * (1.9 / NC)); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); GP.cores.setMatrixAt(i, dummy.matrix); }
  g.add(GP.cores);
  // HBM stacks
  GP.hbm = [];
  const hg = new THREE.BoxGeometry(.4, .16, .44);
  for (const sx of [-1.38, 1.38]) for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(hg, mStd(0x141024, { roughness: .25, metalness: .9 })); m.position.set(sx, .26, (k - 1.5) * .58); g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(hg), new THREE.LineBasicMaterial({ color: hdr(C.violet) })); e.position.copy(m.position); g.add(e); GP.hbm.push(e);
  }
  // VRM, caps, connector
  const vr = new THREE.InstancedMesh(new THREE.BoxGeometry(.34, .26, .34), mStd(0x24282f, { roughness: .4, metalness: .8 }), 60);
  let n = 0;
  for (const z of [-2.35, 2.35]) for (let i = 0; i < 17; i++) { dummy.position.set(-4 + i * .5, .21, z); dummy.updateMatrix(); vr.setMatrixAt(n++, dummy.matrix); }
  for (const x of [-4.2, -3.6, 3.6, 4.2]) for (let i = 0; i < 6; i++) { dummy.position.set(x, .21, -1.4 + i * .56); dummy.updateMatrix(); vr.setMatrixAt(n++, dummy.matrix); }
  vr.count = n; g.add(vr);
  const con = new THREE.Mesh(new THREE.BoxGeometry(6.4, .05, .32), new THREE.MeshStandardMaterial({ color: 0x8a6a1c, emissive: 0x3a2a05, roughness: .3, metalness: 1 })); con.position.set(0, .09, 2.72); g.add(con);
  // cold plate
  GP.plate = new THREE.Group();
  const pm = new THREE.Mesh(new THREE.BoxGeometry(3.7, .3, 3.3), mStd(0xaab6c0, { roughness: .22, metalness: 1 })); GP.plate.add(pm);
  const tgz = new THREE.CylinderGeometry(.13, .13, 3.4, 14); tgz.rotateZ(Math.PI / 2);
  for (const [z, col] of [[-.8, [.15, .7, 2.4]], [.8, [2.2, .55, .2]]]) {
    const tb = new THREE.Mesh(tgz, new THREE.MeshStandardMaterial({ color: 0x10151f, emissive: hdr(col, .5), roughness: .3, metalness: .7 })); tb.position.set(3.4, .05, z); GP.plate.add(tb);
  }
  g.add(GP.plate);
  GP.light = new THREE.PointLight(0x8fe000, 0, 9); GP.light.position.set(0, 1.2, 0); g.add(GP.light);
}
function updGPU(lt, t) {
  const lift = eio(p(lt, 1.3, 3.1)); GP.plate.position.y = .46 + lift * 2.0;
  const col = new THREE.Color(), NC = GP.NC, pow = eo(p(lt, 2.2, 4));
  for (let i = 0; i < NC * NC; i++) {
    const x = (i % NC) / NC - .5, z = Math.floor(i / NC) / NC - .5, d = Math.hypot(x, z);
    const w = Math.pow(Math.max(0, Math.sin(d * 22 - t * 6 + Math.sin(x * 9 + t) * 1.2)), 2);
    const f = hash(i * 1.13 + Math.floor(t * 9) * .77) > .45 ? 1 : .25;
    const I = (.05 + pow * (w * .75 + .16) * f) * .8;
    GP.cores.setColorAt(i, col.setRGB(C.green[0] * I, C.green[1] * I, C.green[2] * I));
  }
  GP.cores.instanceColor.needsUpdate = true;
  GP.hbm.forEach((e, k) => e.material.color.copy(hdr(C.violet, .35 + pow * (.6 + .5 * Math.sin(t * 7 + k * 1.3)))));
  GP.light.intensity = pow * 5;
  path([[0, [8, 6.4, 9], [0, .4, 0]], [3, [6.2, 4.4, 6.8], [0, .6, 0]], [6.2, [-5.4, 4.3, 6.4], [0, .8, 0]], [7.6, [-2.6, 2.6, 3.2], [0, .4, 0]], [8.5, [-.25, .62, .4], [0, .25, 0]]], lt);
}

/* ───────────── 03 CUDA ───────────── */
const CU = {};
{
  const g = G[3]; g.position.set(-1.2, 0, 0);
  CU.cols = [C.violet, [.4, .9, 2.2], C.cyan, [.3, 1.7, .9], C.green];
  CU.slabs = [];
  const box = new THREE.BoxGeometry(6, .2, 3.6);
  for (let k = 0; k < 5; k++) {
    const s = new THREE.Group();
    const m = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x0a101b, roughness: .25, metalness: .6, transparent: true, opacity: .5, depthWrite: false }));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: hdr(CU.cols[k], 1.1) }));
    s.add(m, e); s.userData.e = e; g.add(s); CU.slabs.push(s);
  }
  const NP = 256; CU.NP = NP;
  CU.parts = new THREE.InstancedMesh(new THREE.SphereGeometry(.055, 8, 6), new THREE.MeshBasicMaterial(), NP * 2);
  g.add(CU.parts);
  CU.cells = new THREE.InstancedMesh(new THREE.BoxGeometry(.26, .03, .15), new THREE.MeshBasicMaterial(), NP);
  for (let j = 0; j < NP; j++) { dummy.position.set(((j % 16) + .5) / 16 * 5.4 - 2.7, .12, (Math.floor(j / 16) + .5) / 16 * 3.1 - 1.55); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); CU.cells.setMatrixAt(j, dummy.matrix); }
  g.add(CU.cells);
  CU.y = k => 4.6 - k * 1.15;
  CU.pos = (j, k, out) => { const a = (j % 16) >> (4 - k), b = Math.floor(j / 16) >> (4 - k), n = 1 << k; out.set((a + .5) / n * 5.4 - 2.7, CU.y(k), (b + .5) / n * 3.1 - 1.55); };
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function updCUDA(lt, t) {
  CU.slabs.forEach((s, k) => {
    const a = eo(p(lt, .25 + (4 - k) * .16, 1.1 + (4 - k) * .16));
    s.position.set(0, CU.y(k) + (1 - a) * 5, 0); s.visible = a > .01;
    s.userData.e.material.color.copy(hdr(CU.cols[k], .5 + .7 * a));
  });
  const col = new THREE.Color(); let land = 0;
  for (let w = 0; w < 2; w++) {
    const u = ((lt - 1.5) / 2.3 + w * .5), cyc = u - Math.floor(u), act = lt > 1.5 + w * 1.15 ? 1 : 0;
    const f = clamp(cyc * 1.25) * 4, k0 = Math.min(3, Math.floor(f)), s = eio(f - k0);
    if (w === 0 || true) land = Math.max(land, act * (1 - clamp((cyc - .8) / .2)) * (cyc > .8 ? 1 : 0), act * p(cyc, .72, .8) * (cyc <= .8 ? 1 : 0));
    const c0 = CU.cols[k0], c1 = CU.cols[k0 + 1];
    for (let j = 0; j < CU.NP; j++) {
      CU.pos(j, k0, _a); CU.pos(j, k0 + 1, _b); _a.lerp(_b, s);
      dummy.position.copy(_a); dummy.scale.setScalar(act * (f >= 4 ? 0 : 1)); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      CU.parts.setMatrixAt(w * CU.NP + j, dummy.matrix);
      CU.parts.setColorAt(w * CU.NP + j, col.setRGB(lerp(c0[0], c1[0], s) * 1.2, lerp(c0[1], c1[1], s) * 1.2, lerp(c0[2], c1[2], s) * 1.2));
    }
  }
  CU.parts.instanceMatrix.needsUpdate = true; CU.parts.instanceColor.needsUpdate = true;
  for (let j = 0; j < CU.NP; j++) {
    const I = .04 + land * (.25 + .5 * hash(j + Math.floor(t * 12) * .37));
    CU.cells.setColorAt(j, col.setRGB(C.green[0] * I, C.green[1] * I, C.green[2] * I));
  }
  CU.cells.instanceColor.needsUpdate = true; CU.cells.position.y = CU.slabs[4].position.y;
  path([[0, [.6, 9, 3.5], [-1.2, 2, 0]], [1.6, [6.5, 6.4, 13], [-3.6, 1.7, 0]], [4.5, [9, 5.4, 12], [-3.6, 1.6, 0]], [6.5, [10.6, 4.8, 10.6], [-3.5, 1.6, 0]]], lt);
}

/* ───────────── 04/05 model ───────────── */
const MD = {};
{
  const g = G[4];
  const L = 10, NZ = 6, NY = 4, NN = NZ * NY; MD.L = L; MD.NN = NN;
  MD.node = (l, i, out) => out.set((l - (L - 1) / 2) * 1.55, ((i % NY) - (NY - 1) / 2) * .78, (Math.floor(i / NY) - (NZ - 1) / 2) * .82);
  MD.nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(.085, 12, 10), new THREE.MeshBasicMaterial(), L * NN);
  for (let l = 0; l < L; l++) for (let i = 0; i < NN; i++) { MD.node(l, i, dummy.position); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); MD.nodes.setMatrixAt(l * NN + i, dummy.matrix); }
  g.add(MD.nodes);
  const K = 5, pos = [], seg = []; MD.seg = seg;
  for (let l = 0; l < L - 1; l++) for (let i = 0; i < NN; i++) for (let k = 0; k < K; k++) {
    const j = Math.floor(hash(l * 97 + i * 13 + k * 5.3) * NN);
    MD.node(l, i, _a); MD.node(l + 1, j, _b); pos.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z); seg.push({ l, w: hash(l * 31 + i * 7 + k) });
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  MD.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(MD.lines);
  MD.panels = [];
  const pg = new THREE.PlaneGeometry(5.6, 3.6); pg.rotateY(Math.PI / 2);
  for (let l = 0; l < L; l++) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(pg), new THREE.LineBasicMaterial({ color: hdr(C.cyan, .3) })); e.position.x = (l - (L - 1) / 2) * 1.55; g.add(e); MD.panels.push(e);
  }
  const n = 16000, pp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = hash(i) * Math.PI * 2, b = Math.acos(2 * hash(i + .5) - 1), r = 7 + Math.pow(hash(i + .9), 1.6) * 10;
    pp[i * 3] = Math.sin(b) * Math.cos(a) * r * 1.5; pp[i * 3 + 1] = Math.cos(b) * r * .62; pp[i * 3 + 2] = -Math.abs(Math.sin(b) * Math.sin(a) * r) + 4;
  }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  MD.cloud = new THREE.Points(cg, new THREE.PointsMaterial({ map: sprite, color: hdr([.5, .8, 2.2], .8), size: .13, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(MD.cloud);
}
function updModel(t, speed, gain, wavePos) {
  const col = new THREE.Color(), L = MD.L, NN = MD.NN;
  const wp = wavePos != null ? wavePos : ((t * speed) % 1.25) * (L + 1) - 1;
  const g = l => Math.exp(-Math.pow(l - wp, 2) / 1.1);
  for (let l = 0; l < L; l++) {
    const w = g(l), mix = l / (L - 1);
    for (let i = 0; i < NN; i++) {
      const I = (.22 + gain * w * (.5 + 1.1 * hash(l * 41 + i * 3 + Math.floor(t * 8) * .13)));
      MD.nodes.setColorAt(l * NN + i, col.setRGB(lerp(C.cyan[0], C.violet[0], mix) * I, lerp(C.cyan[1], C.violet[1], mix) * I, lerp(C.cyan[2], C.violet[2], mix) * I));
    }
    MD.panels[l].material.color.copy(hdr(C.cyan, .16 + gain * w * .8));
  }
  MD.nodes.instanceColor.needsUpdate = true;
  const ca = MD.lines.geometry.attributes.color;
  MD.seg.forEach((s, i) => {
    const I = (.035 + gain * g(s.l + .5) * s.w * s.w * .9), mix = s.l / (L - 1);
    const r = lerp(.25, .9, mix) * I, gg = lerp(1.2, .6, mix) * I, b = 2 * I;
    ca.setXYZ(i * 2, r, gg, b); ca.setXYZ(i * 2 + 1, r, gg, b);
  });
  ca.needsUpdate = true;
  MD.cloud.rotation.y = (t - 32) * .02;
}

/* ───────────── 06 serving ───────────── */
const SV = {};
{
  const g = G[6]; g.position.set(1.3, .9, 0);
  SV.users = [];
  const ug = new THREE.SphereGeometry(.11, 12, 10);
  const um = new THREE.InstancedMesh(ug, mGlow(C.white, .32), 40);
  for (let i = 0; i < 40; i++) { const u = [-6.7 + hash(i + 1) * 1.5, (Math.floor(i / 5) - 3.5) * .72, ((i % 5) - 2) * .9]; SV.users.push(u); dummy.position.fromArray(u); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); um.setMatrixAt(i, dummy.matrix); }
  g.add(um);
  SV.gw = new THREE.Group(); SV.gw.position.set(-1.6, 0, 0);
  SV.gw.add(new THREE.Mesh(new THREE.OctahedronGeometry(.7), mStd(0x0b1422, { roughness: .2, metalness: .9, emissive: hdr(C.cyan, .12) })));
  SV.gw.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(.72)), new THREE.LineBasicMaterial({ color: hdr(C.cyan, 1.3) })));
  SV.ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, .018, 8, 64), mGlow(C.cyan, 1.1)); SV.gw.add(SV.ring);
  SV.ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.4, .012, 8, 64), mGlow(C.violet, .9)); SV.gw.add(SV.ring2);
  g.add(SV.gw);
  SV.pods = [];
  const pb = new THREE.BoxGeometry(2.8, 1.05, 1.9);
  for (let k = 0; k < 4; k++) {
    const y = (k - 1.5) * 1.55, pod = new THREE.Group(); pod.position.set(5.6, y, 0);
    pod.add(new THREE.Mesh(pb, mStd(0x0c1118, { roughness: .3, metalness: .8 })));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(pb), new THREE.LineBasicMaterial({ color: hdr(C.green, .8) })); pod.add(e);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .7), new THREE.MeshBasicMaterial({ color: hdr(C.green, .3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); face.position.z = .96; pod.add(face);
    g.add(pod); SV.pods.push({ y, e, face });
  }
  const lp = [];
  for (const P of SV.pods) lp.push(-1.6, 0, 0, 5.6 - 1.4, P.y, 0);
  for (let i = 0; i < 40; i += 2) lp.push(...SV.users[i], -1.6, 0, 0);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: hdr(C.cyan, .16), transparent: true, opacity: .8 })));
  SV.N = 72;
  SV.req = new THREE.InstancedMesh(new THREE.SphereGeometry(.1, 10, 8), new THREE.MeshBasicMaterial(), SV.N * 4);
  g.add(SV.req);
}
function updServing(lt, t) {
  SV.ring.rotation.set(t * .9, t * .6, 0); SV.ring2.rotation.set(-t * .5, 0, t * .8); SV.gw.children[0].rotation.y = SV.gw.children[1].rotation.y = t * .7;
  const col = new THREE.Color(), load = [0, 0, 0, 0], PER = 2.4;
  for (let i = 0; i < SV.N; i++) {
    const batch = Math.floor(i / 4), off = (batch * .137) % 1, u0 = ((lt + .9) / PER + off), cyc = u0 - Math.floor(u0);
    const user = SV.users[Math.floor(hash(i * 3.3 + Math.floor(u0) * 1.7) * 40)], pod = SV.pods[(batch + Math.floor(u0)) % 4], k = i % 4;
    const gw = [-1.6, 0, 0], pd = [5.6 - 1.4, pod.y + (k - 1.5) * .16, 0];
    // request
    let a = p(cyc, k * .03, .3 + k * .03), b = p(cyc, .4, .58), pos, sc = 1;
    if (cyc < .4) pos = [0, 1, 2].map(c => lerp(user[c], gw[c] + (c === 1 ? (k - 1.5) * .22 : c === 0 ? -.9 : 0), eio(a)));
    else { pos = [0, 1, 2].map(c => lerp(gw[c] + (c === 1 ? (k - 1.5) * .22 : c === 0 ? -.9 : 0), pd[c], eio(b))); if (cyc > .58) sc = 0; }
    if (cyc > .58 && cyc < .72) load[(batch + Math.floor(u0)) % 4] += 1 - Math.abs((cyc - .65) / .07);
    dummy.position.fromArray(pos); dummy.scale.setScalar(sc); dummy.updateMatrix(); SV.req.setMatrixAt(i, dummy.matrix);
    SV.req.setColorAt(i, col.setRGB(C.cyan[0] * .7, C.cyan[1] * .7, C.cyan[2] * .7));
    // streamed response: 3 small dots
    for (let s = 0; s < 3; s++) {
      const r = p(cyc, .66 + s * .045, .93 + s * .02), id = SV.N + i * 3 + s; let q;
      if (r <= 0 || r >= 1) { dummy.scale.setScalar(0); q = pd; }
      else { dummy.scale.setScalar(.62); const e = eio(r); q = e < .5 ? [0, 1, 2].map(c => lerp(pd[c], gw[c], e * 2)) : [0, 1, 2].map(c => lerp(gw[c], user[c], e * 2 - 1)); }
      dummy.position.fromArray(q); dummy.updateMatrix(); SV.req.setMatrixAt(id, dummy.matrix); SV.req.setColorAt(id, col.setRGB(C.amber[0] * .7, C.amber[1] * .7, C.amber[2] * .7));
    }
  }
  SV.req.instanceMatrix.needsUpdate = true; SV.req.instanceColor.needsUpdate = true;
  SV.pods.forEach((P, k) => { const I = clamp(load[k] / 3); P.e.material.color.copy(hdr(C.green, .45 + I * .6)); P.face.material.color.copy(hdr(C.green, .08 + I * .3)); });
  path([[0, [-1, 2.4, 20], [1, .9, 0]], [2.5, [1.2, 2.2, 17.2], [1.2, .9, 0]], [5.5, [3.4, 2, 16.4], [1.3, .9, 0]]], lt);
}

/* ───────────── DOM ───────────── */
const brand = $('div', 'brand', '<b>●</b> IA · LA STACK NEXT GEN');
const clock = $('div', 'clock', '');
const bar = $('div', 'bar', '<i></i>');
const HUDN = ['Data center', 'GPU', 'CUDA', 'Modèle', 'Inférence', 'Serving', 'Vous'];
const hud = $('div', 'hud'); const hudIt = HUDN.map((n, i) => $('div', 'it', `<span>0${i + 1}</span>${n}`, hud));

const HL = [null,
  ['01 · DATA CENTER', 'L’usine à calcul', 'Tout commence ici : des bâtiments entiers remplis de serveurs.'],
  ['02 · GPU NVIDIA', 'Le moteur du calcul parallèle', 'Une puce conçue pour mener des milliers de calculs en même temps.'],
  ['03 · CUDA', 'Le traducteur entre le code et la puce', 'Le logiciel de NVIDIA découpe chaque calcul en milliers de tâches parallèles.'],
  ['04 · LE MODÈLE', 'Un LLM : des milliards de paramètres', 'Un immense réseau de neurones qui a appris le langage en lisant des textes.'],
  ['05 · INFÉRENCE', 'Prédire le mot suivant, en boucle', ''],
  ['06 · SERVING', 'Servir des millions de requêtes', 'Chaque GPU répond à plusieurs utilisateurs à la fois, sans file d’attente.'],
  ['07 · VOUS', 'Une question. Une réponse. En direct.', 'Le texte s’affiche mot à mot, au rythme où les tokens sont générés.'],
].map(h => h && (() => { const e = $('div', 'hl'); return { e, k: $('div', 'k', h[0], e), t: $('div', 't', h[1], e), s: $('div', 's', h[2], e) }; })());

// callouts: [t0,t1, group idx, anchor, x, y, title, sub, accent]
const CO = [
  [5.5, 8.7, 1, [0, 2.4, -6.3], 1290, 190, 'Des milliers de serveurs', 'Jusqu’à 100 000 GPU et plus sur un même site', 'var(--cyan)'],
  [6.9, 8.7, 1, [3, 2.4, 6.3], 1290, 372, 'Une énergie colossale', 'Plus de 100 kW par baie de serveurs', 'var(--amber)'],
  [9.3, 12.6, 1, [5.5, 2.95, -2.38], 1290, 150, 'Refroidissement liquide', 'L’eau évacue la chaleur au plus près des puces', 'var(--cyan)'],
  [10.3, 12.6, 1, [7.8, 3.5, 1.5], 1290, 356, 'Réseau en fibre optique', 'Jusqu’à 800 Gb/s entre les serveurs', 'var(--violet)'],
  [14.9, 18.2, 2, [0, .3, 0], 1300, 170, 'Des milliers de cœurs', 'Ils calculent tous en même temps', 'var(--green)'],
  [16.5, 19.8, 2, [1.38, .34, .87], 1300, 330, 'Mémoire HBM', 'Le modèle y est chargé, au plus près du calcul', 'var(--violet)'],
  [18.1, 20.9, 2, [0, 2.6, 0], 1300, 518, 'Près de 1 kW par puce', 'D’où la plaque froide à eau, posée dessus', 'var(--cyan)'],
  [29.3, 32.4, 4, [5, 4.6, -3], 1300, 150, 'Paramètres', 'Des milliards de nombres, réglés pendant l’entraînement', 'var(--cyan)'],
  [31.1, 34.2, 4, [-1.55 * .5, 1.8, 0], 1300, 348, 'Couches Transformer', 'Des dizaines de couches traitent le texte, l’une après l’autre', 'var(--violet)'],
  [32.9, 35.6, 4, [2.3, -.4, 1.2], 1300, 566, 'Attention', 'Chaque mot « regarde » tous les autres pour saisir le contexte', 'var(--green)'],
].map(c => {
  const e = $('div', 'co', `<div class="ct">${c[6]}</div><div class="cs">${c[7]}</div>`); e.style.left = c[4] + 'px'; e.style.top = c[5] + 'px'; e.style.setProperty('--acc', c[8]);
  const pa = document.createElementNS('http://www.w3.org/2000/svg', 'path'), ci = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); svg.append(pa, ci);
  return { c, e, pa, ci };
});

// intro
const iK = $('div', 'center ik', 'NEXT GENERATION · L’INFRASTRUCTURE DE L’IA');
const iT = $('div', 'center it1', 'Du data center<br><span class="grad">à votre intention</span>');
const iS = $('div', 'center it2', 'Toute la stack technique de l’IA, couche par couche, en 60 secondes.');
// outro
const oK = $('div', 'center ik', 'DU SILICIUM À L’INTENTION');
const oT = $('div', 'center it1', 'Derrière chaque réponse,<br><span class="grad">toute une infrastructure.</span>');
const oC = $('div', 'center ochips', HUDN.map(n => `<div>${n}</div>`).join('<i>→</i>'));
oK.style.top = '318px'; oT.style.top = '372px'; oT.style.fontSize = '96px';
const oChips = [...oC.querySelectorAll('div')];

// CUDA
const code = $('div', 'code', `<div class="cl">VOTRE CODE</div><pre>reponse = <b>modele</b>(<u>question</u>)</pre><div class="cn">1 ligne de Python → <b id="cnt">1</b> opérations en parallèle</div>`);
const cnt = code.querySelector('#cnt');
const CL = [['Application IA', 'votre modèle, votre code'], ['Framework', 'PyTorch'], ['Bibliothèques', 'cuDNN · TensorRT'], ['CUDA', 'runtime + pilote NVIDIA'], ['GPU', 'des milliers de cœurs']]
  .map(l => $('div', 'lb', `<div class="ln">${l[0]}</div><div class="ld">${l[1]}</div>`));

// serving labels
const SL = [['Utilisateurs', [-5.9, 3.5, 0]], ['API + répartiteur de charge', [-1.6, 2.1, 0]], ['Serveurs d’inférence GPU', [5.6, 3.5, 0]], ['Batching : plusieurs requêtes par GPU', [2, -2.0, 0]], ['Streaming : la réponse revient mot à mot', [-3.3, -2.75, 0]]]
  .map(l => ({ e: $('div', 'lbc', l[0]), a: l[1] }));

// inference
const PROMPT = 'Pourquoi le ciel est-il bleu ?';
const TOK = [['Pour', 18431], ['quoi', 7092], [' le', 512], [' ciel', 9318], [' est', 871], ['-il', 2203], [' bleu', 15540], [' ?', 37]];
const inLab = $('div', 'lab', 'QUESTION (PROMPT)'); inLab.style.left = '340px'; inLab.style.top = '128px';
const prompt = $('div', 'prompt', PROMPT);
const toks = $('div', 'toks');
const VC = ['#38e1ff', '#9d83ff', '#8fe000', '#ffb45c'];
const tokEl = TOK.map((tk, i) => {
  const e = $('div', 'tok', '', toks), chip = $('div', 'chip', tk[0].replace(' ', '·'), e), id = $('div', 'tid', tk[1], e), vec = $('div', 'vec', '', e);
  const bars = [...Array(6)].map((_, k) => { const b = $('i', '', '', vec); b.style.background = VC[Math.floor(hash(i * 7 + k * 3) * 4)]; b.style.width = (25 + hash(i * 11 + k * 5) * 75) + '%'; return b; });
  return { chip, id, vec, bars };
});
const tblock = $('div', 'tblock', `<div class="lays">${'<i></i>'.repeat(16)}</div><div class="tl">Modèle Transformer <span>· des dizaines de couches · calcul sur GPU</span></div>`);
const lays = [...tblock.querySelectorAll('.lays i')];
const STEPS = [
  [37.2, 'Tokenisation', 'Le texte est découpé en morceaux, les tokens, puis converti en nombres.'],
  [39.0, 'Embeddings', 'Chaque token devient un vecteur : une liste de nombres qui porte son sens.'],
  [40.7, 'Calcul sur GPU', 'Les vecteurs traversent toutes les couches : des milliards de multiplications.'],
  [42.6, 'Probabilités', 'Le modèle note chaque token possible. Le plus plausible est retenu.'],
  [44.7, 'La boucle', 'Le token choisi est réinjecté, et tout recommence : un token à la fois.'],
].map((s, i) => ({ t: s[0], e: $('div', 'step', `<div class="sn"><b>${i + 1}</b>${s[1]}</div><div class="sd">${s[2]}</div>`) }));
const GEN = [
  [['Parce', 71], ['Le', 14], ['C’est', 8], ['La', 5], ['Car', 2]],
  [[' que', 96], [' qu’', 2], [',', 1], [' :', 1], [' le', 0]],
  [[' l’', 64], [' la', 22], [' les', 9], [' le', 3], [' notre', 2]],
  [['atmosphère', 83], ['air', 12], ['azote', 3], ['oxygène', 1], ['espace', 1]],
  [[' diffuse', 77], [' disperse', 13], [' filtre', 6], [' absorbe', 3], [' renvoie', 1]],
  [[' davantage', 58], [' plus', 24], [' surtout', 12], [' mieux', 4], [' bien', 2]],
  [[' la', 91], [' les', 5], [' le', 2], [' cette', 1], [' sa', 1]],
  [[' lumière', 94], [' couleur', 4], [' teinte', 1], [' partie', 1], [' zone', 0]],
  [[' bleue', 97], [' violette', 2], [' solaire', 1], [' blanche', 0], [' rouge', 0]],
  [['.', 68], [' du', 21], [',', 7], [' que', 3], [' :', 1]],
];
const probs = $('div', 'probs', '<div class="lab" style="margin-bottom:10px">PROBABILITÉ DU TOKEN SUIVANT</div>');
const prow = [...Array(5)].map((_, i) => { const r = $('div', 'prow' + (i ? '' : ' top'), '<div class="pl"></div><div class="pt"><i></i></div><div class="pp"></div>', probs); return { r, l: r.children[0], b: r.children[1].firstChild, p: r.children[2] }; });
const outp = $('div', 'outp', '<div class="lab">RÉPONSE GÉNÉRÉE</div><div class="ot"></div>');
const outT = outp.querySelector('.ot');
const loopC = $('div', 'loop', '↻ un token à la fois · des dizaines par seconde');
const GEN0 = 44.05, GENS = 44.7, GDT = .29;
const genTime = g => g === 0 ? GEN0 : GENS + (g - 1) * GDT + .12;

// chat
const ANSWER = 'Parce que l’atmosphère diffuse davantage la lumière bleue du Soleil que les autres couleurs : c’est elle qui emplit le ciel.';
const AW = ANSWER.split(' ');
const chat = $('div', 'chat', `<div class="ch"><i></i>ASSISTANT IA</div><div class="u">${PROMPT}</div><div class="a"></div><div class="meta"></div>`);
const chatU = chat.querySelector('.u'), chatA = chat.querySelector('.a'), chatM = chat.querySelector('.meta');

const dimEl = document.getElementById('dim'), dipEl = document.getElementById('dip');

/* ───────────── master update ───────────── */
function update(t) {
  t = clamp(t, 0, DUR);
  let si = 0; while (si < 7 && t >= T[si + 1]) si++;
  const lt = t - T[si];
  G.forEach((g, i) => g.visible = i === si || (i === 4 && si === 5));
  dust.rotation.y = t * .01; dust.material.opacity = si === 1 ? .25 : .55;
  bloom.strength = si === 1 ? .34 : .5; let dim = 0;

  if (si === 0) {
    updTower(tower0, t, p(t, .1, 2.2), p(t, 1.2, 4.2) * 7);
    tower0.position.set(0, -2.6, 0); tower0.rotation.y = t * .25;
    path([[0, [0, 9, 17], [0, 0, 0]], [2.5, [0, 3.4, 13.6], [0, 0, 0]], [3.8, [0, 1.6, 12], [0, 0, 0]], [4.5, [0, -1.4, 5.5], [0, -2.4, 0]]], lt);
    dim = .5 * vis(t, .3, 4.5, .8, .5);
  }
  if (si === 1) updDC(lt, t);
  if (si === 2) updGPU(lt, t);
  if (si === 3) updCUDA(lt, t);
  if (si === 4) {
    updModel(t, .42, eo(p(lt, 1, 2.5)));
    path([[0, [0, 2.5, 34], [0, 0, 0]], [2.6, [-3.5, 3.6, 21], [1.5, .1, 0]], [5.5, [4.5, 3.4, 17.5], [2.2, 0, 0]], [8, [3.6, 2.2, 16.8], [2.4, -.2, 0]]], lt);
  }
  if (si === 5) {
    const s3 = vis(t, 40.7, 42.7, .3, .4), loop = t > GENS ? 1 : 0;
    let wp = null, gain = .35;
    if (s3 > 0) { wp = p(t, 40.8, 42.5) * 11 - 1; gain = 1.3; }
    else if (loop) { const u = ((t - GENS) / GDT) % 1; wp = u * 11 - 1; gain = 1; }
    updModel(t, .3, gain, wp);
    path([[0, [3.6, 2.2, 16.8], [2.4, -.2, 0]], [3, [1, 1.2, 18.5], [0, -.3, 0]], [11.5, [-1.5, .8, 17.5], [0, -.3, 0]]], lt);
    dim = .72 * vis(t, 36.2, 47.5, .6, .3);
  }
  if (si === 6) updServing(lt, t);
  if (si === 7) {
    const out = eio(p(t, OUTRO - .2, OUTRO + 1.2));
    updTower(tower7, t, 1, out > 0 ? p(t, OUTRO, OUTRO + 1.9) * 7 : 7 * (.25 + .1 * Math.sin(t * 2)));
    tower7.position.set(0, -2.6, 0); tower7.rotation.y = t * .22;
    camera.position.set(lerp(-6.5, 0, out), lerp(1.5, 1.2, out), lerp(15, 15.5 - (t - OUTRO) * .5, out)); camera.lookAt(lerp(-6.5, 0, out) * .25, 0, 0);
    dim = lerp(.55, .5, out);
  }
  dimEl.style.opacity = dim.toFixed(3);

  // dips between chapters + fades at both ends
  let dip = Math.max(1 - p(t, 0, .7), p(t, 59.45, 60));
  for (let i = 1; i < 8; i++) dip = Math.max(dip, 1 - Math.abs(t - T[i]) / .26);
  dip = Math.max(dip, (1 - Math.abs(t - OUTRO) / .3) * .0);
  dipEl.style.opacity = clamp(dip).toFixed(3);

  camera.updateMatrixWorld(); scene.updateMatrixWorld();
  composer.render();

  /* chrome */
  const chrome = vis(t, T[1] + .3, OUTRO, .6, .4);
  set(brand, vis(t, .8, 59.4, .8, .5) * .9); set(clock, chrome);
  clock.textContent = `0:${String(Math.floor(t)).padStart(2, '0')} / 1:00`;
  set(bar, vis(t, .8, 59.4, .8, .5)); bar.firstChild.style.width = (t / DUR * 100).toFixed(2) + '%';
  set(hud, chrome, 0, `translateX(${(-(1 - eo(p(t, T[1] + .3, T[1] + .9))) * 40).toFixed(1)}px)`);
  hudIt.forEach((e, i) => { e.className = 'it' + (i + 1 === si ? ' on' : i + 1 < si ? ' done' : ''); });

  /* headlines */
  HL.forEach((h, i) => {
    if (!h) return;
    const a = T[i] + .32, b = i === 7 ? OUTRO : T[i + 1] - .08;
    set(h.e, t > a - .1 && t < b + .1 ? 1 : 0);
    [h.k, h.t, h.s].forEach((el, j) => { const o = vis(t, a + j * .13, b, .55, .3); set(el, o, (1 - eo(p(t, a + j * .13, a + j * .13 + .55))) * 34); });
  });

  /* callouts */
  CO.forEach(({ c, e, pa, ci }) => {
    const o = vis(t, c[0], c[1], .45, .3);
    set(e, o, (1 - eo(p(t, c[0], c[0] + .45))) * 18);
    if (o < .004) { pa.style.opacity = ci.style.opacity = 0; return; }
    const q = project(G[c[2]], c[3]), ex = c[4] - 16, ey = c[5] + 36;
    const okk = q.ok && q.x > 300 && q.x < ex - 30 && q.y > 40 && q.y < H - 40 ? 1 : 0;
    const d = eo(p(t, c[0] + .1, c[0] + .6));
    const mx = lerp(q.x, ex - 46, 1), x2 = lerp(q.x, mx, clamp(d * 2)), y2 = lerp(q.y, ey, clamp(d * 2));
    pa.setAttribute('d', `M${q.x.toFixed(1)},${q.y.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} L${lerp(x2, ex, clamp(d * 2 - 1)).toFixed(1)},${y2.toFixed(1)}`);
    ci.setAttribute('cx', q.x); ci.setAttribute('cy', q.y); ci.setAttribute('r', 5 + 4 * (1 - d));
    pa.style.opacity = ci.style.opacity = (o * okk).toFixed(3);
  });

  /* intro / outro */
  [iK, iT, iS].forEach((el, j) => { const a = .7 + j * .22; set(el, vis(t, a, 4.3 - (2 - j) * .06, .7, .35), (1 - eo(p(t, a, a + .7))) * 40); });
  [oK, oT, oC].forEach((el, j) => { const a = OUTRO + .25 + j * .2; set(el, vis(t, a, 59.6, .6, .3), (1 - eo(p(t, a, a + .6))) * 40); });
  oChips.forEach((e, i) => { const o = p(t, OUTRO + .7 + i * .13, OUTRO + .9 + i * .13); e.style.borderColor = o > .5 ? 'var(--green)' : ''; e.style.color = o > .5 ? '#fff' : '#7d8aa3'; e.style.boxShadow = o > .5 ? '0 0 22px rgba(143,224,0,.35)' : ''; });

  /* CUDA */
  set(code, vis(t, T[3] + 1.2, T[4] - .1), (1 - eo(p(t, T[3] + 1.2, T[3] + 1.7))) * 20);
  { const k = p(t, T[3] + 1.9, T[3] + 5.2), v = Math.pow(10, k * 6); cnt.textContent = k >= 1 ? 'des millions d’' : k <= 0 ? '1' : Math.round(v).toLocaleString('fr-FR'); cnt.nextSibling.textContent = k >= 1 ? 'opérations en parallèle' : ' opérations en parallèle'; cnt.parentNode.firstChild.textContent = k < .02 ? '1 ligne de Python → ' : '1 ligne de Python → '; }
  CL.forEach((e, k) => {
    const a = T[3] + 1.5 + k * .22, o = si === 3 ? vis(t, a, T[4] - .1, .5, .3) : 0;
    if (o < .004) { set(e, 0); return; }
    const q = project(G[3], [3.1, CU.y(k), -1.8]);
    e.style.left = (q.x + 26 + (1 - eo(p(t, a, a + .5))) * 30).toFixed(1) + 'px'; e.style.top = (q.y - 28).toFixed(1) + 'px'; set(e, o);
    e.firstChild.style.color = ['#b9a6ff', '#8fb6ff', '#6fe6ff', '#6ff0b4', '#a8f028'][k];
  });

  /* serving labels */
  SL.forEach((L, k) => {
    const a = T[6] + .7 + k * .45, o = si === 6 ? vis(t, a, T[7] - .1, .45, .3) : 0;
    if (o < .004) { set(L.e, 0); return; }
    const q = project(G[6], L.a); L.e.style.left = q.x.toFixed(1) + 'px'; L.e.style.top = q.y.toFixed(1) + 'px';
    set(L.e, o, 0, `translate(-50%,-50%) scale(${(.9 + .1 * eo(p(t, a, a + .45))).toFixed(3)})`);
    L.e.style.borderColor = k === 3 ? 'rgba(56,225,255,.6)' : k === 4 ? 'rgba(255,180,92,.7)' : '';
  });

  /* inference */
  const iEnd = T[6] - .12;
  set(inLab, vis(t, 36.45, iEnd)); set(prompt, vis(t, 36.5, iEnd), (1 - eo(p(t, 36.5, 37))) * 20);
  set(toks, t > 37 && t < iEnd + .1 ? 1 : 0);
  tokEl.forEach((k, i) => {
    const a = 37.3 + i * .13, fo = 1 - eo(p(t, iEnd - .3, iEnd));
    set(k.chip, eo(p(t, a, a + .35)) * fo, (1 - eo(p(t, a, a + .35))) * -26);
    set(k.id, eo(p(t, a + .45, a + .8)) * fo);
    const s3 = vis(t, 40.8, 42.4, .3, .4);
    k.bars.forEach((b, j) => { const g = eo(p(t, 39.1 + i * .08 + j * .04, 39.5 + i * .08 + j * .04)); b.style.transform = `scaleX(${g.toFixed(3)})`; b.style.opacity = (fo * (1 - .45 * s3 * (.5 + .5 * Math.sin(t * 14 + j + i)))).toFixed(3); });
  });
  set(tblock, vis(t, 40.5, iEnd), (1 - eo(p(t, 40.5, 41))) * 20);
  { let wp = -9; if (t >= 40.8 && t < 42.7) wp = p(t, 40.8, 42.5) * 17; else if (t >= GENS) wp = (((t - GENS) / GDT) % 1) * 17;
    lays.forEach((e, i) => { e.style.opacity = (.14 + .86 * Math.exp(-Math.pow(i - wp, 2) / 2.2)).toFixed(3); }); }
  STEPS.forEach((s, i) => { const b = i < 4 ? STEPS[i + 1].t : iEnd; set(s.e, vis(t, s.t, b, .4, .25), (1 - eo(p(t, s.t, s.t + .4))) * 16); });
  set(probs, vis(t, 42.6, iEnd), (1 - eo(p(t, 42.6, 43.1))) * 20);
  {
    const g = t < GENS ? 0 : Math.min(9, 1 + Math.floor((t - GENS) / GDT)), gs = g === 0 ? 42.9 : GENS + (g - 1) * GDT;
    const k = eo(p(t, gs, gs + (g === 0 ? .7 : .13)));
    prow.forEach((r, i) => {
      const cur = GEN[g][i], prev = g ? GEN[g - 1][i][1] : 0, v = lerp(prev, cur[1], k);
      r.l.textContent = cur[0].replace(/^ /, '·'); r.b.style.width = v.toFixed(1) + '%'; r.p.textContent = Math.round(v) + ' %';
      r.r.className = 'prow' + (i === 0 && (g > 0 || t > 43.75) ? ' top' : '');
    });
    let txt = ''; for (let j = 0; j < 10; j++) if (t >= genTime(j)) txt += GEN[j][0][0];
    outT.innerHTML = `<span>${txt}</span>` + (Math.floor(t * 3) % 2 || t > GENS ? '<i class="cur"></i>' : '');
  }
  set(outp, vis(t, 43.7, iEnd), (1 - eo(p(t, 43.7, 44.2))) * 20);
  set(loopC, vis(t, 44.9, iEnd), (1 - eo(p(t, 44.9, 45.3))) * 14);

  /* chat */
  set(chat, vis(t, T[7] + .3, OUTRO, .6, .35), (1 - eo(p(t, T[7] + .3, T[7] + .9))) * 40);
  set(chatU, eo(p(t, T[7] + .7, T[7] + 1.1)), (1 - eo(p(t, T[7] + .7, T[7] + 1.1))) * 16);
  { const k = p(t, T[7] + 1.5, T[7] + 3.9), n = Math.floor(k * AW.length + .001);
    chatA.style.opacity = eo(p(t, T[7] + 1.2, T[7] + 1.5)).toFixed(3);
    chatA.innerHTML = AW.slice(0, n).join(' ') + (k < 1 ? '<i class="cur"></i>' : '');
    chatM.innerHTML = k <= 0 ? 'data center → GPU → CUDA → modèle → inférence → serving…' : `<b>${Math.round(n * 1.4)} tokens</b> · premier mot en moins d’une seconde`; }
}

window.renderAt = t => { update(t); return true; };
window.DUR = DUR;
await document.fonts.ready;
await Promise.all(['700 20px JBM', '400 20px JBM', '700 20px "Inter Display"'].map(f => document.fonts.load(f)));
update(+(qs.get('t') || 0));
window.READY = true;
if (qs.has('play')) { const t0 = performance.now(); const loop = () => { update(((performance.now() - t0) / 1000) % DUR); requestAnimationFrame(loop); }; loop(); }
