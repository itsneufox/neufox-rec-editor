// neufox's Rec Editor: SA-MP / open.mp NPC recording (.rec) format and edit operations.
// Pure functions, no DOM: loaded by the page and by tests/run.js under Node.
(function (root) {
  'use strict';

  const TYPE_DRIVER = 1;
  const TYPE_ONFOOT = 2;
  const HEADER_SIZE = 8;
  // One frame = uint32 timestamp + legacy sync block (open.mp Playback/record_manager.hpp)
  const FRAME_SIZE = { [TYPE_DRIVER]: 4 + 63, [TYPE_ONFOOT]: 4 + 68 };
  const VEL_TO_KMH = 180; // GTA move speed is units per 1/50 s: x 50 x 3.6

  // Field layouts, in file order. `extra` is the driver hydra/train union, kept as raw bits.
  const LAYOUT = {
    [TYPE_DRIVER]: [
      ['t', 'u32'], ['vehicleId', 'u16'], ['lr', 'i16'], ['ud', 'i16'], ['keys', 'u16'],
      ['qw', 'f32'], ['qx', 'f32'], ['qy', 'f32'], ['qz', 'f32'],
      ['x', 'f32'], ['y', 'f32'], ['z', 'f32'],
      ['vx', 'f32'], ['vy', 'f32'], ['vz', 'f32'],
      ['vhealth', 'f32'], ['health', 'u8'], ['armour', 'u8'], ['weaponKey', 'u8'],
      ['siren', 'u8'], ['gear', 'u8'], ['trailer', 'u16'], ['extra', 'u32'],
    ],
    [TYPE_ONFOOT]: [
      ['t', 'u32'], ['lr', 'i16'], ['ud', 'i16'], ['keys', 'u16'],
      ['x', 'f32'], ['y', 'f32'], ['z', 'f32'],
      ['qw', 'f32'], ['qx', 'f32'], ['qy', 'f32'], ['qz', 'f32'],
      ['health', 'u8'], ['armour', 'u8'], ['weaponKey', 'u8'], ['specialAction', 'u8'],
      ['vx', 'f32'], ['vy', 'f32'], ['vz', 'f32'],
      ['sx', 'f32'], ['sy', 'f32'], ['sz', 'f32'], ['surfId', 'u16'],
      ['animId', 'u16'], ['animFlags', 'u16'],
    ],
  };
  const SIZES = { u8: 1, u16: 2, i16: 2, u32: 4, f32: 4 };

  // Inspector metadata: label, group, step. Fields not listed are read-only.
  const FIELD_INFO = {
    t: ['Time (ms)', 'Timing', 1],
    x: ['X', 'Position', 0.01], y: ['Y', 'Position', 0.01], z: ['Z', 'Position', 0.01],
    heading: ['Heading (°)', 'Rotation', 1],
    qw: ['Quat W', 'Rotation', 0.001], qx: ['Quat X', 'Rotation', 0.001], qy: ['Quat Y', 'Rotation', 0.001], qz: ['Quat Z', 'Rotation', 0.001],
    vx: ['Vel X', 'Velocity', 0.001], vy: ['Vel Y', 'Velocity', 0.001], vz: ['Vel Z', 'Velocity', 0.001],
    trainSpeed: ['Train speed', 'Vehicle', 0.001],
    vehicleId: ['Vehicle ID', 'Vehicle', 1], vhealth: ['Vehicle health', 'Vehicle', 1],
    siren: ['Siren', 'Vehicle', 1], gear: ['Landing gear', 'Vehicle', 1], trailer: ['Trailer ID', 'Vehicle', 1],
    extra: ['Hydra/train raw', 'Vehicle', 1],
    lr: ['Left/right', 'Keys', 1], ud: ['Up/down', 'Keys', 1], keys: ['Keys', 'Keys', 1],
    health: ['Health', 'Player', 1], armour: ['Armour', 'Player', 1], weaponKey: ['Weapon + key', 'Player', 1],
    specialAction: ['Special action', 'Player', 1],
    animId: ['Animation ID', 'Animation', 1], animFlags: ['Animation flags', 'Animation', 1],
    sx: ['Surf X', 'Surfing', 0.01], sy: ['Surf Y', 'Surfing', 0.01], sz: ['Surf Z', 'Surfing', 0.01], surfId: ['Surf ID', 'Surfing', 1],
  };

  // ── float32 <-> uint32 bit views (hydra/train union) ─────────────────────
  const f32buf = new DataView(new ArrayBuffer(4));
  function bitsToFloat(u) { f32buf.setUint32(0, u >>> 0, true); return f32buf.getFloat32(0, true); }
  function floatToBits(f) { f32buf.setFloat32(0, f, true); return f32buf.getUint32(0, true); }
  function f32(v) { return Math.fround(v); }

  // ── Parse / serialise ────────────────────────────────────────────────────
  function parse(buffer, name = 'recording.rec') {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < HEADER_SIZE) throw new Error(`${name}: file too small`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint32(0, true);
    const type = view.getInt32(4, true);
    if (type !== TYPE_DRIVER && type !== TYPE_ONFOOT) throw new Error(`${name}: unknown playback type ${type}`);
    const size = FRAME_SIZE[type];
    const body = bytes.length - HEADER_SIZE;
    const count = Math.floor(body / size);
    const layout = LAYOUT[type];
    const frames = new Array(count);
    let o = HEADER_SIZE;
    for (let i = 0; i < count; i++) {
      const f = {};
      for (const [key, kind] of layout) {
        switch (kind) {
          case 'u8': f[key] = view.getUint8(o); break;
          case 'u16': f[key] = view.getUint16(o, true); break;
          case 'i16': f[key] = view.getInt16(o, true); break;
          case 'u32': f[key] = view.getUint32(o, true); break;
          case 'f32': f[key] = view.getFloat32(o, true); break;
        }
        o += SIZES[kind];
      }
      frames[i] = f;
    }
    const trailing = body - count * size;
    return { name, version, type, frames, trailing };
  }

  function serialize(rec) {
    const size = FRAME_SIZE[rec.type];
    const layout = LAYOUT[rec.type];
    const out = new Uint8Array(HEADER_SIZE + rec.frames.length * size);
    const view = new DataView(out.buffer);
    view.setUint32(0, rec.version >>> 0, true);
    view.setInt32(4, rec.type, true);
    let o = HEADER_SIZE;
    for (const f of rec.frames) {
      for (const [key, kind] of layout) {
        const v = f[key];
        switch (kind) {
          case 'u8': view.setUint8(o, clampInt(v, 0, 255)); break;
          case 'u16': view.setUint16(o, clampInt(v, 0, 65535), true); break;
          case 'i16': view.setInt16(o, clampInt(v, -32768, 32767), true); break;
          case 'u32': view.setUint32(o, clampInt(v, 0, 4294967295), true); break;
          case 'f32': view.setFloat32(o, Number.isFinite(v) || Number.isNaN(v) ? v : 0, true); break;
        }
        o += SIZES[kind];
      }
    }
    return out;
  }

  function clampInt(v, lo, hi) {
    v = Math.round(Number(v) || 0);
    return v < lo ? lo : v > hi ? hi : v;
  }

  function cloneRec(rec, name) {
    return { name: name || rec.name, version: rec.version, type: rec.type, frames: rec.frames.map(f => ({ ...f })), trailing: 0 };
  }

  function emptyFrame(type) {
    const f = {};
    for (const [key] of LAYOUT[type]) f[key] = 0;
    f.qw = 1;
    if (type === TYPE_DRIVER) { f.vhealth = 1000; f.health = 100; } else { f.health = 100; }
    return f;
  }

  // ── Derived values ───────────────────────────────────────────────────────
  function speed(f) { return Math.hypot(f.vx, f.vy, f.vz); }
  function speedKmh(f) { return speed(f) * VEL_TO_KMH; }
  function trainSpeed(f) { return bitsToFloat(f.extra); }
  function setTrainSpeed(f, v) { f.extra = floatToBits(v); }

  // SA-MP stores the conjugate rotation: heading (deg, CCW from north) = -2·atan2(z, w).
  function heading(f) {
    const h = (-2 * Math.atan2(f.qz, f.qw) * 180) / Math.PI;
    return ((h % 360) + 360) % 360;
  }
  function quatMul(a, b) {
    return [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ];
  }
  // Turn a frame's rotation about the world vertical by `deg` (keeps pitch/roll).
  function yawFrame(f, deg) {
    const h = (-deg * Math.PI) / 360; // conjugate storage: right-multiply by qz(-deg)
    const r = quatMul([f.qw, f.qx, f.qy, f.qz], [Math.cos(h), 0, 0, Math.sin(h)]);
    f.qw = f32(r[0]); f.qx = f32(r[1]); f.qy = f32(r[2]); f.qz = f32(r[3]);
  }
  function setHeading(f, deg) { yawFrame(f, deg - heading(f)); }

  function median(values) {
    if (!values.length) return 0;
    const s = [...values].sort((a, b) => a - b);
    return s[s.length >> 1];
  }
  function frameInterval(rec) {
    const d = [];
    const fr = rec.frames;
    for (let i = 1; i < fr.length && d.length < 2000; i++) d.push(fr[i].t - fr[i - 1].t);
    return Math.max(1, median(d) || 50);
  }

  function stats(rec) {
    const fr = rec.frames;
    let dist = 0, maxKmh = 0, moving = 0;
    for (let i = 0; i < fr.length; i++) {
      if (i) dist += Math.hypot(fr[i].x - fr[i - 1].x, fr[i].y - fr[i - 1].y, fr[i].z - fr[i - 1].z);
      const k = speedKmh(fr[i]);
      if (k > maxKmh) maxKmh = k;
      if (k > 1) moving++;
    }
    const duration = fr.length ? fr[fr.length - 1].t - fr[0].t : 0;
    return { frames: fr.length, duration, distance: dist, maxKmh, avgKmh: duration > 0 ? (dist / (duration / 1000)) * 3.6 : 0, interval: frameInterval(rec), moving };
  }

  // Problems worth flagging before saving.
  function validate(rec) {
    const issues = [];
    const add = (level, frame, key, ...args) => issues.push({ level, frame, key, args, text: key.replace(/\{(\d+)\}/g, (m, i) => args[i]) });
    const fr = rec.frames;
    if (rec.trailing) add('warn', -1, '{0} trailing bytes ignored (truncated frame)', rec.trailing);
    if (!fr.length) add('error', -1, 'no frames');
    for (let i = 0; i < fr.length; i++) {
      const f = fr[i];
      if (i && f.t <= fr[i - 1].t) add('error', i, 'timestamp {0} not after {1}', f.t, fr[i - 1].t);
      for (const k of ['x', 'y', 'z', 'qw', 'qx', 'qy', 'qz', 'vx', 'vy', 'vz']) {
        if (!Number.isFinite(f[k])) { add('error', i, '{0} is not a number', k); break; }
      }
      if (i) {
        const jump = Math.hypot(f.x - fr[i - 1].x, f.y - fr[i - 1].y, f.z - fr[i - 1].z);
        if (jump > 30) add('warn', i, 'jumps {0} m from the previous frame', jump.toFixed(1));
      }
      const qn = Math.hypot(f.qw, f.qx, f.qy, f.qz);
      if (Math.abs(qn - 1) > 0.05) add('warn', i, 'rotation not normalised (|q| = {0})', qn.toFixed(3));
      if (Math.abs(f.x) > 20000 || Math.abs(f.y) > 20000) add('warn', i, 'position far outside the map');
      if (issues.length > 500) { add('warn', -1, 'more issues not listed'); break; }
    }
    return issues;
  }

  // ── Range helpers ────────────────────────────────────────────────────────
  function normRange(rec, a, b) {
    const n = rec.frames.length;
    if (a == null) a = 0;
    if (b == null) b = n - 1;
    if (a > b) [a, b] = [b, a];
    return [Math.max(0, Math.min(n - 1, a)), Math.max(0, Math.min(n - 1, b))];
  }
  function shiftTimes(frames, from, delta) {
    for (let i = from; i < frames.length; i++) frames[i].t = Math.max(0, Math.round(frames[i].t + delta));
  }

  // ── Edit operations (mutate rec.frames; callers snapshot for undo) ───────
  function trim(rec, a, b) {
    [a, b] = normRange(rec, a, b);
    const t0 = rec.frames[0].t;
    const ta = rec.frames[a].t;
    rec.frames = rec.frames.slice(a, b + 1);
    shiftTimes(rec.frames, 0, t0 - ta);
  }

  function deleteRange(rec, a, b) {
    [a, b] = normRange(rec, a, b);
    if (b - a + 1 >= rec.frames.length) throw new Error('cannot delete every frame');
    const fr = rec.frames;
    const removed = b + 1 < fr.length ? fr[b + 1].t - fr[a].t : 0;
    fr.splice(a, b - a + 1);
    if (a < fr.length) shiftTimes(fr, a, -removed);
  }

  function duplicateRange(rec, a, b) {
    [a, b] = normRange(rec, a, b);
    const fr = rec.frames;
    const dt = frameInterval(rec);
    const span = fr[b].t - fr[a].t + dt;
    const copy = fr.slice(a, b + 1).map(f => ({ ...f, t: f.t + span }));
    fr.splice(b + 1, 0, ...copy);
    shiftTimes(fr, b + 1 + copy.length, span);
  }

  // Stand still on frame i for `ms`: copies of frame i with zero velocity.
  function hold(rec, i, ms) {
    const fr = rec.frames;
    const dt = frameInterval(rec);
    const n = Math.max(1, Math.round(ms / dt));
    const base = fr[i];
    const copies = [];
    for (let k = 1; k <= n; k++) {
      const c = { ...base, t: base.t + k * dt, vx: 0, vy: 0, vz: 0 };
      if (rec.type === TYPE_DRIVER) { setTrainSpeed(c, 0); c.lr = 0; c.ud = 0; c.keys = 0; }
      copies.push(c);
    }
    fr.splice(i + 1, 0, ...copies);
    shiftTimes(fr, i + 1 + n, n * dt);
    return n;
  }

  // Scale the duration of frames a..b by `factor` (2 = twice as long / half speed).
  function retime(rec, a, b, factor) {
    [a, b] = normRange(rec, a, b);
    if (!(factor > 0)) throw new Error('factor must be > 0');
    const fr = rec.frames;
    const origin = fr[a].t;
    const oldEnd = fr[b].t;
    for (let i = a; i <= b; i++) {
      const f = fr[i];
      if (i > a) f.t = Math.round(origin + (f.t - origin) * factor);
      f.vx = f32(f.vx / factor); f.vy = f32(f.vy / factor); f.vz = f32(f.vz / factor);
      if (rec.type === TYPE_DRIVER && isTrainLike(rec)) setTrainSpeed(f, trainSpeed(f) / factor);
    }
    // keep strictly increasing timestamps after rounding
    for (let i = a + 1; i <= b; i++) if (fr[i].t <= fr[i - 1].t) fr[i].t = fr[i - 1].t + 1;
    shiftTimes(fr, b + 1, fr[b].t - oldEnd);
  }

  function isTrainLike(rec) {
    // The union holds a train speed when it decodes to a small finite float on moving frames.
    let hits = 0, seen = 0;
    for (let i = 0; i < rec.frames.length && seen < 200; i += Math.max(1, rec.frames.length >> 7)) {
      const f = rec.frames[i];
      if (speed(f) < 0.05) continue;
      seen++;
      const ts = trainSpeed(f);
      if (Number.isFinite(ts) && Math.abs(Math.abs(ts) - speed(f)) < 0.2 * speed(f) + 0.01) hits++;
    }
    return seen > 0 && hits / seen > 0.8;
  }

  function offset(rec, a, b, dx, dy, dz) {
    [a, b] = normRange(rec, a, b);
    for (let i = a; i <= b; i++) {
      const f = rec.frames[i];
      f.x = f32(f.x + dx); f.y = f32(f.y + dy); f.z = f32(f.z + dz);
    }
  }

  // Rotate positions, velocities and headings about (px, py) by `deg` (CCW, like SA headings).
  function rotate(rec, a, b, deg, px, py) {
    [a, b] = normRange(rec, a, b);
    const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    for (let i = a; i <= b; i++) {
      const f = rec.frames[i];
      const x = f.x - px, y = f.y - py;
      f.x = f32(px + x * c - y * s); f.y = f32(py + x * s + y * c);
      const vx = f.vx, vy = f.vy;
      f.vx = f32(vx * c - vy * s); f.vy = f32(vx * s + vy * c);
      yawFrame(f, deg);
    }
  }

  function centroid(rec, a, b) {
    [a, b] = normRange(rec, a, b);
    let x = 0, y = 0, n = 0;
    for (let i = a; i <= b; i++) { x += rec.frames[i].x; y += rec.frames[i].y; n++; }
    return [x / n, y / n];
  }

  // Play frames a..b backwards in the same time slots. turnAround spins headings 180°.
  function reverse(rec, a, b, turnAround) {
    [a, b] = normRange(rec, a, b);
    const fr = rec.frames;
    const times = fr.slice(a, b + 1).map(f => f.t);
    const part = fr.slice(a, b + 1).reverse();
    const train = rec.type === TYPE_DRIVER && isTrainLike(rec);
    part.forEach((f, k) => {
      f.t = times[k];
      f.vx = f32(-f.vx); f.vy = f32(-f.vy); f.vz = f32(-f.vz);
      if (train) setTrainSpeed(f, -trainSpeed(f));
      if (turnAround) yawFrame(f, 180);
    });
    fr.splice(a, part.length, ...part);
  }

  // Moving average of positions (endpoints of the range stay put).
  function smooth(rec, a, b, radius, passes, recomputeVel) {
    [a, b] = normRange(rec, a, b);
    const fr = rec.frames;
    radius = Math.max(1, radius | 0);
    for (let p = 0; p < passes; p++) {
      const src = fr.map(f => [f.x, f.y, f.z]);
      for (let i = a + 1; i < b; i++) {
        const lo = Math.max(a, i - radius), hi = Math.min(b, i + radius);
        let sx = 0, sy = 0, sz = 0;
        for (let k = lo; k <= hi; k++) { sx += src[k][0]; sy += src[k][1]; sz += src[k][2]; }
        const n = hi - lo + 1;
        fr[i].x = f32(sx / n); fr[i].y = f32(sy / n); fr[i].z = f32(sz / n);
      }
    }
    if (recomputeVel) recomputeVelocity(rec, a, b);
  }

  // Velocity from neighbouring positions and timestamps (GTA units per 1/50 s).
  function recomputeVelocity(rec, a, b) {
    [a, b] = normRange(rec, a, b);
    const fr = rec.frames;
    const train = rec.type === TYPE_DRIVER && isTrainLike(rec);
    for (let i = a; i <= b; i++) {
      const p = fr[Math.max(0, i - 1)], n = fr[Math.min(fr.length - 1, i + 1)];
      const dt = (n.t - p.t) / 1000;
      if (dt <= 0) continue;
      const k = 1 / (dt * 50);
      const f = fr[i];
      f.vx = f32((n.x - p.x) * k); f.vy = f32((n.y - p.y) * k); f.vz = f32((n.z - p.z) * k);
      if (train) {
        const ts = trainSpeed(f);
        setTrainSpeed(f, (ts < 0 ? -1 : 1) * speed(f));
      }
    }
  }

  function setField(rec, a, b, field, value) {
    [a, b] = normRange(rec, a, b);
    for (let i = a; i <= b; i++) setFrameField(rec, rec.frames[i], field, value);
  }
  function setFrameField(rec, f, field, value) {
    if (field === 'heading') setHeading(f, value);
    else if (field === 'trainSpeed') setTrainSpeed(f, value);
    else if (field in f) f[field] = isFloatField(rec.type, field) ? f32(value) : Math.round(value);
  }
  function isFloatField(type, field) {
    const e = LAYOUT[type].find(([k]) => k === field);
    return e ? e[1] === 'f32' : true;
  }
  function getFrameField(f, field) {
    if (field === 'heading') return heading(f);
    if (field === 'trainSpeed') return trainSpeed(f);
    return f[field];
  }

  // Move frame i by (dx,dy,dz); frames within `radius` metres along the path follow
  // with a cosine falloff. `base` is the untouched copy taken when the drag started.
  function softMove(rec, i, dx, dy, dz, radius, base) {
    const fr = rec.frames;
    const src = base || fr.map(f => ({ ...f }));
    const move = (k, w) => { fr[k].x = f32(src[k].x + dx * w); fr[k].y = f32(src[k].y + dy * w); fr[k].z = f32(src[k].z + dz * w); };
    move(i, 1);
    if (!(radius > 0)) return;
    for (const dir of [-1, 1]) {
      let along = 0;
      for (let k = i + dir; k >= 0 && k < fr.length; k += dir) {
        const p = src[k - dir], q = src[k];
        along += Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
        if (along >= radius) break;
        move(k, 0.5 * (1 + Math.cos((Math.PI * along) / radius)));
      }
    }
  }

  // Rebuild timestamps: strictly increasing, optionally starting at `start`.
  function fixTimestamps(rec, start) {
    const fr = rec.frames;
    if (!fr.length) return 0;
    let changed = 0;
    if (start != null) {
      const d = start - fr[0].t;
      if (d) { shiftTimes(fr, 0, d); changed = fr.length; }
    }
    for (let i = 1; i < fr.length; i++) {
      if (fr[i].t <= fr[i - 1].t) { fr[i].t = fr[i - 1].t + 1; changed++; }
    }
    return changed;
  }

  // Re-sample at a fixed interval: positions/velocities interpolated, rotation nlerped,
  // discrete fields from the earlier frame.
  function resample(rec, intervalMs) {
    const fr = rec.frames;
    if (fr.length < 2) return;
    intervalMs = Math.max(1, Math.round(intervalMs));
    const out = [];
    const t0 = fr[0].t, t1 = fr[fr.length - 1].t;
    let j = 0;
    const train = rec.type === TYPE_DRIVER && isTrainLike(rec);
    for (let t = t0; t <= t1; t += intervalMs) {
      while (j < fr.length - 2 && fr[j + 1].t <= t) j++;
      const A = fr[j], B = fr[j + 1];
      const u = B.t > A.t ? Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t))) : 0;
      const f = { ...A, t };
      for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'sx', 'sy', 'sz', 'vhealth']) {
        if (k in A) f[k] = f32(A[k] + (B[k] - A[k]) * u);
      }
      let bw = B.qw, bx = B.qx, by = B.qy, bz = B.qz;
      if (A.qw * bw + A.qx * bx + A.qy * by + A.qz * bz < 0) { bw = -bw; bx = -bx; by = -by; bz = -bz; }
      const q = [A.qw + (bw - A.qw) * u, A.qx + (bx - A.qx) * u, A.qy + (by - A.qy) * u, A.qz + (bz - A.qz) * u];
      const qn = Math.hypot(...q) || 1;
      f.qw = f32(q[0] / qn); f.qx = f32(q[1] / qn); f.qy = f32(q[2] / qn); f.qz = f32(q[3] / qn);
      if (train) setTrainSpeed(f, trainSpeed(A) + (trainSpeed(B) - trainSpeed(A)) * u);
      out.push(f);
    }
    if (out[out.length - 1].t !== t1) out.push({ ...fr[fr.length - 1] });
    rec.frames = out;
  }

  // Append `other` after `rec`, `gapMs` after its last frame.
  function concat(rec, other, gapMs, skipFirst) {
    if (rec.type !== other.type) throw new Error('cannot join a driver recording with an on-foot one');
    const fr = rec.frames;
    const last = fr.length ? fr[fr.length - 1].t : 0;
    const src = skipFirst ? other.frames.slice(1) : other.frames;
    if (!src.length) return;
    const base = src[0].t;
    const gap = gapMs == null ? frameInterval(rec) : gapMs;
    for (const f of src) fr.push({ ...f, t: last + gap + (f.t - base) });
  }

  // Distance from the end of each recording to the start of the next.
  function seams(recs, closed) {
    const out = [];
    for (let i = 0; i < recs.length; i++) {
      const next = recs[(i + 1) % recs.length];
      if (i === recs.length - 1 && !closed) break;
      const a = recs[i].frames[recs[i].frames.length - 1], b = next.frames[0];
      if (!a || !b) continue;
      out.push({ from: recs[i].name, to: next.name, distance: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) });
    }
    return out;
  }

  // ── Export ───────────────────────────────────────────────────────────────
  function toCSV(rec) {
    const keys = LAYOUT[rec.type].map(([k]) => k);
    const extra = rec.type === TYPE_DRIVER ? ['trainSpeed', 'heading', 'kmh'] : ['heading', 'kmh'];
    const lines = [[...keys, ...extra].join(',')];
    for (const f of rec.frames) {
      const row = keys.map(k => (Object.is(f[k], -0) ? '-0' : f[k]));
      if (rec.type === TYPE_DRIVER) row.push(trainSpeed(f));
      row.push(heading(f).toFixed(2), speedKmh(f).toFixed(2));
      lines.push(row.join(','));
    }
    return lines.join('\n');
  }

  function fromCSV(text, name) {
    const lines = text.trim().split(/\r?\n/);
    const head = lines[0].split(',').map(s => s.trim());
    const type = head.includes('vehicleId') ? TYPE_DRIVER : TYPE_ONFOOT;
    const keys = LAYOUT[type].map(([k]) => k);
    for (const k of keys) if (!head.includes(k)) throw new Error(`CSV is missing column "${k}"`);
    const idx = Object.fromEntries(head.map((k, i) => [k, i]));
    const frames = lines.slice(1).filter(Boolean).map(line => {
      const c = line.split(',');
      const f = {};
      for (const k of keys) f[k] = Number(c[idx[k]]);
      return f;
    });
    return { name: name.replace(/\.csv$/i, '.rec'), version: 1000, type, frames, trailing: 0 };
  }

  function pawnSpawnLine(f) {
    return `${f.x.toFixed(4)}, ${f.y.toFixed(4)}, ${f.z.toFixed(4)}, ${heading(f).toFixed(4)}`;
  }

  const api = {
    TYPE_DRIVER, TYPE_ONFOOT, FRAME_SIZE, LAYOUT, FIELD_INFO, VEL_TO_KMH,
    parse, serialize, cloneRec, emptyFrame,
    speed, speedKmh, trainSpeed, setTrainSpeed, heading, setHeading, yawFrame, frameInterval, stats, validate, isTrainLike,
    trim, deleteRange, duplicateRange, hold, retime, offset, rotate, centroid, reverse, smooth, recomputeVelocity,
    setField, setFrameField, getFrameField, softMove, fixTimestamps, resample, concat, seams,
    toCSV, fromCSV, pawnSpawnLine,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rec = api;
})(typeof window !== 'undefined' ? window : globalThis);
