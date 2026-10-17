/* interactive-explainer runtime: 3d.js (IE.v3). Canvas-2D 3D for when geometry is the point: orbit camera,
   depth-split polylines (back half faded), a per-pixel lit sphere, and labels that stay inside the canvas.
   Draw order: lines('back') -> opaque objects -> lines('front'). Needs core.js. */
(function(){
'use strict';
const RAD = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const seg = (a, b, n = 24) => { const o = []; for (let i = 0; i <= n; i++){ const t = i / n; o.push([0, 1, 2].map(k => a[k] + (b[k] - a[k]) * t)); } return o; };
const curve = (f, t0, t1, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(f(t0 + (t1 - t0) * i / n)); return o; };
const sph = (lon, lat, r = 1) => [r * Math.cos(lat * RAD) * Math.cos(lon * RAD), r * Math.cos(lat * RAD) * Math.sin(lon * RAD), r * Math.sin(lat * RAD)];

class Cam {   // orbit camera: z is up; az/el in degrees; azAdd lets the view follow a moving subject
  constructor(az, el){ this.az0 = az; this.el0 = el; this.reset(); }
  reset(){ this.az = this.az0; this.el = this.el0; this.zoom = 1; }
  setup(W, H, scale, fx = 0.5, fy = 0.5, azAdd = 0){
    const a = (this.az + azAdd) * RAD, e = this.el * RAD;
    this.e = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
    this.r = [-Math.sin(a), Math.cos(a), 0];
    this.u = [-Math.sin(e) * Math.cos(a), -Math.sin(e) * Math.sin(a), Math.cos(e)];
    this.cx = W * fx; this.cy = H * fy; this.S = scale * this.zoom; this.D = 5;
  }
  proj(p){ const x = dot(p, this.r), y = dot(p, this.u), z = dot(p, this.e), k = this.D / (this.D - z); return { x: this.cx + x * this.S * k, y: this.cy - y * this.S * k, z, k }; }
  basis(){ return { right: this.r, up: this.u, e: this.e }; }
  // drag to orbit, wheel to zoom; calls onChange() so the app can redraw
  attach(cv, onChange){
    let drag = null; cv.classList.add('drag');
    cv.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; this.az -= (e.clientX - drag[0]) * 0.4; this.el = Math.max(-89, Math.min(89, this.el + (e.clientY - drag[1]) * 0.4)); drag = [e.clientX, e.clientY]; onChange(); });
    cv.addEventListener('pointerup', () => drag = null);
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.max(0.5, Math.min(3, this.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); onChange(); }, { passive: false });
    return this;
  }
}
// Polyline split into runs behind/in front of depth `thr`; pass 'back' | 'front' | undefined (both).
function poly(ctx, cam, pts, st, pass, thr = 0){
  const Pp = pts.map(p => cam.proj(p)), isBack = k => (Pp[k].z + Pp[k + 1].z) / 2 < thr;
  ctx.strokeStyle = st.color; ctx.lineWidth = st.width || 1.5; ctx.setLineDash(st.dash || []);
  let i = 0;
  while (i < Pp.length - 1){
    const back = isBack(i); let j = i; while (j < Pp.length - 1 && isBack(j) === back) j++;
    if (!(pass && ((pass === 'back') !== back))){
      ctx.globalAlpha = back ? (st.backAlpha ?? 0.28) : 1;
      ctx.beginPath(); ctx.moveTo(Pp[i].x, Pp[i].y); for (let k = i + 1; k <= j; k++) ctx.lineTo(Pp[k].x, Pp[k].y); ctx.stroke();
    }
    i = j;
  }
  ctx.globalAlpha = 1; ctx.setLineDash([]);
}
const label3 = (ctx, cam, p, s, o = {}) => { const q = cam.proj(p); IE.txt(ctx, s, q.x + (o.dx || 0), q.y + (o.dy || 0), { ...o, alpha: q.z < 0 ? 0.45 : 1 }); };
// Per-pixel lit sphere with highlighted parallels [{lat, rgb:[r,g,b], w, a}]. Cached image per slot; cheap per frame.
const SPHERES = {};
function renderSphere(ctx, cx, cy, r, B, axis, light, parallels, slot, dpr, tint = [40, 112, 196]){
  const R = Math.max(3, Math.round(r * dpr)), N2 = 2 * R + 2;
  let g = SPHERES[slot]; if (!g || g.N !== N2){ const c = document.createElement('canvas'); c.width = c.height = N2; g = SPHERES[slot] = { c, x: c.getContext('2d'), N: N2 }; }
  const img = g.x.createImageData(N2, N2), px = img.data, lw = 1.2 / R, dark = [14, 20, 34];
  for (let j = 0; j < N2; j++){ const v = (R + 1 - (j + 0.5)) / R;
    for (let i = 0; i < N2; i++){ const u = (i + 0.5 - (R + 1)) / R, rr = u * u + v * v; if (rr > 1) continue;
      const w = Math.sqrt(1 - rr), n = [0, 1, 2].map(k => u * B.right[k] + v * B.up[k] + w * B.e[k]);
      const lat = Math.asin(Math.max(-1, Math.min(1, dot(n, axis)))) / RAD, lit = dot(n, light);
      const t = Math.min(1, Math.max(0, (lit + 0.06) / 0.12)), br = (0.4 + 0.6 * Math.max(0, lit)) * (0.6 + 0.4 * w);
      let c = [0, 1, 2].map(k => dark[k] + (tint[k] * br - dark[k]) * t);
      for (const pl of parallels) if (Math.abs(lat - pl.lat) < lw / RAD * (pl.w || 1)) c = c.map((x, k) => x + (pl.rgb[k] - x) * (pl.a ?? 0.9));
      const q = (j * N2 + i) * 4; px[q] = c[0]; px[q + 1] = c[1]; px[q + 2] = c[2]; px[q + 3] = 255 * Math.min(1, (1 - Math.sqrt(rr)) * R + 0.4);
    } }
  g.x.putImageData(img, 0, 0); ctx.drawImage(g.c, cx - (R + 1) / dpr, cy - (R + 1) / dpr, N2 / dpr, N2 / dpr);
}
IE.v3 = { RAD, dot, cross, unit, seg, curve, sph, Cam, poly, label3, renderSphere };
})();
