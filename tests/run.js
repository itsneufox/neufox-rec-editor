// node tests/run.js [path/to/recordings]: format round-trips and edit-operation invariants.
'use strict';
const fs = require('fs');
const path = require('path');
const Rec = require('../rec.js');

let failed = 0, passed = 0;
function check(name, cond, detail = '') {
  if (cond) passed++;
  else { failed++; console.log(`FAIL ${name} ${detail}`); }
}
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const load = p => Rec.parse(fs.readFileSync(p), path.basename(p));

const dirs = [path.join(__dirname, '..', 'samples'), path.join(__dirname, 'fixtures'), ...process.argv.slice(2)];
const files = dirs.filter(d => fs.existsSync(d)).flatMap(d => fs.readdirSync(d).filter(f => f.endsWith('.rec')).map(f => path.join(d, f)));

// ── byte-exact round trip ──
for (const file of files) {
  const raw = fs.readFileSync(file);
  const rec = Rec.parse(raw, path.basename(file));
  const out = Buffer.from(Rec.serialize(rec));
  const expect = raw.subarray(0, raw.length - rec.trailing);
  check(`roundtrip ${path.basename(file)} (${rec.type === 1 ? 'driver' : 'onfoot'}, ${rec.frames.length} frames)`, out.equals(expect));
}

const driver = files.map(load).find(r => r.type === Rec.TYPE_DRIVER && r.frames.length > 1000);
const onfoot = files.map(load).find(r => r.type === Rec.TYPE_ONFOOT);
if (!driver) console.log('skip: no driver recording found (add .rec files to samples/ or pass a directory)');
if (!onfoot) console.log('skip: no on-foot recording found');

// ── heading convention (SA-MP conjugate quaternions) ──
{
  const car = files.map(load).find(r => r.name.startsWith('CUTSCENE_ARRIVAL_STAND'));
  if (car) {
    for (const f of car.frames) {
      if (Rec.speed(f) < 0.05) continue;
      const hv = ((Math.atan2(-f.vx, f.vy) * 180) / Math.PI + 360) % 360;
      const d = Math.abs(((Rec.heading(f) - hv + 540) % 360) - 180);
      if (d > 20) { check('heading matches velocity', false, `${Rec.heading(f)} vs ${hv}`); break; }
    }
    check('heading matches velocity', true);
  }
  const f = Rec.emptyFrame(Rec.TYPE_DRIVER);
  for (const h of [0, 45, 90, 179, 270, 359]) { Rec.setHeading(f, h); check(`setHeading ${h}`, near(Rec.heading(f), h, 0.01) || near(Math.abs(Rec.heading(f) - h), 360, 0.01)); }
  Rec.setHeading(f, 10); Rec.yawFrame(f, 30); check('yawFrame adds', near(Rec.heading(f), 40, 0.01));
}

