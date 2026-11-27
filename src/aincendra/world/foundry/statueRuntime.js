import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mix = (a, b, t) => a + (b - a) * t;

export function createStatue(config, template, options = {}) {
  const root = new THREE.Group();
  const variant = config?.variant || template?.id || 'marble-pedestal';
  root.name = template?.id || variant;
  const number = (value, lo, hi, fallback) => Number.isFinite(value) ? clamp(value, lo, hi) : fallback;
  const w = number(config?.width, .45, 20, 1.8);
  const d = number(config?.depth, .25, 20, 1.5);
  const h = number(config?.height, .5, 30, 3.2);
  const detail = number(config?.detail, 0, 1, .65);
  const carving = number(config?.carving, 0, 1, .65);
  const wear = number(config?.weathering, 0, 1, .3);
  const lichen = number(config?.lichen, 0, 1, .18);
  const roughness = number(config?.roughness, .15, 1, .79);
  const inscriptions = config?.inscriptions !== false;
  const offerings = config?.offerings !== false;
  const flame = config?.flame !== false;
  let state = ((Number.isFinite(config?.seed) ? Math.trunc(config.seed) : 1) >>> 0) || 1;
  const seed = state;
  const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const range = (a, b) => mix(a, b, rand());
  const color = (value, fallback) => new THREE.Color(typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback);
  const C = {
    stone: color(config?.stoneColor, '#aaa79c'), trim: color(config?.trimColor, '#d0c5aa'),
    metal: color(config?.metalColor, '#6d5744'), lichen: color(config?.lichenColor, '#84916d'),
    glow: color(config?.glowColor, '#ff9d36'),
  };
  const dark = C.stone.clone().multiplyScalar(.3);
  const buckets = new Map(), parts = [], contacts = [];
  function bucket(name) {
    if (!buckets.has(name)) buckets.set(name, { pos: [], uv: [], normal: [], color: [], index: [] });
    return buckets.get(name);
  }
  function part(name, material, draw, grounded = false) {
    const b = bucket(material), start = b.pos.length / 3;
    draw();
    const count = b.pos.length / 3 - start;
    if (count) parts.push({ name, bucket: material, start, count, ...(grounded ? { grounded: true } : {}) });
  }
  function append(geometry, material, tint, matrix = new THREE.Matrix4(), stone = true) {
    const b = bucket(material), offset = b.pos.length / 3;
    const pos = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), normals = geometry.getAttribute('normal');
    if (!normals) geometry.computeVertexNormals();
    const n = geometry.getAttribute('normal'), normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const p = new THREE.Vector3(), nn = new THREE.Vector3();
    const shade = .96 + rand() * .08;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      nn.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      b.pos.push(p.x, p.y, p.z);
      b.normal.push(nn.x, nn.y, nn.z);
      b.uv.push(uv ? uv.getX(i) : p.x, uv ? uv.getY(i) : p.y);
      const grain = Math.sin(p.x * 13.73 + p.y * 7.41 + p.z * 19.67 + seed * .0127) * Math.sin(p.z * 8.31 - p.y * 13.2 + seed * .028);
      const rain = wear * (.08 + .09 * Math.max(0, 1 - p.y / Math.max(.1, h)) + .07 * Math.max(0, 1 - nn.y)) * (.5 + .5 * grain);
      const mottling = stone ? 1 + grain * (.025 + wear * .075) - rain : 1;
      const patches = stone ? lichen * Math.pow(Math.max(0, Math.sin(p.x * 7.3 + seed * .06) * Math.cos(p.z * 10.7 - p.y * 4.3 + seed * .03)), 5) * (.2 + .8 * Math.max(0, nn.y)) : 0;
      const r = mix(tint.r * shade * mottling, C.lichen.r, patches);
      const g = mix(tint.g * shade * mottling, C.lichen.g, patches);
      const bl = mix(tint.b * shade * mottling, C.lichen.b, patches);
      b.color.push(clamp(r, 0, 1), clamp(g, 0, 1), clamp(bl, 0, 1));
    }
    const idx = geometry.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) b.index.push(offset + idx.getX(i));
    else for (let i = 0; i < pos.count; i++) b.index.push(offset + i);
    geometry.dispose();
  }
  function rounded(sx, sy, sz, bevel) {
    const dims = [sx, sy, sz], half = dims.map(v => v / 2);
    const r = Math.min(bevel * (1 + wear * .8), ...half.map(v => v * .75));
    const axes = half.map(a => r > 1e-5 ? detail > .52 ? [-a, -a + r * .35, -a + r, a - r, a - r * .35, a] : [-a, -a + r, a - r, a] : [-a, a]);
    const faces = [[2, 1, 0, 1, 1], [2, -1, 0, -1, 1], [0, 1, 2, -1, 1], [0, -1, 2, 1, 1], [1, 1, 0, 1, 2], [1, -1, 0, 1, 2]];
    const positions = [], normals = [], uvs = [], indices = [];
    for (const [axis, sign, uAxis, uSign, vAxis] of faces) {
      const vSign = axis === 1 && sign === 1 ? -1 : 1;
      const U = axes[uAxis], V = axes[vAxis], start = positions.length / 3;
      for (let j = 0; j < V.length; j++) for (let i = 0; i < U.length; i++) {
        const p = [0, 0, 0], normal = [0, 0, 0];
        p[axis] = sign * half[axis]; p[uAxis] = uSign * U[i]; p[vAxis] = vSign * V[j];
        const q = p.map((value, k) => clamp(value, -half[k] + r, half[k] - r));
        const length = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        if (length > 1e-7) for (let k = 0; k < 3; k++) { normal[k] = (p[k] - q[k]) / length; p[k] = q[k] + normal[k] * r; }
        else normal[axis] = sign;
        positions.push(...p); normals.push(...normal);
        uvs.push(U[i] / Math.max(.2, dims[uAxis]) + .5, V[j] / Math.max(.2, dims[vAxis]) + .5);
      }
      for (let j = 0; j < V.length - 1; j++) for (let i = 0; i < U.length - 1; i++) {
        const a = start + j * U.length + i, b = a + 1, c = b + U.length, e = a + U.length;
        indices.push(a, b, c, a, c, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }
  function box(x, y, z, sx, sy, sz, material = 'stone', tint = C.stone, bevel = .025) {
    append(rounded(Math.max(.006, sx), Math.max(.006, sy), Math.max(.006, sz), bevel), material, tint, new THREE.Matrix4().makeTranslation(x, y, z), material !== 'metal' && material !== 'flame' && material !== 'engraving');
  }
  function lathe(x, z, profile, material = 'stone', tint = C.stone, segments = 48) {
    const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
    append(new THREE.LatheGeometry(points, Math.max(24, segments), 0, TAU), material, tint, new THREE.Matrix4().makeTranslation(x, 0, z), material !== 'metal' && material !== 'flame');
  }
  function ring(x, y, z, radius, tube, material = 'trim', tint = C.trim, upright = false) {
    const m = new THREE.Matrix4().makeRotationX(upright ? 0 : Math.PI / 2).setPosition(x, y, z);
    append(new THREE.TorusGeometry(radius, tube, Math.max(8, Math.round(8 + detail * 8)), Math.max(32, Math.round(40 + detail * 24))), material, tint, m, material !== 'metal');
  }
  function path(points, radius, material = 'engraving', tint = dark) {
    if (points.length < 2) return;
    const list = points.map(p => new THREE.Vector3(...p));
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1], delta = b.clone().sub(a);
      if (delta.lengthSq() < 1e-10) continue;
      const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()), new THREE.Vector3(1, 1, 1));
      append(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material, tint, m, false);
    }
  }
  function polygon(points, z, thickness, material = 'trim', tint = C.trim, bevel = .012, horizontal = false) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12, steps: 1 });
    geometry.computeVertexNormals();
    const transform = horizontal ? new THREE.Matrix4().makeRotationX(-Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, 0, z)) : new THREE.Matrix4().makeTranslation(0, 0, z);
    append(geometry, material, tint, transform, material !== 'metal');
  }
  function fluted(x, z, bottom, top, radius, flutes = 16, material = 'stone', tint = C.stone, spiral = 0, broken = false) {
    const seg = Math.max(48, flutes * (detail > .5 ? 6 : 4)), rows = Math.max(8, Math.ceil((top - bottom) / Math.max(.035, h * .025)));
    const p = [], uv = [], idx = [];
    const offset = rand() * TAU;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= seg; i++) {
      const t = j / rows, a = i / seg * TAU, y = mix(bottom, top, t);
      const r = radius * (1 - .09 * t + .025 * Math.sin(Math.PI * t)) * (1 - (.025 + carving * .055) * Math.pow(Math.max(0, Math.cos(flutes * (a + spiral * t))), 2));
      const fracture = broken ? (Math.sin(3 * a + offset) + Math.sin(7 * a - offset) * .35) * (t ** 7) * (top - bottom) * (.035 + wear * .09) : 0;
      p.push(x + Math.cos(a) * r, y - fracture, z + Math.sin(a) * r);
      uv.push(i / seg * radius * TAU, y);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const normals = geo.getAttribute('normal');
    for (let j = 0; j <= rows; j++) {
      const a = j * (seg + 1), b = a + seg;
      const n = new THREE.Vector3(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize();
      normals.setXYZ(a, n.x, n.y, n.z); normals.setXYZ(b, n.x, n.y, n.z);
    }
    append(geo, material, tint);
  }
  function inscription(cx, cy, z, width, size, count = 7) {
    if (!inscriptions || carving < .08) return;
    const glyphs = [
      [[[0, 0], [.5, 1], [1, 0]], [[.2, .37], [.8, .37]]],
      [[[0, 0], [0, 1], [1, 1], [1, 0]]],
      [[[0, 0], [.5, 1], [1, 0]], [[.5, 1], [.5, .15]]],
      [[[1, .85], [.5, 1], [0, .5], [.5, 0], [1, .15]]],
      [[[0, 0], [0, 1], [1, .5], [0, 0]]],
      [[[0, 1], [.5, 0], [1, 1]], [[.2, .4], [.8, .4]]],
    ];
    const step = Math.min(size * 1.48, width / (count + 1)), glyphW = step * .53;
    for (let k = 0; k < count; k++) {
      const gx = cx + (k - (count - 1) / 2) * step, gy = cy + (rand() - .5) * size * .07;
      const strokes = glyphs[(Math.floor(rand() * glyphs.length) + k) % glyphs.length];
      for (const stroke of strokes) path(stroke.map(([a, b]) => {
        const y = gy + (b - .5) * size;
        return [gx + (a - .5) * glyphW, y, typeof z === 'function' ? z(y) : z];
      }), Math.max(.002, size * .035 * carving));
    }
  }
  function arch(cx, y0, y1, z, halfWidth, material = 'engraving', tint = dark, radius = .006) {
    const pts = [[cx - halfWidth, y0, z], [cx - halfWidth, y1 - halfWidth * .45, z]];
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI - i / 20 * Math.PI;
      pts.push([cx + Math.cos(a) * halfWidth, y1 - halfWidth + Math.sin(a) * halfWidth, z]);
    }
    pts.push([cx + halfWidth, y0, z]);
    path(pts, radius, material, tint);
  }
  function panel(cx, cy, front, sx, sy, carved = true, facing = 1) {
    const pad = Math.min(sx, sy) * .09;
    box(cx, cy, front, sx, sy, .012, 'engraving', dark, .003);
    box(cx, cy, front + facing * .013, sx - pad * 2, sy - pad * 2, .012, 'trim', C.trim.clone().multiplyScalar(.87), .016);
    box(cx, cy, front + facing * .022, sx - pad * 3.2, sy - pad * 3.2, .006, 'stone', C.stone, .01);
    if (carved && carving > .18) {
      arch(cx, cy - sy * .36, cy + sy * .34, front + facing * .033, sx * .35, 'engraving', dark, Math.max(.003, pad * .085));
      inscription(cx, cy - sy * .14, front + facing * .035, sx * .56, sy * .105, Math.max(3, Math.round(3 + detail * 5)));
    }
  }
  function base(fraction = .18, sx = w, sz = d, y = 0) {
    const top = y + Math.min(h * fraction, h * .32), step = top / 5;
    part('foundation', 'stone', () => box(0, y + step * .48, 0, sx, step * .96, sz, 'stone', C.stone, step * .16), y === 0);
    part('lower-torus', 'trim', () => {
      box(0, y + step * 1.11, 0, sx * .98, step * .35, sz * .98, 'trim', C.trim, step * .12);
      box(0, y + step * 1.49, 0, sx * .94, step * .43, sz * .94, 'trim', C.trim, step * .13);
    });
    part('pedestal', 'stone', () => box(0, y + step * 2.94, 0, sx * .89, step * 2.5, sz * .89, 'stone', C.stone, step * .19));
    part('cornice', 'trim', () => {
      box(0, y + step * 4.29, 0, sx * .94, step * .25, sz * .94, 'trim', C.trim, step * .1);
      box(0, y + step * 4.72, 0, sx * .99, step * .56, sz * .99, 'trim', C.trim, step * .16);
    });
    contacts.push({ upper: 'lower-torus', lower: 'foundation' }, { upper: 'pedestal', lower: 'lower-torus' }, { upper: 'cornice', lower: 'pedestal' });
    return top;
  }
  function cross(cx, cy, z, span, tall, material = 'trim', tint = C.trim) {
    const arm = Math.min(span * .19, tall * .13), tip = arm * .25;
    polygon([
      [cx - arm / 2, cy - tall / 2], [cx + arm / 2, cy - tall / 2], [cx + arm / 2, cy - arm / 2],
      [cx + span / 2 - tip, cy - arm / 2], [cx + span / 2, cy], [cx + span / 2 - tip, cy + arm / 2],
      [cx + arm / 2, cy + arm / 2], [cx + arm / 2, cy + tall / 2 - tip], [cx, cy + tall / 2],
      [cx - arm / 2, cy + tall / 2 - tip], [cx - arm / 2, cy + arm / 2], [cx - span / 2 + tip, cy + arm / 2],
      [cx - span / 2, cy], [cx - span / 2 + tip, cy - arm / 2], [cx - arm / 2, cy - arm / 2],
    ], z, Math.max(.035, Math.min(d * .21, arm * .8)), material, tint, arm * .09);
    if (carving > .3) {
      const front = z + Math.max(.035, Math.min(d * .21, arm * .8)) + arm * .09 + .004;
      path([[cx, cy - tall * .39, front], [cx, cy + tall * .39, front]], arm * .045);
      path([[cx - span * .39, cy, front], [cx + span * .39, cy, front]], arm * .045);
    }
  }
  function sword(cx, bottom, top, z, span, horizontal = false) {
    const len = top - bottom, blade = Math.min(span * .115, len * .105), handle = Math.min(span * .075, len * .11);
    polygon([[cx, top], [cx - blade, top - len * .14], [cx - blade * .72, bottom + len * .34], [cx - blade * .28, bottom + len * .28], [cx - blade * .28, bottom + handle], [cx - span * .42, bottom + handle], [cx - span * .49, bottom + handle * .8], [cx - blade * .25, bottom + handle * .79], [cx - blade * .25, bottom + handle * .22], [cx, bottom], [cx + blade * .25, bottom + handle * .22], [cx + blade * .25, bottom + handle * .79], [cx + span * .49, bottom + handle * .8], [cx + span * .42, bottom + handle], [cx + blade * .28, bottom + handle], [cx + blade * .28, bottom + len * .28], [cx + blade * .72, bottom + len * .34], [cx + blade, top - len * .14]], z, Math.max(.009, d * .025), 'metal', C.metal, Math.max(.002, blade * .08), horizontal);
    if (carving > .25) {
      const a = bottom + len * .32, b = top - len * .15, depth = Math.max(.009, d * .025);
      path(horizontal ? [[cx, z + depth + .012, -a], [cx, z + depth + .012, -b]] : [[cx, a, z + depth + .012], [cx, b, z + depth + .012]], Math.max(.002, blade * .06), 'trim', C.trim);
    }
  }
  function shield(x, y, z, sx, sy) {
    polygon([[x - sx * .5, y + sy * .47], [x + sx * .5, y + sy * .47], [x + sx * .46, y - sy * .07], [x + sx * .24, y - sy * .31], [x, y - sy * .51], [x - sx * .24, y - sy * .31], [x - sx * .46, y - sy * .07]], z, Math.max(.01, d * .023), 'trim', C.trim, .009);
    if (carving > .15) {
      const front = z + Math.max(.01, d * .023) + .012;
      path([[x, y + sy * .32, front], [x + sx * .2, y, front], [x, y - sy * .32, front], [x - sx * .2, y, front], [x, y + sy * .32, front]], .003 + carving * .005);
      path([[x - sx * .31, y + sy * .16, front], [x + sx * .31, y + sy * .16, front]], .003 + carving * .003);
    }
  }
  function spiralColumn(x, z, y0, y1, r, loops, tint, material) {
    const pts = [], n = Math.round(loops * 64);
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = t * TAU * loops;
      pts.push(new THREE.Vector3(x + Math.cos(a) * r, mix(y0, y1, t), z + Math.sin(a) * r));
    }
    append(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, Math.max(.005, r * .055), 8, false), material, tint, new THREE.Matrix4(), material !== 'metal');
  }
  function votives(y, span = w * .31) {
    if (!offerings) return;
    const z = -d * .3;
    for (const x of [-span, span]) {
      part(`offering-${x < 0 ? 'left' : 'right'}`, 'metal', () => {
        lathe(x, z, [[0, y], [.068 * d, y], [.075 * d, y + h * .008], [.042 * d, y + h * .014], [0, y + h * .014]], 'metal', C.metal, 32);
        lathe(x, z, [[0, y + h * .014], [.028 * d, y + h * .014], [.026 * d, y + h * .073], [0, y + h * .073]], 'trim', C.trim, 32);
      });
      if (flame) polygon([[x, y + h * .062], [x - d * .018, y + h * .095], [x, y + h * .14], [x + d * .017, y + h * .095]], z + d * .012, .008, 'flame', C.glow, .003);
    }
  }
   function erodedRemnant(bottom, top, sx, sz) {
     const sides = Math.max(40, Math.round(48 + detail * 32)), rows = Math.max(12, Math.round(14 + detail * 14));
     const pos = [], uv = [], index = [];
     const phase = range(0, TAU), fracture = range(0, TAU);
     for (let j = 0; j <= rows; j++) for (let i = 0; i <= sides; i++) {
       const a = i / sides * TAU, t = j / rows;
       const chip = (Math.sin(a * 5 + phase) * .065 + Math.sin(a * 11 - phase * 1.7) * .026) * (1.3 - carving * .55);
       const facet = 1 + Math.sin(a * 3 + phase) * .055 + Math.sin(a * 7 - phase) * .024;
       const taper = 1 - .19 * t + .06 * Math.sin(t * Math.PI);
       const scuff = wear * (.012 * Math.sin(a * 19 + t * 23 + phase) + .008 * Math.cos(a * 31 - t * 17));
       const rimY = top - (top - bottom) * (.06 + .08 * Math.sin(a * 2 + fracture) + .055 * Math.sin(a * 5 - fracture) + chip);
       const y = mix(bottom, rimY, t), bulge = (facet + scuff) * taper;
       pos.push(Math.cos(a) * sx * bulge + t * sx * .045, y, Math.sin(a) * sz * bulge);
       uv.push(i / sides * sx * TAU, t * (top - bottom));
     }
     for (let j = 0; j < rows; j++) for (let i = 0; i < sides; i++) {
       const a = j * (sides + 1) + i, b = a + sides + 1;
       index.push(a, b, a + 1, a + 1, b, b + 1);
     }
     const center = pos.length / 3;
     pos.push(sx * .04, top - (top - bottom) * .11, 0); uv.push(.5, .5);
     for (let i = 0; i < sides; i++) index.push(center, rows * (sides + 1) + i + 1, rows * (sides + 1) + i);
     const geometry = new THREE.BufferGeometry();
     geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
     geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
     geometry.setIndex(index); geometry.computeVertexNormals();
     append(geometry, 'stone', C.stone);
   }
   function obeliskShaft(y0, y1, bx, bz, tx, tz, pointed = true) {
    const rings = [[y0, bx, bz], [y0 + Math.min(h * .03, (y1 - y0) * .12), bx * .98, bz * .98], [y1 - (pointed ? (y1 - y0) * .13 : 0), tx, tz], [y1, pointed ? .001 : tx * .98, pointed ? .001 : tz * .98]];
    const pos = [], uv = [], idx = [];
    for (const [y, xx, zz] of rings) for (const [x, z] of [[-xx, -zz], [xx, -zz], [xx, zz], [-xx, zz]]) { pos.push(x, y, z); uv.push(x / w + .5, y / h); }
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < 4; i++) {
      const a = j * 4 + i, b = j * 4 + (i + 1) % 4, c = b + 4, e = a + 4;
      idx.push(a, c, b, a, e, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals(); append(geo, 'stone', C.stone);
  }
  const plinth = base(variant === 'knight-tomb' || variant === 'ledger-tomb' ? .12 : .18);
  const topSurface = plinth;
  const front = d * .45;
  const pillarRadius = Math.min(w * .25, d * .28);
  switch (variant) {
    case 'marble-pedestal': {
      const y1 = h * .73, radius = pillarRadius * .72;
      part('marble-shaft', 'stone', () => {
        lathe(0, 0, [[0, plinth], [radius * 1.23, plinth], [radius * 1.23, plinth + h * .025], [radius, plinth + h * .045], [radius, y1], [0, y1]], 'stone', C.stone);
        fluted(0, 0, plinth + h * .048, y1 - h * .018, radius * .98, 16);
      });
      part('marble-capital', 'trim', () => lathe(0, 0, [[0, y1], [radius, y1], [radius * 1.18, y1 + h * .025], [radius * 1.45, y1 + h * .05], [0, y1 + h * .05]], 'trim', C.trim));
      part('abstract-finial', 'stone', () => {
        obeliskShaft(y1 + h * .05, h * .975, radius * .8, radius * .8, radius * .43, radius * .43);
        ring(0, y1 + h * .105, 0, radius * .75, radius * .07);
      });
      panel(0, plinth * .58, front * .96, w * .53, plinth * .4);
      contacts.push({ upper: 'marble-shaft', lower: 'cornice' }, { upper: 'marble-capital', lower: 'marble-shaft' }, { upper: 'abstract-finial', lower: 'marble-capital' });
      break;
    }
    case 'royal-plinth': {
      const y1 = h * .79;
      part('royal-core', 'stone', () => box(0, (plinth + y1) / 2, 0, w * .65, y1 - plinth, d * .67, 'stone', C.stone, w * .03));
      for (const x of [-w * .265, w * .265]) for (const z of [-d * .27, d * .27]) {
        const r = Math.min(w, d) * .055;
        lathe(x, z, [[0, plinth], [r * 1.3, plinth], [r, plinth + h * .025], [r * .8, y1 - h * .025], [r * 1.4, y1], [0, y1]], 'trim', C.trim, 32);
      }
      part('royal-entablature', 'trim', () => {
        box(0, y1 + h * .022, 0, w * .79, h * .045, d * .8, 'trim', C.trim, h * .01);
        box(0, y1 + h * .074, 0, w * .88, h * .06, d * .88, 'trim', C.trim, h * .012);
      });
      part('crown-finial', 'metal', () => {
        const cy = y1 + h * .105, rx = w * .24;
        polygon([[-rx, cy], [-rx * .91, cy + h * .06], [-rx * .55, cy + h * .028], [0, cy + h * .08], [rx * .55, cy + h * .028], [rx * .91, cy + h * .06], [rx, cy]], d * .05, d * .06, 'metal', C.metal, .012);
        ring(0, cy + h * .03, d * .12, Math.min(w, d) * .09, .008, 'trim', C.trim, true);
      });
      panel(0, (plinth + y1) / 2, d * .35, w * .48, (y1 - plinth) * .72);
      part('royal-escutcheon', 'trim', () => shield(0, (plinth + y1) / 2 + h * .075, d * .35 + .036, w * .23, h * .18));
      contacts.push({ upper: 'royal-core', lower: 'cornice' }, { upper: 'royal-entablature', lower: 'royal-core' }, { upper: 'crown-finial', lower: 'royal-entablature' });
      break;
    }
    case 'broken-effigy': {
       const y1 = h * (.68 + range(-.09, .08)), sx = w * .32, sz = d * .19;
       part('eroded-remnant', 'stone', () => erodedRemnant(plinth, y1, sx, sz));

      part('fallen-shard', 'stone', () => box(w * .23, plinth + h * .045, -d * .12, w * .27, h * .09, d * .26, 'stone', C.stone, .02));
      contacts.push({ upper: 'eroded-remnant', lower: 'cornice' }, { upper: 'fallen-shard', lower: 'cornice' });
      break;
    }
    case 'sword-memorial': {
      const top = h * .96;
      part('memorial-stele', 'stone', () => {
        box(0, (plinth + top) / 2, 0, w * .59, top - plinth, d * .48, 'stone', C.stone, w * .035);
        box(0, top - h * .035, 0, w * .69, h * .065, d * .54, 'trim', C.trim, .018);
      });
      part('memorial-sword', 'metal', () => sword(0, plinth + h * .13, top - h * .09, d * .244, w * .42));
      inscription(0, plinth + h * .075, d * .251, w * .4, h * .04, 5);
      contacts.push({ upper: 'memorial-stele', lower: 'cornice' });
      break;
    }
    case 'wayside-cross':
    case 'wheel-cross': {
      const wheel = variant === 'wheel-cross', centerY = h * .77, crossSpan = Math.min(w * .84, h * .37), z = d * .04;
      part('cross-shaft', 'stone', () => {
        box(0, (plinth + centerY) / 2, 0, w * .16, centerY - plinth, d * .23, 'stone', C.stone, w * .022);
        box(0, plinth + h * .035, 0, w * .27, h * .07, d * .3, 'trim', C.trim, .014);
      });
      part('cross-head', 'trim', () => cross(0, centerY, z, crossSpan, Math.min(h * .42, h - centerY + h * .12)));
      if (wheel) {
        part('cross-wheel', 'trim', () => {
          ring(0, centerY, z + d * .1, crossSpan * .48, Math.max(.012, crossSpan * .055), 'trim', C.trim, true);
          ring(0, centerY, z + d * .11, crossSpan * .34, Math.max(.006, crossSpan * .012), 'engraving', dark, true);
        });
      } else {
        for (const x of [-w * .23, w * .23]) ring(x, plinth * .65, front * .99, w * .045, Math.max(.003, w * .007), 'engraving', dark, true);
      }
      contacts.push({ upper: 'cross-shaft', lower: 'cornice' }, { upper: 'cross-head', lower: 'cross-shaft' });
      break;
    }
    case 'knight-tomb':
    case 'ledger-tomb': {
      const ledger = variant === 'ledger-tomb', bottom = plinth, top = h * (ledger ? .7 : .78);
      const sx = w * .87, sz = d * .86;
      part('tomb-chest', 'stone', () => {
        box(0, (bottom + top) / 2, 0, sx, top - bottom, sz, 'stone', C.stone, Math.min(.05, w * .035));
        for (const x of [-sx * .42, sx * .42]) for (const z of [-sz * .42, sz * .42]) box(x, (bottom + top) / 2, z, sx * .12, top - bottom, sz * .13, 'trim', C.trim, .015);
        box(0, bottom + h * .065, 0, sx * 1.08, h * .055, sz * 1.08, 'trim', C.trim, .015);
      });
      part('tomb-lid', 'trim', () => {
        box(0, top + h * .023, 0, w * .94, h * .045, d * .93, 'trim', C.trim, .02);
        box(0, top + h * .06, 0, w * .83, h * .033, d * .81, 'trim', C.stone, .025);
      });
      for (const side of [-1, 1]) panel(0, (bottom + top) / 2, side * (sz * .51), sx * .71, (top - bottom) * .58, side > 0, side);
      if (!ledger) part('knight-escutcheon', 'trim', () => shield(0, (bottom + top) / 2 + h * .035, sz * .51 + .036, w * .22, h * .19));
      for (const side of [-1, 1]) {
        const x = side * (sx * .5 + .009), y0 = bottom + (top - bottom) * .17, y1 = top - (top - bottom) * .17, z0 = -sz * .3, z1 = sz * .3;
        path([[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [x, y0, z0]], .004 + carving * .004);
        if (carving > .2) for (const z of [-sz * .17, 0, sz * .17]) path([[x, y0 + (y1 - y0) * .3, z], [x, y1 - (y1 - y0) * .3, z]], .003 + carving * .002);
      }
      if (ledger) {
        const yy = top + h * .077;
        part('inscribed-ledger', 'stone', () => box(0, yy + h * .018, 0, w * .73, h * .036, d * .69, 'stone', C.trim, .015));
        if (inscriptions) {
          const y = yy + h * .039;
          path([[-w * .31, y, -d * .29], [w * .31, y, -d * .29], [w * .31, y, d * .29], [-w * .31, y, d * .29], [-w * .31, y, -d * .29]], .003 + carving * .003);
          for (let j = 0; j < 3 + Math.round(detail * 5); j++) {
            const z = -d * .23 + j * d * .46 / (3 + Math.round(detail * 5));
            path([[-w * range(.15, .25), y, z], [w * range(.16, .27), y, z]], .002 + carving * .003);
          }
        }
        contacts.push({ upper: 'inscribed-ledger', lower: 'tomb-lid' });
      } else {
        part('recumbent-sword', 'metal', () => sword(0, -d * .24, d * .24, top + h * .077, w * .37, true));
        ring(0, top + h * .084, d * .23, w * .075, Math.max(.004, w * .008), 'trim', C.trim);
      }
      contacts.push({ upper: 'tomb-chest', lower: 'cornice' }, { upper: 'tomb-lid', lower: 'tomb-chest' });
      break;
    }
    case 'obelisk': {
      part('obelisk-pedestal', 'trim', () => {
        box(0, plinth + h * .025, 0, w * .73, h * .05, d * .73, 'trim', C.trim, .015);
        box(0, plinth + h * .065, 0, w * .65, h * .03, d * .65, 'trim', C.trim, .012);
      });
      part('tapered-obelisk', 'stone', () => obeliskShaft(plinth + h * .08, h * .99, w * .29, d * .29, w * .14, d * .14));
      for (const side of [-1, 1]) {
        const faceZ = y => side * (mix(d * .29, d * .14, clamp((y - plinth - h * .08) / (h * .91 - plinth), 0, 1)) + .007);
        inscription(0, plinth + h * .25, faceZ, w * .34, h * .055, 4);
      }
      contacts.push({ upper: 'obelisk-pedestal', lower: 'cornice' }, { upper: 'tapered-obelisk', lower: 'obelisk-pedestal' });
      break;
    }
    case 'cenotaph': {
      const y1 = h * .82;
      part('cenotaph-core', 'stone', () => box(0, (plinth + y1) / 2, 0, w * .7, y1 - plinth, d * .68, 'stone', C.stone, .028));
      for (const x of [-w * .29, w * .29]) for (const z of [-d * .3, d * .3]) {
        const r = Math.min(w, d) * .065;
        lathe(x, z, [[0, plinth], [r * 1.25, plinth], [r, plinth + h * .025], [r * .8, y1 - h * .03], [r * 1.32, y1], [0, y1]], 'trim', C.trim, 32);
      }
      part('cenotaph-pediment', 'trim', () => {
        box(0, y1 + h * .023, 0, w * .88, h * .047, d * .88, 'trim', C.trim, .015);
        polygon([[-w * .42, y1 + h * .046], [w * .42, y1 + h * .046], [0, h * .99]], -d * .4, d * .8, 'trim', C.trim, .014);
      });
      panel(0, (y1 + plinth) / 2, d * .35, w * .53, (y1 - plinth) * .73);
      arch(0, plinth + h * .09, y1 - h * .07, d * .37, w * .235, 'trim', C.trim, .009);
      contacts.push({ upper: 'cenotaph-core', lower: 'cornice' }, { upper: 'cenotaph-pediment', lower: 'cenotaph-core' });
      break;
    }
    case 'victory-column': {
      const radius = pillarRadius * .88, y0 = plinth + h * .08, y1 = h * .82;
      part('column-foot', 'trim', () => lathe(0, 0, [[0, plinth], [radius * 1.37, plinth], [radius * 1.37, plinth + h * .03], [radius * 1.15, y0], [0, y0]], 'trim', C.trim));
      part('triumph-shaft', 'stone', () => fluted(0, 0, y0, y1, radius, 20, 'stone', C.stone, .7));
      for (let k = 1; k <= 2; k++) ring(0, mix(y0, y1, k / 3), 0, radius * .94, Math.max(.008, radius * .035), 'trim', C.trim);
      part('spiral-frieze', 'trim', () => spiralColumn(0, 0, y0 + h * .035, y1 - h * .035, radius * .96, 3 + Math.round(detail * 2), C.trim, 'trim'));
      part('triumph-capital', 'trim', () => {
        lathe(0, 0, [[0, y1], [radius, y1], [radius * 1.3, y1 + h * .035], [radius * 1.37, y1 + h * .06], [0, y1 + h * .06]], 'trim', C.trim);
        box(0, y1 + h * .083, 0, w * .72, h * .045, d * .72, 'trim', C.trim, .01);
      });
       part('sunburst-finial', 'metal', () => {
         const rr = Math.min(Math.min(w, d) * .16, h * .043);
         const cy = y1 + h * .1055 + rr + Math.max(.006, rr * .09) - .012;
         ring(0, cy, d * .045, rr, Math.max(.006, rr * .09), 'metal', C.metal, true);
         ring(0, cy, d * .057, rr * .5, Math.max(.005, rr * .065), 'trim', C.trim, true);
         for (let i = 0; i <= 8; i++) {
           const a = i / 8 * Math.PI;
           const x = Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
           polygon([[x + Math.cos(a - .2) * rr * .05, y + Math.sin(a - .2) * rr * .05], [x + Math.cos(a) * rr * .29, y + Math.sin(a) * rr * .29], [x + Math.cos(a + .2) * rr * .05, y + Math.sin(a + .2) * rr * .05]], d * .07, .008, 'metal', C.metal, .002);
         }
       });
       contacts.push({ upper: 'column-foot', lower: 'cornice' }, { upper: 'triumph-shaft', lower: 'column-foot' }, { upper: 'triumph-capital', lower: 'triumph-shaft' }, { upper: 'sunburst-finial', lower: 'triumph-capital' });
      break;
    }
    case 'eternal-brazier': {
      const r = Math.min(w * .36, d * .39), cy = h * .72;
      part('brazier-pillar', 'stone', () => {
        lathe(0, 0, [[0, plinth], [r * .45, plinth], [r * .49, plinth + h * .045], [r * .34, cy - h * .085], [r * .57, cy - h * .05], [0, cy - h * .05]], 'stone', C.stone);
        fluted(0, 0, plinth + h * .055, cy - h * .07, r * .41, 12);
      });
      part('iron-firebowl', 'metal', () => {
        lathe(0, 0, [[0, cy - h * .06], [r * .58, cy - h * .06], [r * .7, cy], [r * .97, cy + h * .045], [r * 1.1, cy + h * .13], [r * 1.08, cy + h * .14], [r * .96, cy + h * .14], [r * .7, cy + h * .085], [0, cy + h * .085]], 'metal', C.metal);
        ring(0, cy + h * .135, 0, r * 1.035, Math.max(.01, r * .045), 'trim', C.trim);
      });
      for (let k = 0; k < 8 + Math.round(detail * 8); k++) {
        const a = k / (8 + Math.round(detail * 8)) * TAU;
        const x = Math.cos(a) * r * .85, z = Math.sin(a) * r * .85;
        lathe(x, z, [[0, cy + h * .083], [r * .045, cy + h * .083], [r * .06, cy + h * .09], [0, cy + h * .09]], 'trim', C.trim, 24);
      }
      if (flame) {
        part('perpetual-flame', 'flame', () => {
          for (let k = 0; k < 5 + Math.round(detail * 5); k++) {
            const a = k * 2.39996, r0 = Math.sqrt(k / 12) * r * .52;
            const x = Math.cos(a) * r0, z = Math.sin(a) * r0;
            const y0 = cy + h * .095, high = h * range(.09, .17);
            polygon([[x, y0], [x - r * .09, y0 + high * .44], [x + r * .06, y0 + high], [x + r * .13, y0 + high * .5], [x + r * .1, y0]], z - r * .065, r * .13, 'flame', C.glow, .003);
          }
        });
      }
      contacts.push({ upper: 'brazier-pillar', lower: 'cornice' }, { upper: 'iron-firebowl', lower: 'brazier-pillar' });
      break;
    }
    default: {
      part('plain-stone', 'stone', () => obeliskShaft(plinth, h * .97, w * .32, d * .32, w * .25, d * .25, false));
      contacts.push({ upper: 'plain-stone', lower: 'cornice' });
    }
  }
  if (variant === 'knight-tomb' || variant === 'ledger-tomb') votives(h * (variant === 'ledger-tomb' ? .7 : .78) + h * .077, w * .32);
  else votives(topSurface, w * .32);
  let tex = null;
  if (options.textures !== false) {
    const size = 128, albedo = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4);
    const hash = (x, y) => { let n = Math.imul((x & 127) + 1, 374761393) ^ Math.imul((y & 127) + 1, 668265263) ^ seed; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
    const field = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy;
      const a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
      return mix(mix(hash(ix, iy), hash(ix + 1, iy), a), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), a), b);
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const sample = (a, b) => field(a / size * 8, b / size * 8) * .6 + field(a / size * 32, b / size * 32) * .25 + hash(a, b) * .15;
      const f = sample(x, y), dx = sample((x + 1) % size, y) - sample((x + size - 1) % size, y);
      const dy = sample(x, (y + 1) % size) - sample(x, (y + size - 1) % size);
      const i = (y * size + x) * 4;
      const tone = clamp(Math.round(225 + (f - .5) * (25 + wear * 38)), 0, 255);
      albedo.set([tone, tone, tone, 255], i);
      const nn = new THREE.Vector3(-dx * 2.2, -dy * 2.2, 1).normalize();
      normal.set([Math.round((nn.x * .5 + .5) * 255), Math.round((nn.y * .5 + .5) * 255), Math.round((nn.z * .5 + .5) * 255), 255], i);
    }
    const texture = (data, colorSpace) => {
      const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      t.colorSpace = colorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true; t.needsUpdate = true;
      return t;
    };
    tex = { map: texture(albedo, THREE.SRGBColorSpace), normal: texture(normal, THREE.NoColorSpace) };
  }
  const mats = {
    stone: new THREE.MeshStandardMaterial({ vertexColors: true, map: tex?.map || null, normalMap: tex?.normal || null, roughness, metalness: 0 }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, map: tex?.map || null, normalMap: tex?.normal || null, roughness: Math.max(.32, roughness * .82), metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .72, roughness: Math.max(.34, roughness * .7) }),
    engraving: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    flame: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: C.glow, emissiveIntensity: 2.4, roughness: .5, metalness: 0, side: THREE.DoubleSide }),
  };
  let triangles = 0, vertices = 0, drawCalls = 0;
  for (const [name, b] of buckets) {
    if (!b.index.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.color, 3));
    geo.setIndex(b.index); geo.computeBoundingBox(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats[name]);
    mesh.name = name; mesh.castShadow = name !== 'flame' && name !== 'engraving';
    mesh.receiveShadow = name !== 'flame';
    root.add(mesh);
    triangles += b.index.length / 3; vertices += b.pos.length / 3; drawCalls++;
  }
  root.userData.stats = { triangles, vertices, drawCalls };
  root.userData.parts = parts;
  root.userData.contacts = contacts.filter(c => parts.some(p => p.name === c.upper) && parts.some(p => p.name === c.lower));
  root.userData.dispose = () => {
    root.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
    Object.values(mats).forEach(material => material.dispose());
    if (tex) Object.values(tex).forEach(texture => texture.dispose());
  };
  return root;
}

export default createStatue;
