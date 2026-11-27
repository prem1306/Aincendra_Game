import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function createHeraldry(config, template, options = {}) {
  const id = config?.variant || template?.id || 'standard';
  const value = (v, lo, hi, fallback) => Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
  const w = value(config?.width, .4, 12, 2), d = value(config?.depth, .15, 4, .5), h = value(config?.height, .5, 12, 3);
  const detail = value(config?.detail, 0, 1, .75), wear = value(config?.wear, 0, 1, .15), wind = value(config?.wind, 0, 1, .2);
  const roughness = value(config?.roughness, .2, 1, .82);
  let state = (Number.isFinite(config?.seed) ? Math.trunc(config.seed) : 4721) >>> 0;
  const seed = state;
  const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const color = (key, fallback) => new THREE.Color(typeof config?.[key] === 'string' && /^#[0-9a-f]{6}$/i.test(config[key]) ? config[key] : fallback);
  const C = { primary: color('primaryColor', '#922d38'), secondary: color('secondaryColor', '#e9d8af'), trim: color('trimColor', '#d7ae62'), wood: color('woodColor', '#61462f'), metal: color('metalColor', '#85817a'), cloth: color('clothColor', '#e3d4ba') };
  const root = new THREE.Group(); root.name = template?.id || id;
  const buckets = new Map(), parts = [], contacts = [];
  const bucket = kind => { if (!buckets.has(kind)) buckets.set(kind, { pos: [], normal: [], uv: [], color: [], index: [], motion: [] }); return buckets.get(kind); };
  const mark = (name, kind, fn, grounded = false) => { const b = bucket(kind), start = b.pos.length / 3; fn(); const count = b.pos.length / 3 - start; if (count) parts.push({ name, bucket: kind, start, count, ...(grounded ? { grounded: true } : {}) }); };
  const join = (upper, lower) => contacts.push({ upper, lower });
  function append(g, kind, tint, matrix = new THREE.Matrix4(), motion = 0) {
    const b = bucket(kind), offset = b.pos.length / 3;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position'), normal = g.getAttribute('normal'), uv = g.getAttribute('uv');
    const nm = new THREE.Matrix3().getNormalMatrix(matrix), p = new THREE.Vector3(), n = new THREE.Vector3();
    const tone = .94 + rand() * .09 - wear * rand() * .065;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(matrix); n.fromBufferAttribute(normal, i).applyMatrix3(nm).normalize();
      b.pos.push(p.x, p.y, p.z); b.normal.push(n.x, n.y, n.z);
      b.uv.push(uv ? uv.getX(i) : p.x * 3, uv ? uv.getY(i) : p.y * 3);
      b.color.push(clamp(tint.r * tone, 0, 1), clamp(tint.g * tone, 0, 1), clamp(tint.b * tone, 0, 1)); b.motion.push(motion);
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) b.index.push(offset + index.getX(i));
    else for (let i = 0; i < pos.count; i++) b.index.push(offset + i);
    g.dispose();
  }
  function rod(a, b, radius, kind = 'wood', tint = C[kind], sides = 12, motion = 0) {
    const p = new THREE.Vector3(...a), q = new THREE.Vector3(...b), delta = q.clone().sub(p);
    if (delta.length() < .00001) return;
    const matrix = new THREE.Matrix4().compose(p.add(q).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()), new THREE.Vector3(1, 1, 1));
    append(new THREE.CylinderGeometry(radius, radius, delta.length(), sides), kind, tint, matrix, motion);
  }
  function tube(points, radius, kind = 'trim', tint = C[kind], motion = 0) {
    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    append(new THREE.TubeGeometry(curve, Math.max(12, points.length * 3), radius, detail > .45 ? 7 : 5, false), kind, tint, new THREE.Matrix4(), motion);
  }
  function sphere(x, y, z, r, kind = 'metal', tint = C[kind]) {
    append(new THREE.SphereGeometry(r, 12 + Math.round(detail * 12), 8 + Math.round(detail * 8)), kind, tint, new THREE.Matrix4().makeTranslation(x, y, z));
  }
  function box(x, y, z, sx, sy, sz, kind = 'wood', tint = C[kind], bevel = .012) {
    const b = Math.min(bevel, sx * .15, sy * .15, sz * .15);
    const shape = new THREE.Shape(); shape.moveTo(-sx / 2 + b, -sy / 2);
    shape.lineTo(sx / 2 - b, -sy / 2); shape.lineTo(sx / 2, -sy / 2 + b); shape.lineTo(sx / 2, sy / 2 - b);
    shape.lineTo(sx / 2 - b, sy / 2); shape.lineTo(-sx / 2 + b, sy / 2); shape.lineTo(-sx / 2, sy / 2 - b); shape.lineTo(-sx / 2, -sy / 2 + b); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(.002, sz - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * .5, bevelSegments: detail > .4 ? 2 : 1 });
    g.translate(0, 0, -sz / 2 + b); append(g, kind, tint, new THREE.Matrix4().makeTranslation(x, y, z));
  }
  function ring(x, y, z, radius, tubeRadius, kind = 'metal', tint = C[kind], rotation = 0) {
    const mat = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationX(rotation));
    append(new THREE.TorusGeometry(radius, tubeRadius, 7, 24), kind, tint, mat);
  }
  function panel(x, y, z, points, thickness, kind, tint) {
    const shape = new THREE.Shape(); shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: .009, bevelSize: .006, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -thickness / 2); append(g, kind, tint, new THREE.Matrix4().makeTranslation(x, y, z));
  }
  const shieldCrown = x => d * .12 * Math.max(0, 1 - (x / (w * .46)) ** 2);
  const pattern = ['plain', 'pale', 'bend', 'chevron', 'quartered'].includes(config?.pattern) ? config.pattern : 'plain';
  function field(u, v) {
    if (pattern === 'pale') return Math.abs(u - .5) < .18 ? C.secondary : C.primary;
    if (pattern === 'quartered') return (u < .5) !== (v < .5) ? C.primary : C.secondary;
    if (pattern === 'bend') return Math.abs(v - (1 - u)) < .17 ? C.secondary : C.primary;
    if (pattern === 'chevron') return Math.abs(v - (.32 + Math.abs(u - .5) * .85)) < .14 ? C.secondary : C.primary;
    return C.primary;
  }
  function fabric(spec) {
    const { name, left, top, width, length, z = 0, tail = 'square', anchor = 'top', pigment = null, facing = 1 } = spec;
    const nx = Math.round(24 + detail * 28), ny = Math.round(16 + detail * 24);
    const phase = seed * .00019 + left * 1.3;
    const flex = id === 'shield' || id === 'sign' ? 0 : wind;
    const bottomLift = u => {
      if (tail === 'fork') return .37 * Math.max(0, 1 - Math.abs(u - .5) * 7);
      if (tail === 'scallop') return .065 * (1 + Math.cos(u * TAU * 3));
      if (tail === 'point') return .9 * Math.abs(u - .5) * 2;
      if (tail === 'swallow') return .25 * Math.max(0, 1 - Math.abs(u - .5) * 3);
      return 0;
    };
    const motion = (u, v) => flex * (anchor === 'pole' ? Math.pow(u, 1.3) * (.3 + .7 * v) : Math.pow(v, 1.35)) * (id === 'tapestry' || id === 'tabard' ? .2 : 1);
    function point(u, v, offset = 0) {
      const taper = tail === 'shield' ? v < .48 ? 1 - v * .1 : Math.max(.004, .952 * Math.pow((1 - v) / .52, .8)) : 1;
      const x = left + width * (.5 + (u - .5) * taper);
      const lift = bottomLift(u) * Math.pow(v, 13);
      const y = top - v * length * (1 - lift) + (tail === 'shield' ? Math.sin(Math.PI * u) * length * .055 * (1 - v) : 0);
      const rigid = id === 'shield' || id === 'sign';
      const drape = rigid ? 0 : Math.sin(u * Math.PI * 7 + phase) * width * .012 * Math.sin(v * Math.PI * .9) +
        Math.sin(u * TAU * 1.3 + v * 2.9 + phase) * flex * Math.pow(anchor === 'pole' ? u : v, 1.3) * width * .045;
      const sag = rigid ? 0 : anchor === 'pole' ? .04 * v * width : .018 * Math.sin(u * Math.PI) * length;
      return [x + (anchor === 'pole' ? flex * u * u * width * .055 : 0), y - sag, z + drape + facing * offset + (tail === 'shield' ? shieldCrown(x) : 0)];
    }
    mark(name, 'cloth', () => {
      const b = bucket('cloth'), start = b.pos.length / 3;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const u = i / nx, v = j / ny, p = point(u, v);
        b.pos.push(...p); b.uv.push(u * width * 3, v * length * 3);
        const tone = 1 - wear * (.025 + .055 * Math.sin(u * 39 + v * 23 + phase) ** 4);
        const c = pigment || field(u, v); b.color.push(c.r * tone, c.g * tone, c.b * tone);
        b.normal.push(0, 0, facing); b.motion.push(motion(u, v));
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const a = start + j * (nx + 1) + i, c = a + nx + 1;
        if (facing > 0) b.index.push(a, c, a + 1, a + 1, c, c + 1);
        else b.index.push(a, a + 1, c, a + 1, c + 1, c);
      }
    });
    const seam = Math.max(.004, Math.min(width, length) * .006);
    for (const side of [0, 1]) tube(Array.from({ length: 16 }, (_, i) => point(side, i / 15, facing * .006)), seam, 'trim', C.trim);
    tube(Array.from({ length: 20 }, (_, i) => point(i / 19, 1, facing * .007)), seam * 1.1, 'trim', C.trim);
    if (anchor !== 'pole') tube(Array.from({ length: 16 }, (_, i) => point(i / 15, 0, facing * .006)), seam, 'trim', C.trim);
    const hem = Math.min(.075, length * .08);
    if (detail > .26) for (let i = 0; i < Math.min(38, Math.round(width * 11)); i++) {
      const u = (i + .5) / Math.min(38, Math.round(width * 11));
      const p = point(u, 1, facing * .009);
      rod(p, [p[0] + wind * .012, p[1] - hem * (.6 + rand() * .3), p[2]], seam * .3, 'trim', C.trim, 6);
    }
    if (config?.tassels !== false && tail !== 'point' && tail !== 'fork') for (const u of [0, 1]) {
      const p = point(u, 1); rod(p, [p[0], p[1] - hem * 1.3, p[2]], seam * .8, 'cord', C.trim, 8);
      sphere(p[0], p[1] - hem * 1.5, p[2], seam * 2.1, 'trim', C.trim);
    }
    function applique(shape, tint, centerU, centerV, scaleU, scaleV, layer, side) {
      const g = new THREE.ShapeGeometry(shape, Math.round(10 + detail * 14));
      const p = g.getAttribute('position'), ix = g.getIndex(), b = bucket('embroidery');
      function vertex(a, c, e, fa, fc, fe) {
        const u = clamp(centerU + (p.getX(a) * fa + p.getX(c) * fc + p.getX(e) * fe) * scaleU, .02, .98);
        const v = clamp(centerV - (p.getY(a) * fa + p.getY(c) * fc + p.getY(e) * fe) * scaleV, .02, .98);
        const pos = point(u, v, side * layer);
        const index = b.pos.length / 3;
        b.pos.push(...pos); b.uv.push(u * width * 3, v * length * 3);
        b.color.push(tint.r, tint.g, tint.b); b.normal.push(0, 0, side); b.motion.push(motion(u, v));
        return index;
      }
      for (let k = 0; k < ix.count; k += 3) {
        const a = ix.getX(k), c = ix.getX(k + 1), e = ix.getX(k + 2);
        const us = [a, c, e].map(i => centerU + p.getX(i) * scaleU), vs = [a, c, e].map(i => centerV - p.getY(i) * scaleV);
        const steps = Math.min(16, Math.max(1, Math.ceil(Math.max((Math.max(...us) - Math.min(...us)) * nx, (Math.max(...vs) - Math.min(...vs)) * ny) * .72)));
        const rows = [];
        for (let j = 0; j <= steps; j++) {
          const row = [];
          for (let i = 0; i <= steps - j; i++) row.push(vertex(a, c, e, 1 - (i + j) / steps, i / steps, j / steps));
          rows.push(row);
        }
        for (let j = 0; j < steps; j++) for (let i = 0; i < steps - j; i++) {
          const x = rows[j][i], y = rows[j][i + 1], z0 = rows[j + 1][i];
          if (side > 0) b.index.push(x, y, z0); else b.index.push(x, z0, y);
          if (i + j < steps - 1) {
            const q = rows[j + 1][i + 1];
            if (side > 0) b.index.push(y, q, z0); else b.index.push(y, z0, q);
          }
        }
      }
      g.dispose();
    }
    if (!pigment) for (const side of id === 'shield' || id === 'sign' || id === 'tabard' ? [facing] : [1, -1]) {
      mark(`${name}-${side > 0 ? 'front' : 'back'}-device`, 'embroidery', () => {
        if (config?.sigil !== 'none') {
          const sigil = config?.sigil || 'lion';
          const contrasting = pattern === 'quartered' || pattern === 'pale' ? C.trim : C.secondary;
          const disk = new THREE.Shape(); disk.absarc(0, 0, .53, 0, TAU, false);
          applique(disk, field(.5, .5).clone().lerp(C.wood, .3), .5, .49, .63, .63, .016, side);
          const inner = new THREE.Shape(); inner.absarc(0, 0, .465, 0, TAU, false);
          applique(inner, contrasting, .5, .49, .63, .63, .023, side);
          const medallion = new THREE.Shape(); medallion.absarc(0, 0, .408, 0, TAU, false);
          applique(medallion, C.primary, .5, .49, .63, .63, .03, side);
          for (const shape of charge(sigil)) applique(shape, contrasting, .5, .49, .62, .62, .038, side);
        }
        if (detail > .35) {
          const diamond = polygon([[0, .85], [.44, 0], [0, -.85], [-.44, 0]]);
          const step = Math.min(16, Math.max(6, Math.round(length * 6)));
          for (let j = 1; j < step; j++) for (const u of [.045, .955]) applique(diamond, C.trim, u, j / step, .037, .03, .032, side);
          const across = Math.min(18, Math.max(2, Math.round(width * 6)));
          for (let j = 1; j < across; j++) {
            const u = j / across;
            applique(diamond, C.trim, u, .045, .027, .026, .032, side);
            if (tail === 'square') applique(diamond, C.trim, u, .96, .027, .026, .032, side);
          }
        }
      });
    }
    return { point, left, top, width, length };
  }
  function polygon(points) { const s = new THREE.Shape(); s.moveTo(...points[0]); for (let i = 1; i < points.length; i++) s.lineTo(...points[i]); s.closePath(); return s; }
  function charge(sigil) {
    const shapes = [], poly = points => shapes.push(polygon(points));
    if (sigil === 'sun') {
      const s = new THREE.Shape(); s.absarc(0, 0, .21, 0, TAU, false); shapes.push(s);
      for (let i = 0; i < 16; i++) { const a = i * TAU / 16; poly([[Math.cos(a - .12) * .24, Math.sin(a - .12) * .24], [Math.cos(a) * .4, Math.sin(a) * .4], [Math.cos(a + .12) * .24, Math.sin(a + .12) * .24]]); }
      const eye = new THREE.Shape(); eye.absarc(-.06, .045, .017, 0, TAU, false); shapes.push(eye);
      const eye2 = new THREE.Shape(); eye2.absarc(.06, .045, .017, 0, TAU, false); shapes.push(eye2);
    } else if (sigil === 'tower') {
      poly([[-.27, -.34], [.27, -.34], [.27, .27], [.2, .27], [.2, .35], [.1, .35], [.1, .27], [.05, .27], [.05, .35], [-.05, .35], [-.05, .27], [-.1, .27], [-.1, .35], [-.2, .35], [-.2, .27], [-.27, .27]]);
      poly([[-.36, -.35], [.36, -.35], [.36, -.3], [-.36, -.3]]);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) poly([[-.2 + i * .14, -.25 + j * .14], [-.14 + i * .14, -.25 + j * .14], [-.14 + i * .14, -.225 + j * .14], [-.2 + i * .14, -.225 + j * .14]]);
    } else if (sigil === 'cross') {
      poly([[-.085, -.36], [.085, -.36], [.085, -.09], [.36, -.09], [.36, .09], [.085, .09], [.085, .36], [-.085, .36], [-.085, .09], [-.36, .09], [-.36, -.09], [-.085, -.09]]);
      for (const x of [-.31, .31]) for (const y of [-.3, .3]) poly([[x - .025, y - .025], [x + .025, y - .025], [x + .025, y + .025], [x - .025, y + .025]]);
    } else if (sigil === 'fleur') {
      const s = new THREE.Shape(); s.moveTo(0, .38); s.bezierCurveTo(-.17, .2, -.16, .08, -.07, -.04); s.bezierCurveTo(-.35, .29, -.42, .11, -.29, -.16); s.bezierCurveTo(-.15, -.12, -.14, -.08, -.14, -.06); s.lineTo(-.28, -.07); s.lineTo(-.27, -.15); s.lineTo(-.1, -.16); s.lineTo(-.13, -.34); s.lineTo(.13, -.34); s.lineTo(.1, -.16); s.lineTo(.27, -.15); s.lineTo(.28, -.07); s.lineTo(.14, -.06); s.bezierCurveTo(.14, -.08, .15, -.12, .29, -.16); s.bezierCurveTo(.42, .11, .35, .29, .07, -.04); s.bezierCurveTo(.16, .08, .17, .2, 0, .38); shapes.push(s);
      poly([[-.23, -.21], [.23, -.21], [.23, -.16], [-.23, -.16]]);
    } else if (sigil === 'stag') {
      poly([[-.23, -.26], [-.11, -.2], [-.08, -.06], [-.15, .04], [-.09, .12], [0, .04], [.09, .12], [.15, .04], [.08, -.06], [.11, -.2], [.23, -.26], [.08, -.27], [0, -.35], [-.08, -.27]]);
      for (const side of [-1, 1]) {
        const s = new THREE.Shape(); s.moveTo(side * .09, .08); s.bezierCurveTo(side * .19, .19, side * .29, .28, side * .36, .36); s.lineTo(side * .27, .28); s.lineTo(side * .35, .27); s.lineTo(side * .3, .22); s.lineTo(side * .21, .23); s.lineTo(side * .25, .15); s.lineTo(side * .19, .13); s.lineTo(side * .09, -.015); s.closePath(); shapes.push(s);
        poly([[side * .15, .05], [side * .22, .1], [side * .24, -.01]]);
      }
    } else {
      const body = new THREE.Shape(); body.moveTo(-.27, -.06); body.bezierCurveTo(-.3, .19, -.14, .29, .08, .21); body.lineTo(.21, .33); body.lineTo(.3, .22); body.lineTo(.23, .13); body.lineTo(.32, .04); body.lineTo(.22, .005); body.lineTo(.2, -.13); body.lineTo(.31, -.28); body.lineTo(.19, -.3); body.lineTo(.07, -.15); body.lineTo(-.08, -.12); body.lineTo(-.1, -.29); body.lineTo(-.2, -.29); body.lineTo(-.22, -.11); body.closePath(); shapes.push(body);
      poly([[-.16, -.07], [-.34, .03], [-.37, .2], [-.32, .32], [-.26, .27], [-.3, .14], [-.19, .08]]);
      poly([[.02, -.16], [.06, -.34], [.14, -.34], [.19, -.22]]);
      for (let i = 0; i < 7; i++) { const a = -1.3 + i * .34; poly([[-.12 + Math.cos(a) * .13, .1 + Math.sin(a) * .12], [-.12 + Math.cos(a + .16) * .16, .1 + Math.sin(a + .16) * .16], [-.12 + Math.cos(a + .32) * .13, .1 + Math.sin(a + .32) * .12]]); }
    }
    return shapes;
  }
  function finial(x, y, z, radius) {
    sphere(x, y, z, radius * 1.35, 'trim', C.trim);
    rod([x, y + radius], [x, y + radius * 4], radius * .55, 'metal', C.metal, 12);
    sphere(x, y + radius * 4, z, radius * .75, 'trim', C.trim);
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4; rod([x, y + radius * 2.5, z], [x + Math.cos(a) * radius * 1.5, y + radius * 2.5, z + Math.sin(a) * radius * 1.5], radius * .13, 'trim', C.trim, 6); }
  }
  function upright(x, top, radius) {
    mark('pole', 'wood', () => rod([x, 0, 0], [x, top, 0], radius, 'wood', C.wood, 18), true);
    for (const y of [radius * 2, top * .52, top * .83]) ring(x, y, 0, radius * 1.03, radius * .12, 'metal', C.metal, Math.PI / 2);
    finial(x, top, 0, radius);
  }
  function hanging(barY, barW, barR, clothTop, clothLen, tail, freestanding = false) {
    const x = 0;
    mark('crossbar', 'wood', () => rod([-barW / 2 - barR, barY, 0], [barW / 2 + barR, barY, 0], barR, 'wood', C.wood, 16));
    for (const side of [-1, 1]) sphere(side * (barW / 2 + barR), barY, 0, barR * 1.4, 'trim', C.trim);
    if (freestanding) {
      upright(0, h - barR * 3, barR * 1.35);
      join('crossbar', 'pole');
    } else {
      for (const side of [-1, 1]) {
        const x0 = side * (barW * .38);
        ring(x0, barY + barR * 1.6, 0, barR * .65, barR * .23, 'metal', C.metal, Math.PI / 2);
        rod([x0, barY + barR * 2, 0], [x0, h, -.04], barR * .24, 'cord', C.trim, 7);
      }
    }
    const cloth = fabric({ name: 'banner', left: -barW / 2, top: clothTop, width: barW, length: clothLen, tail });
    join('banner', 'crossbar'); return cloth;
  }
  if (id === 'standard' || id === 'pennon') {
    const r = Math.max(.026, w * .024), flagW = w * .82;
    upright(-w * .48, h - r * 3, r);
    const len = id === 'pennon' ? h * .36 : h * .51;
    const top = h - r * 5;
    const flag = fabric({ name: 'banner', left: -w * .48 + r * .75, top, width: flagW, length: len, tail: id === 'pennon' ? 'fork' : 'swallow', anchor: 'pole' });
    for (let i = 0; i < 4; i++) {
      const y = top - i * .095 * len;
      ring(-w * .48 + r * 1.2, y, 0, r * .52, r * .2, 'metal', C.metal);
    }
    join('banner', 'pole');
    if (id === 'standard') {
      rod([-w * .48, .05, 0], [-w * .48 + .23, .04, d * .5], r * .65, 'wood');
      rod([-w * .48, .05, 0], [-w * .48 - .23, .04, -d * .5], r * .65, 'wood');
    }
    if (config?.tassels !== false) { const tip = flag.point(1, 1); sphere(...tip, r * .48, 'trim', C.trim); }
  } else if (id === 'vexillum') {
    const r = w * .027;
    hanging(h - r * 6, w * .86, r * .85, h - r * 6.5, h * .51, 'square', true);
    for (const side of [-1, 1]) rod([0, h - r * 8, 0], [side * w * .43, h - r * 6, 0], r * .18, 'cord', C.trim, 6);
  } else if (id === 'gonfalon') {
    const r = w * .028;
    hanging(h - r * 7, w * .89, r, h - r * 7.6, h * .68, 'scallop', true);
    for (let i = -1; i <= 1; i++) {
      const x = i * w * .28, y = h * .24;
      const band = fabric({ name: `tail-${i}`, left: x - w * .08, top: y, width: w * .16, length: h * .12, tail: 'point', pigment: i ? C.secondary : C.trim });
      join(`tail-${i}`, 'banner');
      if (config?.tassels !== false) { const p = band.point(.5, 1); sphere(...p, r * .4, 'trim', C.trim); }
    }
  } else if (id === 'tapestry') {
    const r = Math.max(.022, w * .011), top = h * .91;
    mark('rail', 'wood', () => rod([-w * .53, top, -.025], [w * .53, top, -.025], r, 'wood', C.wood, 18));
    const banner = fabric({ name: 'banner', left: -w * .5, top: top - r * .4, width: w, length: h * .78, z: .01, tail: 'square' });
    join('banner', 'rail');
    for (const side of [-1, 1]) {
      sphere(side * w * .53, top, -.025, r * 1.55, 'trim', C.trim);
      ring(side * w * .44, top + r, -.045, r * 1.1, r * .26, 'metal', C.metal, Math.PI / 2);
    }
    for (let i = 0; i < 2; i++) {
      const x = (i - .5) * w * .76;
      rod([x, top + r, -.045], [x, h, -.045], r * .24, 'cord', C.trim, 7);
    }
    if (detail > .3) for (let i = 0; i < 9; i++) {
      const u = (i + 1) / 10;
      const p = banner.point(u, .965, .018);
      rod(p, [p[0], p[1] - h * .055, p[2]], r * .22, 'trim', C.trim, 6);
    }
  } else if (id === 'shield') {
    const sx = w * .46, bottom = h * .1, shieldH = h * .75, z = d * .15, midY = bottom + shieldH * .55;
    function contour(scale, Shape = THREE.Shape) {
      const s = new Shape(), a = sx * scale, b = shieldH * scale;
      s.moveTo(-a * .88, b * .43);
      s.quadraticCurveTo(0, b * .57, a * .88, b * .43);
      s.quadraticCurveTo(a * 1.02, b * .39, a * .97, b * .13);
      s.lineTo(a * .89, -b * .15);
      s.quadraticCurveTo(a * .78, -b * .38, 0, -b * .55);
      s.quadraticCurveTo(-a * .78, -b * .38, -a * .89, -b * .15);
      s.lineTo(-a * .97, b * .13);
      s.quadraticCurveTo(-a * 1.02, b * .39, -a * .88, b * .43);
      s.closePath(); return s;
    }
    mark('shield', 'wood', () => {
      const g = new THREE.ExtrudeGeometry(contour(1), { depth: d * .19, bevelEnabled: true, bevelThickness: .012, bevelSize: .008, bevelSegments: 3, curveSegments: 12 });
      g.translate(0, 0, -d * .095);
      const positions = g.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const depth = positions.getZ(i);
        if (depth > 0) positions.setZ(i, depth + shieldCrown(positions.getX(i)) * Math.min(1, depth / (d * .095)));
      }
      g.computeVertexNormals();
      append(g, 'wood', C.wood, new THREE.Matrix4().makeTranslation(0, midY, z));
    });
    const faceZ = z + d * .095 + .012;
    mark('shield-rim', 'metal', () => {
      const s = contour(1.005);
      const inner = contour(.91).getPoints(96);
      const hole = new THREE.Path(); hole.setFromPoints(inner.reverse()); s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: .024, bevelEnabled: true, bevelThickness: .005, bevelSize: .004, bevelSegments: 3, curveSegments: 14 });
      g.translate(0, 0, faceZ - z - .006);
      const positions = g.getAttribute('position');
      for (let i = 0; i < positions.count; i++) positions.setZ(i, positions.getZ(i) + shieldCrown(positions.getX(i)));
      g.computeVertexNormals();
      append(g, 'metal', C.metal, new THREE.Matrix4().makeTranslation(0, midY, z));
    });
    join('shield-rim', 'shield');
    const cloth = fabric({ name: 'shield-field', left: -sx * .88, top: bottom + shieldH * .97, width: sx * 1.76, length: shieldH * .96, z: faceZ + .018, tail: 'shield' });
    join('shield-field', 'shield');
    if (detail > .25) {
      const points = contour(.956).getSpacedPoints(Math.round(22 + detail * 16));
      for (let i = 0; i < points.length - 1; i += 2) {
        const p = points[i]; sphere(p.x, midY + p.y, faceZ + .026 + shieldCrown(p.x), w * .009, 'trim', C.trim);
      }
      for (const u of [.3, .5, .7]) { const p = cloth.point(u, .075, .018); sphere(...p, w * .008, 'trim', C.trim); }
    }
    mark('shield-easel', 'wood', () => {
      for (const side of [-1, 1]) {
        rod([side * sx * .45, 0, -d * .2], [side * sx * .28, shieldH * .54, -d * .08], w * .024, 'wood', C.wood, 12);
        rod([side * sx * .45, 0, -d * .2], [0, shieldH * .26, -d * .08], w * .02, 'wood', C.wood, 12);
      }
      box(0, shieldH * .32, -d * .06, w * .2, h * .04, d * .25, 'wood');
    }, true);
    join('shield', 'shield-easel');
  } else if (id === 'tabard') {
    const shoulder = h * .81, bodyTop = shoulder - h * .045, torso = h * .62;
    mark('stand', 'wood', () => { rod([0, 0, 0], [0, h * .95, 0], w * .025, 'wood', C.wood, 14); rod([-w * .32, .02, 0], [w * .32, .02, 0], w * .02, 'wood'); rod([0, .02, -d * .4], [0, .02, d * .4], w * .02, 'wood'); }, true);
    mark('hanger', 'wood', () => { for (const side of [-1, 1]) { rod([0, shoulder, 0], [0, shoulder, side * d * .26], w * .017, 'wood'); rod([0, shoulder, side * d * .26], [-w * .37, shoulder - h * .065, side * d * .26], w * .017, 'wood'); rod([0, shoulder, side * d * .26], [w * .37, shoulder - h * .065, side * d * .26], w * .017, 'wood'); } }); join('hanger', 'stand');
    for (const side of [1, -1]) {
      const cloth = fabric({ name: side > 0 ? 'front' : 'back', left: -w * .32, top: bodyTop, width: w * .64, length: torso, z: side * d * .26, tail: 'fork', facing: side, pigment: side < 0 ? C.cloth : null });
      join(side > 0 ? 'front' : 'back', 'hanger');
      for (const x of [-w * .32, w * .32]) {
        rod([x, shoulder - h * .09, -d * .26], [x, shoulder - h * .09, d * .26], w * .012, 'cloth', C.primary, 8);
      }
      if (side > 0) for (const u of [.2, .8]) { const p = cloth.point(u, .7, .022); sphere(...p, w * .009, 'trim', C.trim); }
    }
  } else if (id === 'bunting') {
    const top = h * .88, count = Math.max(5, Math.min(17, Math.round(w * 2.1))), spacing = w / count;
    for (const side of [-1, 1]) {
      const x = side * w * .5;
      mark(`post-${side}`, 'wood', () => rod([x, 0, 0], [x, top + h * .085, 0], w * .009, 'wood', C.wood, 12), true);
      sphere(x, top + h * .085, 0, w * .014, 'trim', C.trim);
    }
    const rope = Array.from({ length: 25 }, (_, i) => { const u = i / 24; return [-w / 2 + w * u, top - h * .065 * Math.sin(Math.PI * u), 0]; });
    tube(rope, Math.max(.004, w * .0018), 'cord', C.trim);
    for (let i = 0; i < count; i++) {
      const u = (i + .5) / count, x = -w / 2 + i * spacing + spacing * .06, y = top - h * .065 * Math.sin(Math.PI * u);
      const pigment = [C.primary, C.secondary, C.trim, C.primary.clone().lerp(C.wood, .25)][i % 4];
      fabric({ name: `pennant-${i}`, left: x, top: y, width: spacing * .86, length: h * .25 * (.85 + rand() * .16), tail: 'point', pigment });
      join(`pennant-${i}`, 'rope');
    }
  } else if (id === 'sign') {
    const r = w * .033, x = -w * .45, barY = h * .86, right = w * .38, signW = w * .66;
    upright(x, h * .94, r);
    mark('bracket', 'metal', () => { rod([x, barY, 0], [right, barY, 0], r * .44, 'metal', C.metal, 12); rod([x, barY - h * .2, 0], [right - w * .15, barY, 0], r * .33, 'metal', C.metal, 12); }, false);
    join('bracket', 'pole');
    const cx = right - signW * .48, cy = barY - h * .36, boardTop = cy + h * .18;
    mark('signboard', 'wood', () => panel(cx, cy, 0, [[-signW * .5, h * .18], [signW * .5, h * .18], [signW * .5, -h * .11], [0, -h * .22], [-signW * .5, -h * .11]], d * .17, 'wood', C.wood));
    for (const [i, x0] of [right - signW * .82, right - signW * .13].entries()) {
      mark(`sign-hanger-${i}`, 'metal', () => {
        ring(x0, barY - r * 1.05, 0, r * .65, r * .19, 'metal', C.metal);
        rod([x0, barY - r * 1.1, 0], [x0, boardTop + h * .012, 0], r * .22, 'metal', C.metal, 10);
        for (const side of [-1, 1]) {
          const face = side * (d * .085 + .014);
          box(x0, boardTop - h * .045, face, r * .52, h * .13, r * .32, 'metal', C.metal, .004);
          for (const y of [boardTop - h * .015, boardTop - h * .08]) sphere(x0, y, face + side * r * .19, r * .18, 'trim', C.trim);
        }
      });
      join(`sign-hanger-${i}`, 'bracket');
      join('signboard', `sign-hanger-${i}`);
    }
    tube([[x + r, barY - h * .2, 0], [x + w * .17, barY - h * .07, 0], [x + w * .31, barY - h * .095, 0]], r * .21, 'metal', C.metal);
    for (const side of [-1, 1]) {
      const cloth = fabric({ name: side > 0 ? 'front-paint' : 'back-paint', left: cx - signW * .45, top: cy + h * .15, width: signW * .9, length: h * .29, z: side * (d * .085 + .019), facing: side, tail: 'point' });
      join(side > 0 ? 'front-paint' : 'back-paint', 'signboard');
      for (const u of [.06, .94]) { const p = cloth.point(u, .14, .015); sphere(...p, w * .009, 'metal', C.metal); }
    }
    for (const side of [-1, 1]) rod([cx + side * signW * .45, cy - h * .1, d * .1], [cx, cy - h * .21, d * .1], r * .16, 'trim', C.trim, 8);
  }
  function texture(kind) {
    const size = 128, albedo = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
    let noise = (seed ^ (kind.length * 4903)) >>> 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
      const n = (noise >>> 24) / 255 - .5, i = (y * size + x) * 4;
      const weave = (x % 4 < 2 ? 1 : -1) * (y % 4 < 2 ? 1 : -1);
      const grain = kind === 'cloth' || kind === 'embroidery' ? weave * 7 : kind === 'wood' ? Math.sin(x * .13 + Math.sin(y * .12) * 2) * 10 : kind === 'metal' ? n * 8 : Math.sin(x * .22) * 4;
      const base = clamp(234 + grain + n * (kind === 'wood' ? 24 : 9) - wear * n * 14, 120, 255);
      albedo[i] = albedo[i + 1] = albedo[i + 2] = base; albedo[i + 3] = 255;
      normal[i] = clamp(128 + grain * .8, 0, 255); normal[i + 1] = clamp(128 + (kind === 'cloth' ? weave * 8 : n * 4), 0, 255); normal[i + 2] = 253; normal[i + 3] = 255;
      rough[i] = rough[i + 1] = rough[i + 2] = clamp(235 + n * 13, 180, 255); rough[i + 3] = 255;
    }
    const make = (bytes, space) => { const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat); t.colorSpace = space; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; };
    return { map: make(albedo, THREE.SRGBColorSpace), normal: make(normal, THREE.NoColorSpace), rough: make(rough, THREE.NoColorSpace) };
  }
  const textures = options.textures === false ? {} : Object.fromEntries(['cloth', 'embroidery', 'wood', 'metal', 'trim', 'cord'].map(kind => [kind, texture(kind)]));
  const materials = Object.fromEntries(['cloth', 'embroidery', 'wood', 'metal', 'trim', 'cord'].map(kind => [kind, new THREE.MeshStandardMaterial({ vertexColors: true, side: kind === 'cloth' || kind === 'embroidery' ? THREE.DoubleSide : THREE.FrontSide, roughness: kind === 'cloth' ? Math.max(.65, roughness) : kind === 'metal' ? .38 : roughness, metalness: kind === 'metal' ? .78 : kind === 'trim' ? .45 : 0, map: textures[kind]?.map || null, normalMap: textures[kind]?.normal || null, roughnessMap: textures[kind]?.rough || null, metalnessMap: textures[kind]?.rough || null, normalScale: new THREE.Vector2(kind === 'metal' ? .2 : .4, kind === 'metal' ? .2 : .4) })]));
  let triangles = 0, vertices = 0, drawCalls = 0;
  const animated = [];
  for (const [kind, b] of buckets) {
    if (!b.index.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.color, 3));
    g.setIndex(b.index);
    if (kind === 'cloth' || kind === 'embroidery') g.computeVertexNormals();
    else g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3));
    if (materials[kind].normalMap) g.computeTangents();
    g.computeBoundingBox(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, materials[kind]); mesh.name = kind; mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    if ((kind === 'cloth' || kind === 'embroidery') && wind > 0 && b.motion.some(v => v > 0)) animated.push({ g, base: Float32Array.from(b.pos), motion: Float32Array.from(b.motion) });
    triangles += b.index.length / 3; vertices += b.pos.length / 3; drawCalls++;
  }
  root.userData.stats = { triangles, vertices, drawCalls };
  root.userData.parts = parts;
  const names = new Set(parts.map(p => p.name)); root.userData.contacts = contacts.filter(c => names.has(c.upper) && names.has(c.lower));
  root.userData.update = time => {
    for (const { g, base, motion } of animated) {
      const attr = g.getAttribute('position');
      for (let i = 0; i < motion.length; i++) {
        const k = i * 3, s = motion[i];
        attr.setXYZ(i, base[k] + s * .085 * Math.sin(time * 1.8 + base[k + 1] * 2.8 + seed * .001), base[k + 1], base[k + 2] + s * .075 * Math.sin(time * 2.3 + base[k] * 2.5 + seed * .001));
      }
      attr.needsUpdate = true; g.computeVertexNormals(); g.getAttribute('normal').needsUpdate = true;
    }
  };
  root.userData.dispose = () => {
    root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    Object.values(materials).forEach(m => m.dispose());
    Object.values(textures).forEach(t => { t.map.dispose(); t.normal.dispose(); t.rough.dispose(); });
  };
  return root;
}

export default createHeraldry;