// ── edit operations ──
if (driver) {
  const n = driver.frames.length;
  let r = Rec.cloneRec(driver);
  Rec.trim(r, 100, 199);
  check('trim length', r.frames.length === 100);
  check('trim rebases time', r.frames[0].t === driver.frames[0].t);
  check('trim keeps spacing', r.frames[1].t - r.frames[0].t === driver.frames[101].t - driver.frames[100].t);

  r = Rec.cloneRec(driver);
  Rec.deleteRange(r, 100, 199);
  check('delete length', r.frames.length === n - 100);
  check('delete keeps times increasing', Rec.validate(r).every(i => !i.text.startsWith('timestamp')));
  check('delete closes gap', r.frames[100].t === driver.frames[100].t);

  r = Rec.cloneRec(driver);
  const dur0 = r.frames[n - 1].t;
  Rec.hold(r, 500, 5000);
  const dt = Rec.frameInterval(driver);
  check('hold adds frames', r.frames.length === n + Math.round(5000 / dt));
  check('hold extends duration', near(r.frames[r.frames.length - 1].t - dur0, Math.round(5000 / dt) * dt, 1));
  check('hold is stationary', Rec.speed(r.frames[501]) === 0 && r.frames[501].x === r.frames[500].x);

  r = Rec.cloneRec(driver);
  const a = 1000, b = 2000;
  const span = driver.frames[b].t - driver.frames[a].t;
  Rec.retime(r, a, b, 2);
  check('retime doubles span', near(r.frames[b].t - r.frames[a].t, span * 2, 2));
  check('retime halves speed', near(Rec.speed(r.frames[1500]), Rec.speed(driver.frames[1500]) / 2, 1e-4));
  check('retime halves train speed', near(Rec.trainSpeed(r.frames[1500]), Rec.trainSpeed(driver.frames[1500]) / 2, 1e-4));
  check('retime shifts tail', near(r.frames[n - 1].t - driver.frames[n - 1].t, span, 2));
  check('retime valid', Rec.validate(r).every(i => i.level !== 'error'));

  r = Rec.cloneRec(driver);
  Rec.duplicateRange(r, 10, 19);
  check('duplicate length', r.frames.length === n + 10);
  check('duplicate valid', Rec.validate(r).every(i => i.level !== 'error'));

  r = Rec.cloneRec(driver);
  Rec.reverse(r, 0, n - 1, false);
  Rec.reverse(r, 0, n - 1, false);
  check('reverse twice is identity', r.frames.every((f, i) => f.x === driver.frames[i].x && f.t === driver.frames[i].t && f.extra === driver.frames[i].extra));
  r = Rec.cloneRec(driver);
  Rec.reverse(r, 0, n - 1, false);
  check('reverse swaps ends', r.frames[0].x === driver.frames[n - 1].x && r.frames[0].t === driver.frames[0].t);
  check('reverse negates train speed', near(Rec.trainSpeed(r.frames[n - 1500]), -Rec.trainSpeed(driver.frames[1499]), 1e-6));

  r = Rec.cloneRec(driver);
  const [cx, cy] = Rec.centroid(r);
  Rec.rotate(r, 0, n - 1, 90, cx, cy);
  const f0 = driver.frames[1500], g0 = r.frames[1500];
  check('rotate turns heading', near(((Rec.heading(g0) - Rec.heading(f0)) + 360) % 360, 90, 0.05));
  check('rotate keeps radius', near(Math.hypot(g0.x - cx, g0.y - cy), Math.hypot(f0.x - cx, f0.y - cy), 0.05));
  check('rotate turns velocity', near(Math.hypot(g0.vx, g0.vy), Math.hypot(f0.vx, f0.vy), 1e-4) && near(g0.vx, -f0.vy, 1e-3));

  r = Rec.cloneRec(driver);
  Rec.offset(r, 0, n - 1, 10, -5, 1);
  check('offset', near(r.frames[7].x - driver.frames[7].x, 10, 1e-3) && near(r.frames[7].z - driver.frames[7].z, 1, 1e-3));

  r = Rec.cloneRec(driver);
  Rec.smooth(r, 0, n - 1, 3, 2, false);
  check('smooth keeps endpoints', r.frames[0].x === driver.frames[0].x && r.frames[n - 1].x === driver.frames[n - 1].x);
  const before = Rec.stats(driver).distance, after = Rec.stats(r).distance;
  check('smooth shortens jitter', after <= before + 0.01, `${before} -> ${after}`);

  r = Rec.cloneRec(driver);
  Rec.recomputeVelocity(r, 0, n - 1);
  const errs = [];
  for (let i = 100; i < n - 100; i += 7) {
    const recorded = Rec.speed(driver.frames[i]);
    if (recorded > 0.05) errs.push(Math.abs(Rec.speed(r.frames[i]) - recorded) / recorded);
  }
  errs.sort((x, y) => x - y);
  const med = errs[errs.length >> 1];
  check('recompute velocity close to recorded', med < 0.08, `median relative error ${med}`);

  r = Rec.cloneRec(driver);
  Rec.resample(r, 100);
  check('resample interval', r.frames[1].t - r.frames[0].t === 100);
  check('resample keeps duration', r.frames[r.frames.length - 1].t === driver.frames[n - 1].t);
  check('resample valid', Rec.validate(r).every(i => i.level !== 'error'));

  r = Rec.cloneRec(driver);
  r.frames[50].t = r.frames[49].t;
  check('validate finds bad timestamp', Rec.validate(r).some(i => i.frame === 50));
  Rec.fixTimestamps(r);
  check('fixTimestamps repairs', Rec.validate(r).every(i => !i.text.startsWith('timestamp')));

  r = Rec.cloneRec(driver);
  const base = r.frames.map(f => ({ ...f }));
  Rec.softMove(r, 1500, 10, 0, 0, 50, base);
  let along = 0, k = 1500, inside = -1, outside = -1;
  while (k < n - 1) { along += Math.hypot(base[k + 1].x - base[k].x, base[k + 1].y - base[k].y); k++; if (along < 25 && inside < 0 && along > 10) inside = k; if (along > 50) { outside = k; break; } }
  check('softMove centre', near(r.frames[1500].x - base[1500].x, 10, 1e-3));
  check('softMove falloff', inside > 0 && r.frames[inside].x - base[inside].x > 0 && r.frames[inside].x - base[inside].x < 10);
  check('softMove radius', outside > 0 && r.frames[outside].x === base[outside].x);

  const csv = Rec.toCSV(driver);
  const back = Rec.fromCSV(csv, 'x.csv');
  check('csv round trip', Buffer.from(Rec.serialize(back)).equals(Buffer.from(Rec.serialize(driver))));

  r = Rec.cloneRec(driver);
  Rec.concat(r, driver, 1000, false);
  check('concat length', r.frames.length === 2 * n);
  check('concat gap', r.frames[n].t - r.frames[n - 1].t === 1000);
}

if (onfoot) {
  const r = Rec.cloneRec(onfoot);
  Rec.retime(r, 0, r.frames.length - 1, 0.5);
  check('onfoot retime valid', Rec.validate(r).every(i => i.level !== 'error'));
  const csv = Rec.toCSV(onfoot);
  check('onfoot csv round trip', Buffer.from(Rec.serialize(Rec.fromCSV(csv, 'o.csv'))).equals(Buffer.from(Rec.serialize(onfoot))));
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
