// TURBO BROS — a top-down split-screen racer for two bros and one keyboard.
//
// Three laps, four cars, one screen. Drift round the corners, steal the
// nitro pads, and try not to end up embedded in the barrier.

import { clamp, rand, randInt, pick, lerp, TAU, DEG, roundRect, rgba, shade, mulberry32 } from '../utils.js';
import { Particles } from '../particles.js';
import * as Sfx from '../audio.js';
import { PadInput, PlayerControls } from '../shared/keys.js';
import { getKeys, onChange, keyLabel, musicEnabled } from '../shared/config.js';
import { initControlsButton, openControls } from '../shared/controls.js';
import { startMusic } from '../shared/music.js';

export const W = 960;
export const H = 540;

const LAPS = 3;
const MAX_SPEED = 430;
const NITRO_SPEED = 600;
const ACCEL = 340;
const BRAKE = 560;
const REVERSE = 150;
const DRAG = 0.55;
const TURN = 3.2;
const CAR_W = 30;
const CAR_L = 46;

// ---------------------------------------------------------------- tracks

const TRACKS = [
  {
    name: 'UA SPEEDWAY',
    blurb: 'wide, fast and slightly rude',
    width: 104,
    laps: LAPS,
    points: [
      [320, 320], [720, 210], [1180, 250], [1580, 200], [1830, 430],
      [1710, 780], [1800, 1120], [1400, 1230], [960, 1130], [620, 1240],
      [300, 1010], [170, 640],
    ],
  },
  {
    name: 'DOWNTOWN CIRCUIT',
    blurb: 'tight corners, terrible braking zones',
    width: 86,
    laps: LAPS,
    points: [
      [420, 210], [920, 180], [1210, 330], [1150, 610], [1420, 770],
      [1620, 1010], [1310, 1260], [900, 1200], [700, 900], [400, 960],
      [200, 650], [260, 390],
    ],
  },
  {
    name: 'COASTAL RUN',
    blurb: 'long sweepers and a very confident barrier',
    width: 118,
    laps: LAPS,
    points: [
      [260, 620], [460, 250], [920, 180], [1310, 300], [1520, 610],
      [1720, 910], [1400, 1210], [950, 1260], [700, 1100], [400, 1260],
      [140, 1000],
    ],
  },
];

// ---------------------------------------------------------------- track math

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    y: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  };
}

function buildTrack(def) {
  const pts = def.points;
  const n = pts.length;
  const SUB = 24;
  const samples = [];

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let j = 0; j < SUB; j++) {
      const q = catmull(p0, p1, p2, p3, j / SUB);
      samples.push({ x: q.x, y: q.y, s: 0, angle: 0, nx: 0, ny: 0, i: 0 });
    }
  }

  // arc length + tangents
  let len = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    a.angle = Math.atan2(dy, dx);
    a.nx = -Math.sin(a.angle);
    a.ny = Math.cos(a.angle);
    a.s = len;
    a.i = i;
    len += d;
  }

  const half = def.width / 2;
  const left = [], right = [];
  for (const s of samples) {
    left.push([s.x + s.nx * half, s.y + s.ny * half]);
    right.push([s.x - s.nx * half, s.y - s.ny * half]);
  }

  // boost pads: a few evenly spaced stretches of track
  // (kept away from the start line so nobody gets a free launch)
  const boostZones = [];
  const padCount = 3;
  for (let i = 0; i < padCount; i++) {
    const start = Math.floor(((i + 0.5) / padCount) * samples.length);
    boostZones.push({ from: start, to: start + Math.floor(samples.length / (padCount * 4)) });
  }

  // checkpoints around the lap (the start line itself is not a checkpoint)
  const checkpoints = [];
  const cpCount = 6;
  for (let i = 1; i < cpCount; i++) {
    checkpoints.push(Math.floor((i / cpCount) * samples.length));
  }

  return {
    def, samples, length: len, halfWidth: half, left, right, boostZones, checkpoints,
    worldW: 0, worldH: 0,
  };
}

// ---------------------------------------------------------------- car

class Car {
  constructor(x, y, angle, color, isPlayer, name) {
    this.x = x; this.y = y;
    this.angle = angle;
    this.vx = 0; this.vy = 0;
    this.speed = 0;      // engine speed
    this.vel = 0;        // actual speed along the car
    this.color = color;
    this.isPlayer = isPlayer;
    this.name = name;
    this.nitro = 100;
    this.boost = 0;
    this.lap = 0;
    this.cp = 0;
    this.progress = 0;
    this.trackIdx = 0;
    this.offRoad = false;
    this.lapTime = 0;
    this.bestLap = Infinity;
    this.lapTimes = [];
    this.finished = false;
    this.finishTime = 0;
    this.place = 1;
    this.aiOffset = 0;
    this.aiSkill = 1;
    this.slip = 0;
  }
}

class InputState {
  constructor() {
    this.steer = 0; this.accel = false; this.brake = false; this.hand = false; this.nitro = false;
  }
}

// ---------------------------------------------------------------- the game

class Racer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = new Particles(700);
    this.state = 'track';          // track -> countdown -> race -> done
    this.stateT = 0;
    this.trackIndex = 0;
    this.track = null;
    this.world = null;
    this.cars = [];
    this.players = 2;              // 1 = solo vs CPU, 2 = split screen
    this.time = 0;
    this.countdown = 3.999;
    this.shake = 0;
    this.result = null;
    this.finishOrder = [];
    this.message = '';
  }

  // ------------------------------------------------------------ setup
  loadTrack(index) {
    this.trackIndex = index;
    this.track = buildTrack(TRACKS[index]);
    this.drawWorld();
    this.startRace();
  }

  startRace() {
    const t = this.track;
    this.cars = [];
    this.particles.clear();
    this.state = 'countdown';
    this.stateT = 0;
    this.countdown = 3.999;
    this.finishOrder = [];
    this.result = null;

    // grid: four cars staggered across the start line
    const startIdx = 0;
    const back = 58;
    let playerIdx = 0;
    for (let i = 0; i < 4; i++) {
      const s = t.samples[startIdx];
      const lane = (i % 2 === 0 ? -1 : 1) * t.halfWidth * 0.42;
      const row = Math.floor(i / 2) * back;
      const x = s.x - Math.cos(s.angle) * row + s.nx * lane;
      const y = s.y - Math.sin(s.angle) * row + s.ny * lane;
      const isPlayer = i < this.players;
      const colors = ['#ff8a3d', '#45c8ff', '#8de04a', '#c9a227'];
      const names = ['BRO 1', 'BRO 2', 'CPU CRUZ', 'CPU VROOM'];
      const car = new Car(x, y, s.angle, colors[i], isPlayer, names[i]);
      car.trackIdx = startIdx;
      car.aiSkill = 0.8 + i * 0.08;
      if (isPlayer) car.side = playerIdx++;
      this.cars.push(car);
    }
    this.shake = 0;
    this.message = 'GET READY';
    this.messageT = 1.2;
    Sfx.sfxEngineStart();
  }

  drawWorld() {
    const t = this.track;
    let maxX = 0, maxY = 0;
    for (const p of t.left) { maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
    for (const p of t.right) { maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
    const pad = 160;
    const w = Math.ceil(maxX + pad), h = Math.ceil(maxY + pad);
    t.worldW = w; t.worldH = h;

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');

    // grass
    const grass = g.createLinearGradient(0, 0, 0, h);
    grass.addColorStop(0, '#2f6b3a');
    grass.addColorStop(1, '#1f4d2c');
    g.fillStyle = grass;
    g.fillRect(0, 0, w, h);

    // mowed stripes
    g.save();
    g.globalAlpha = 0.08;
    g.fillStyle = '#ffffff';
    for (let y = 0; y < h; y += 160) g.fillRect(0, y, w, 80);
    g.restore();

    // track shadow
    g.save();
    g.translate(4, 6);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    traceTrack(g, t, t.halfWidth + 8);
    g.fill();
    g.restore();

    // asphalt
    g.fillStyle = '#3a3f4d';
    traceTrack(g, t, t.halfWidth);
    g.fill();

    // kerbs
    g.save();
    traceTrack(g, t, t.halfWidth);
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 6;
    traceTrack(g, t, t.halfWidth * 0.62);
    g.stroke();
    g.restore();

    // red / white kerb edges
    drawKerb(g, t, t.halfWidth, t.halfWidth + 9, '#e04b4b');
    drawKerb(g, t, -t.halfWidth - 9, -t.halfWidth, '#e04b4b');

    // centre dashes
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 4;
    g.setLineDash([26, 30]);
    g.beginPath();
    for (const s of t.samples) {
      if (s.i % 3 !== 0) continue;
      g.moveTo(s.x + s.nx * 2, s.y + s.ny * 2);
      g.lineTo(s.x - s.nx * 2, s.y - s.ny * 2);
    }
    g.stroke();
    g.restore();

    // start / finish line
    {
      const s = t.samples[0];
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.angle);
      for (let i = 0; i < 12; i++) {
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? '#ffffff' : '#1b1f2a';
          g.fillRect(-12 + j * 12, -t.halfWidth + (i * t.halfWidth * 2) / 12, 12, (t.halfWidth * 2) / 12);
        }
      }
      g.restore();
    }

    // boost pads
    for (const z of t.boostZones) {
      for (let i = z.from; i < z.to; i++) {
        const s = t.samples[i % t.samples.length];
        g.save();
        g.translate(s.x, s.y);
        g.rotate(s.angle);
        g.fillStyle = i % 2 ? 'rgba(120,220,255,0.75)' : 'rgba(255,209,102,0.75)';
        g.fillRect(-6, -t.halfWidth * 0.32, 12, t.halfWidth * 0.64);
        g.restore();
      }
    }

    // scenery: trees and tyre walls
    const rnd = mulberry32(99 + this.trackIndex * 17);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w, y = rnd() * h;
      if (nearTrack(t, x, y, t.halfWidth + 70)) continue;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(x + 4, y + 6, 18, 8, 0, 0, TAU);
      g.fill();
      g.fillStyle = rnd() < 0.5 ? '#1f6b34' : '#2b7a40';
      g.beginPath();
      g.arc(x, y, 16 + rnd() * 8, 0, TAU);
      g.fill();
    }

    this.world = cv;
  }

  // ------------------------------------------------------------ update
  update(dt, input) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.messageT > 0) {
      this.messageT -= dt;
      if (this.messageT <= 0) this.message = '';
    }

    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after >= 0) Sfx.sfxCountdown(after === 0);
      if (this.countdown <= 0) {
        this.state = 'race';
        this.stateT = 0;
        this.message = 'GO!';
        this.messageT = 0.9;
      }
      return;
    }

    if (this.state === 'race') {
      this.stateT += dt;
      let lead = null;
      for (const car of this.cars) {
        if (car.finished) {
          car.speed *= 0.98; car.vel *= 0.98;
          car.vx *= 0.98; car.vy *= 0.98;
          this.integrateCar(car, dt);
          continue;
        }
        const inp = car.isPlayer ? input[car.side] : this.aiInput(car);
        this.updateCar(car, inp, dt);
        if (!lead || car.progress > lead.progress) lead = car;
      }
      if (lead) {
        Sfx.sfxEngineSet(clamp(Math.abs(lead.vel || 0) / MAX_SPEED, 0, 1.2), lead.boost > 0 ? 1 : 0);
      }
      this.updateRace(dt);
    }

    this.particles.update(dt);
  }

  aiInput(car) {
    const t = this.track;
    const N = t.samples.length;
    const inp = new InputState();
    const spd = Math.max(50, car.vel || 0);
    const perPx = N / t.length;                 // samples per pixel

    // pure pursuit: aim at a point on the racing line a short way ahead
    const look = Math.max(4, Math.round((70 + spd * 0.30) * perPx));
    const target = t.samples[(car.trackIdx + look) % N];
    const lane = (car.offRoad ? 0 : car.aiOffset) * t.halfWidth * 0.45;
    const tx = target.x + target.nx * lane;
    const ty = target.y + target.ny * lane;
    const want = Math.atan2(ty - car.y, tx - car.x);
    const diff = ((want - car.angle + Math.PI * 3) % TAU) - Math.PI;
    inp.steer = clamp(diff * 2.0, -1, 1);

    // sharpest turn in the next ~230px decides how fast we may go
    let curve = 0;
    for (let k = 0; k <= 14; k += 2) {
      const s1 = t.samples[(car.trackIdx + k) % N];
      const s2 = t.samples[(car.trackIdx + k + 6) % N];
      const d = Math.abs(((s2.angle - s1.angle + Math.PI * 3) % TAU) - Math.PI);
      if (d > curve) curve = d;
    }
    const corner = clamp(curve * 0.66, 0, 0.8);
    let targetSpeed = MAX_SPEED * (1 - corner) * car.aiSkill;
    if (car.offRoad) targetSpeed = Math.min(targetSpeed, MAX_SPEED * 0.35);
    if (Math.abs(diff) > 0.55) targetSpeed *= 0.8;
    if ((car.vel || 0) < targetSpeed * 0.96) inp.accel = true;
    else if ((car.vel || 0) > targetSpeed * 1.04) inp.brake = true;
    if (car.nitro > 60 && corner < 0.06 && (car.vel || 0) > MAX_SPEED * 0.8) inp.nitro = true;
    if (Math.abs(diff) > 0.8 && (car.vel || 0) > 120) inp.hand = true;
    return inp;
  }

  updateCar(car, inp, dt) {
    const t = this.track;
    const throttle = inp.accel ? 1 : 0;
    const braking = inp.brake ? 1 : 0;

    // --- longitudinal: car.speed is what the engine is asking for,
    //     car.vel is what the car is actually doing.
    if (throttle) car.speed += ACCEL * dt;
    if (braking) {
      if (car.speed > 0) car.speed -= BRAKE * dt;
      else car.speed -= REVERSE * dt;
    }
    if (!throttle && !braking) car.speed -= car.speed * DRAG * dt;
    // nitro slowly refills when it is not being used
    if (!inp.nitro) car.nitro = Math.min(100, car.nitro + 11 * dt);
    if (inp.nitro && car.nitro > 0 && car.speed > 40) {
      car.speed += 420 * dt;
      car.nitro = Math.max(0, car.nitro - 34 * dt);
      car.boost = 0.25;
      if (Math.random() < 0.4) {
        this.particles.add(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20,
          rand(-40, 40), rand(-40, 40), { type: 'spark', color: '#7fd4ff', size: rand(2, 4), life: 0.3 });
      }
    }
    if (car.boost > 0) car.boost -= dt;

    const maxSpeed = car.boost > 0 ? NITRO_SPEED : MAX_SPEED;
    car.speed = clamp(car.speed, -140, maxSpeed * 1.15);

    // steering
    const speedFactor = clamp(Math.abs(car.vel || 0) / MAX_SPEED, 0, 1.2);
    const turn = TURN * (1 - speedFactor * 0.45) * (car.speed < 0 ? -1 : 1);
    car.angle += inp.steer * turn * dt * clamp(speedFactor * 1.6, 0.45, 1);

    // grip: the tyres pull the direction of travel back towards the nose.
    // The handbrake loosens them so the car keeps sliding (drift).
    const vAng = Math.atan2(car.vy, car.vx);
    const vSp = Math.hypot(car.vx, car.vy);
    const dAng = ((car.angle - vAng + Math.PI * 3) % TAU) - Math.PI;
    const gripRate = inp.hand ? 1.0 : (car.offRoad ? 3.4 : 7.5);
    const gripStep = clamp(dAng, -gripRate * dt, gripRate * dt);
    const nAng = vAng + gripStep;
    const nSp = vSp + (car.speed - vSp) * clamp(14 * dt, 0, 1);
    car.vx = Math.cos(nAng) * nSp;
    car.vy = Math.sin(nAng) * nSp;
    car.slip = Math.abs(dAng - gripStep) * nSp;
    car.vel = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);

    this.integrateCar(car, dt);

    // on-track lookup
    const near = this.nearestSample(car.x, car.y, car.trackIdx);
    car.trackIdx = near.i;
    const off = Math.abs(near.dist) > t.halfWidth;
    if (off && !car.offRoad) {
      this.shake = Math.max(this.shake, 5);
      Sfx.sfxCrash();
    }
    car.offRoad = off;

    // barriers: shove the car back onto the tarmac
    if (off) {
      const limit = t.halfWidth + 16;
      if (Math.abs(near.dist) > limit) {
        const push = (Math.abs(near.dist) - limit) * Math.sign(near.dist);
        car.x -= near.nx * push;
        car.y -= near.ny * push;
        // bounce off the wall instead of grinding along it
        const into = car.vx * near.nx + car.vy * near.ny;
        if (into > 0) {
          car.vx -= near.nx * into * 1.25;
          car.vy -= near.ny * into * 1.25;
          car.speed *= 0.94;
          car.vel *= 0.94;
          if (Math.random() < 0.5) {
            this.particles.add(car.x, car.y, rand(-60, 60), rand(-60, 60), {
              type: 'spark', color: '#ffd166', size: rand(1.5, 3.5), life: 0.3,
            });
          }
        }
        if (Math.random() < 0.12) {
          this.particles.add(car.x, car.y, rand(-60, 60), rand(-60, 60), {
            type: 'spark', color: '#ffd166', size: rand(1.5, 3.5), life: 0.3,
          });
        }
      }
      // grass drag
      car.speed *= (1 - 1.6 * dt);
      car.vel *= (1 - 1.2 * dt);
      if (Math.random() < 0.5) {
        this.particles.add(car.x, car.y, rand(-20, 20), rand(-60, -10), {
          type: 'dirt', color: '#3f7a3a', size: rand(2, 5), life: 0.5,
        });
      }
    }

    // boost pads
    for (const z of t.boostZones) {
      if (car.trackIdx >= z.from && car.trackIdx < z.to) {
        if (car.boost <= 0) {
          car.boost = 0.9;
          car.speed = Math.max(car.speed, NITRO_SPEED * 0.8);
          car.vel = Math.max(car.vel || 0, NITRO_SPEED * 0.7);
          Sfx.sfxBoost();
        }
      }
    }

    // drift smoke
    if (car.slip > 90 && Math.random() < 0.6) {
      this.particles.add(car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18,
        rand(-30, 30), rand(-30, 30), { type: 'smoke', color: '#d9d9e2', size: rand(3, 7), life: rand(0.3, 0.6) });
    }
    if (car.slip > 110) {
      car.skidCool = (car.skidCool || 0) - dt;
      if (car.skidCool <= 0) { car.skidCool = 0.22; Sfx.sfxSkid(); }
    }

    // checkpoints + laps
    const s = t.samples[car.trackIdx];
    const N = t.samples.length;
    const prev = car.prevIdx === undefined ? car.trackIdx : car.prevIdx;
    // pass the next checkpoint (wrap aware: "ahead" is always measured forward)
    const nextCp = t.checkpoints[(car.cp + 1) % t.checkpoints.length];
    let ahead = nextCp - car.trackIdx;
    if (ahead < 0) ahead += N;
    if (ahead < 10) car.cp = (car.cp + 1) % t.checkpoints.length;
    // crossing the start line going forward
    if (car.trackIdx < prev - N / 2) {
      if (car.cp >= t.checkpoints.length - 1) {
        car.cp = 0;
        car.lap++;
        car.lapTimes.push(car.lapTime);
        car.bestLap = Math.min(car.bestLap, car.lapTime);
        car.lapTime = 0;
        if (car.lap >= t.def.laps) {
          car.finished = true;
          car.finishTime = this.stateT;
          this.finishOrder.push(car);
          if (car.isPlayer) Sfx.sfxWin();
        } else {
          Sfx.sfxLap();
        }
      }
    }
    car.prevIdx = car.trackIdx;
    car.lapTime += dt;
    car.progress = car.lap * t.length + s.s;
  }

  integrateCar(car, dt) {
    car.x += car.vx * dt;
    car.y += car.vy * dt;
  }

  nearestSample(x, y, hint) {
    const t = this.track;
    const N = t.samples.length;
    let bestI = 0;
    let bestD = Infinity;
    // coarse pass — every 8th sample is enough to find the neighbourhood
    for (let i = 0; i < N; i += 8) {
      const s = t.samples[i];
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    // refine around the coarse winner
    let outI = bestI;
    for (let k = -12; k <= 12; k++) {
      const i = (bestI + k + N) % N;
      const s = t.samples[i];
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bestD) { bestD = d; outI = i; }
    }
    const s = t.samples[outI];
    const dx = x - s.x, dy = y - s.y;
    return { i: outI, dist: dx * s.nx + dy * s.ny, nx: s.nx, ny: s.ny, s: s.s };
  }

  updateRace(dt) {
    // ranking
    const order = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    order.forEach((c, i) => { c.place = i + 1; });

    // car vs car
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const R = 26;                       // roughly the car's width
        if (d < R && d > 0.01) {
          const push = (R - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < -8) {
            a.vx += nx * rel * 0.6; a.vy += ny * rel * 0.6;
            b.vx -= nx * rel * 0.6; b.vy -= ny * rel * 0.6;
            a.speed *= 0.9; b.speed *= 0.9;
            a.vel *= 0.9; b.vel *= 0.9;
            a.vel *= 0.94; b.vel *= 0.94;
            this.shake = Math.max(this.shake, 4);
            Sfx.sfxCrash();
          }
        }
      }
    }

    // race over when both human players are done
    const humans = this.cars.filter((c) => c.isPlayer);
    if (humans.every((c) => c.finished)) {
      this.state = 'done';
      this.stateT = 0;
      this.result = order.map((c) => ({ name: c.name, place: c.place, isPlayer: c.isPlayer, best: c.bestLap }));
      Sfx.sfxEngineStop();
      Sfx.sfxWin();
    }
  }

  // ------------------------------------------------------------ render
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (this.state === 'track') { this.renderTrackSelect(ctx); return; }

    const players = this.cars.filter((c) => c.isPlayer);
    if (players.length === 2) {
      this.renderView(ctx, players[0], 0, 0, W / 2, H);
      this.renderView(ctx, players[1], W / 2, 0, W / 2, H);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
    } else {
      this.renderView(ctx, players[0], 0, 0, W, H);
    }

    this.renderHud(ctx, players);

    if (this.state === 'countdown') {
      const n = Math.ceil(this.countdown);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 96px "Comic Sans MS", system-ui, sans-serif';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#000';
      const txt = n > 0 ? String(n) : 'GO!';
      ctx.strokeText(txt, W / 2, H / 2 + 30);
      ctx.fillStyle = n > 0 ? '#ffd166' : '#8de04a';
      ctx.fillText(txt, W / 2, H / 2 + 30);
      ctx.restore();
    }
    if (this.message) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 40px "Comic Sans MS", system-ui, sans-serif';
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#000';
      ctx.strokeText(this.message, W / 2, 90);
      ctx.fillStyle = '#8de04a';
      ctx.fillText(this.message, W / 2, 90);
      ctx.restore();
    }
  }

  renderView(ctx, car, x0, y0, vw, vh) {
    const cam = this.cameraFor(car, vw, vh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, vw, vh);
    ctx.clip();
    ctx.fillStyle = '#173a20';
    ctx.fillRect(x0, y0, vw, vh);

    const shake = this.shake;
    const sx = shake ? rand(-shake, shake) : 0;
    const sy = shake ? rand(-shake, shake) : 0;

    ctx.save();
    ctx.translate(x0 + vw / 2 + sx, y0 + vh / 2 + sy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    if (this.world) ctx.drawImage(this.world, 0, 0);

    // cars
    for (const c of this.cars) this.drawCar(ctx, c);

    this.particles.draw(ctx, 'back');
    ctx.restore();

    // minimap
    this.drawMinimap(ctx, car, x0 + vw - 108, y0 + 8, 100, 100);
    ctx.restore();
  }

  cameraFor(car, vw, vh) {
    const zoom = vw < 600 ? 1.05 : 1.0;
    return { x: car.x, y: car.y, zoom };
  }

  drawCar(ctx, c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -CAR_L / 2 + 3, -CAR_W / 2 + 4, CAR_L, CAR_W, 7);
    ctx.fill();
    // body
    const g = ctx.createLinearGradient(0, -CAR_W / 2, 0, CAR_W / 2);
    g.addColorStop(0, shade(c.color, 0.2));
    g.addColorStop(1, shade(c.color, -0.3));
    ctx.fillStyle = g;
    roundRect(ctx, -CAR_L / 2, -CAR_W / 2, CAR_L, CAR_W, 7);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    // nose
    ctx.fillStyle = shade(c.color, 0.4);
    ctx.beginPath();
    ctx.moveTo(CAR_L / 2, -7);
    ctx.lineTo(CAR_L / 2 + 5, 0);
    ctx.lineTo(CAR_L / 2, 7);
    ctx.closePath();
    ctx.fill();
    // cockpit
    ctx.fillStyle = '#1b1f2a';
    roundRect(ctx, -4, -8, 13, 16, 4);
    ctx.fill();
    // stripes
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-CAR_L / 2 + 4, -3, CAR_L - 12, 6);
    // wheels
    ctx.fillStyle = '#15151c';
    if (c.slip > 70) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-CAR_L / 2 + 2, -CAR_W / 2 - 6, 12, 4);
      ctx.fillRect(-CAR_L / 2 + 2, CAR_W / 2 + 2, 12, 4);
    }
    ctx.fillStyle = '#15151c';
    ctx.fillRect(-CAR_L / 2 + 2, -CAR_W / 2 - 3, 12, 6);
    ctx.fillRect(-CAR_L / 2 + 2, CAR_W / 2 - 3, 12, 6);
    ctx.fillRect(CAR_L / 2 - 12, -CAR_W / 2 - 3, 10, 6);
    ctx.fillRect(CAR_L / 2 - 12, CAR_W / 2 - 3, 10, 6);
    // headlight glow
    if (c.boost > 0) {
      ctx.fillStyle = 'rgba(120,220,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(CAR_L / 2, -6);
      ctx.lineTo(CAR_L / 2 + 26, 0);
      ctx.lineTo(CAR_L / 2, 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // name tag
    if (c.isPlayer) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 10px "Comic Sans MS", system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(c.name, c.x, c.y - CAR_W / 2 - 10);
      ctx.fillStyle = c.color;
      ctx.fillText(c.name, c.x, c.y - CAR_W / 2 - 10);
      ctx.restore();
    }
  }

  drawMinimap(ctx, car, x, y, w, h) {
    const t = this.track;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    const sx = (w - 16) / t.worldW;
    const sy = (h - 16) / t.worldH;
    const s = Math.min(sx, sy);
    const ox = x + w / 2 - (t.worldW * s) / 2;
    const oy = y + h / 2 - (t.worldH * s) / 2;

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    t.samples.forEach((s2, i) => {
      const px = ox + s2.x * s, py = oy + s2.y * s;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    for (const c of this.cars) {
      ctx.beginPath();
      ctx.arc(ox + c.x * s, oy + c.y * s, c.isPlayer ? 3.6 : 2.6, 0, TAU);
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  renderHud(ctx, players) {
    const t = this.track;
    for (const c of players) {
      const left = players.length === 2 && c === players[0];
      const x = left ? 14 : (players.length === 2 ? W / 2 + 14 : 14);
      const y = 12;
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = '700 13px "Comic Sans MS", system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      const name = `${c.name}  ·  P${c.side + 1}`;
      ctx.strokeText(name, x, y + 12);
      ctx.fillStyle = c.color;
      ctx.fillText(name, x, y + 12);

      ctx.font = '700 26px "Comic Sans MS", system-ui, sans-serif';
      const lap = `LAP ${Math.min(c.lap + 1, t.def.laps)}/${t.def.laps}`;
      ctx.strokeText(lap, x, y + 42);
      ctx.fillStyle = '#fff';
      ctx.fillText(lap, x, y + 42);

      ctx.font = '700 15px "Comic Sans MS", system-ui, sans-serif';
      const place = `P${c.place}`;
      ctx.strokeText(place, x, y + 62);
      ctx.fillStyle = c.place === 1 ? '#ffd166' : '#fff';
      ctx.fillText(place, x, y + 62);

      // speed
      const kmh = Math.round(Math.abs(c.speed) * 0.42);
      ctx.font = '700 30px "Comic Sans MS", system-ui, sans-serif';
      const sp = `${kmh}`;
      ctx.strokeText(sp, x, y + 96);
      ctx.fillStyle = c.boost > 0 ? '#7fd4ff' : '#fff';
      ctx.fillText(sp, x, y + 96);
      ctx.font = '700 11px "Comic Sans MS", system-ui, sans-serif';
      ctx.strokeText('km/h', x + ctx.measureText(sp).width + 6, y + 96);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('km/h', x + ctx.measureText(sp).width + 6, y + 96);

      // nitro bar
      const bw = 92, bh = 9;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, x, y + 104, bw, bh, 4);
      ctx.fill();
      ctx.fillStyle = c.nitro > 25 ? '#7fd4ff' : '#4a6f88';
      roundRect(ctx, x + 1.5, y + 105.5, (bw - 3) * (c.nitro / 100), bh - 3, 3);
      ctx.fill();

      // lap timer
      ctx.font = '700 12px "Comic Sans MS", system-ui, sans-serif';
      const lt = formatTime(c.lapTime);
      ctx.strokeText(lt, x, y + 128);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(lt, x, y + 128);
      ctx.restore();
    }

    // track name
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 14px "Comic Sans MS", system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.strokeText(t.def.name, W / 2, H - 12);
    ctx.fillStyle = '#ffd166';
    ctx.fillText(t.def.name, W / 2, H - 12);
    ctx.restore();
  }

  renderTrackSelect(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b2145');
    g.addColorStop(1, '#0a0c18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.font = '700 30px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('PICK YOUR CIRCUIT', W / 2, 52);

    // track previews
    TRACKS.forEach((def, i) => {
      const x = 40 + i * 300;
      const y = 90;
      const w = 260, h = 300;
      const sel = i === this.trackIndex;
      ctx.save();
      roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = '#14251a';
      ctx.fill();
      ctx.save();
      roundRect(ctx, x, y, w, h, 12);
      ctx.clip();
      // mini map of the track
      const pts = def.points;
      const minX = Math.min(...pts.map((p) => p[0]));
      const maxX = Math.max(...pts.map((p) => p[0]));
      const minY = Math.min(...pts.map((p) => p[1]));
      const maxY = Math.max(...pts.map((p) => p[1]));
      const s = Math.min((w - 60) / (maxX - minX), (h - 80) / (maxY - minY));
      ctx.strokeStyle = sel ? '#ffd166' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = sel ? 9 : 7;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, j) => {
        const px = x + w / 2 + (p[0] - (minX + maxX) / 2) * s;
        const py = y + h / 2 + (p[1] - (minY + maxY) / 2) * s;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = sel ? '#ffd166' : '#000';
      ctx.lineWidth = sel ? 4 : 2;
      roundRect(ctx, x, y, w, h, 12);
      ctx.stroke();

      ctx.fillStyle = sel ? '#ffd166' : '#fff';
      ctx.font = '700 15px "Comic Sans MS", system-ui, sans-serif';
      ctx.fillText(def.name, x + w / 2, y + h - 34);
      ctx.font = '11px "Comic Sans MS", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(def.blurb, x + w / 2, y + h - 16);
      ctx.restore();
    });

    ctx.font = '700 13px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('← → choose track · ENTER start race · C toggle 1P / 2P', W / 2, H - 40);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '11px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillText('P1: W/S/A/D + SPACE handbrake + LSHIFT nitro   ·   P2: ↑/↓/←/→ + SLASH handbrake + RSHIFT nitro', W / 2, H - 20);
  }
}

// ---------------------------------------------------------------- helpers

function traceTrack(g, t, half) {
  g.beginPath();
  for (let i = 0; i < t.samples.length; i++) {
    const s = t.samples[i];
    const px = s.x + s.nx * half;
    const py = s.y + s.ny * half;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

function drawKerb(g, t, from, to, color) {
  const n = t.samples.length;
  for (let i = 0; i < n; i += 2) {
    const s = t.samples[i];
    const s2 = t.samples[(i + 1) % n];
    g.strokeStyle = (i / 2) % 2 ? color : '#f2f2f6';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(s.x + s.nx * from, s.y + s.ny * from);
    g.lineTo(s2.x + s2.nx * from, s2.y + s2.ny * from);
    g.stroke();
  }
}

function nearTrack(t, x, y, pad) {
  for (const s of t.samples) {
    if ((s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) < pad * pad) return true;
  }
  return false;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

// ---------------------------------------------------------------- boot

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(W * dpr);
canvas.height = Math.round(H * dpr);

const racer = new Racer(canvas);
racer.dpr = dpr;
window.broRacer = racer;

const pad = new PadInput();
// the key maps come from the shared settings - rebind them in the ⚙ panel
const p1 = new PlayerControls(pad, getKeys('racer', 0), 0);
const p2 = new PlayerControls(pad, getKeys('racer', 1), 1);

function racerHint() {
  const k = (p, a) => keyLabel((getKeys('racer', p)[a] || [])[0]);
  return `<b>P1</b> ${k(0, 'accel')} accelerate · ${k(0, 'brake')} brake · ${k(0, 'left')}/${k(0, 'right')} steer · `
    + `${k(0, 'hand')} handbrake · ${k(0, 'nitro')} nitro &nbsp;·&nbsp; `
    + `<b>P2</b> ${k(1, 'accel')} accelerate · ${k(1, 'brake')} brake · ${k(1, 'left')}/${k(1, 'right')} steer · `
    + `${k(1, 'hand')} handbrake · ${k(1, 'nitro')} nitro &nbsp;·&nbsp; gamepads work too`;
}

function refreshHint() {
  const hint = document.getElementById('hint');
  if (hint) hint.innerHTML = racerHint();
}
refreshHint();
onChange(({ gameId }) => { if (!gameId || gameId === 'racer') refreshHint(); });

const input = {
  0: { steer: 0, accel: false, brake: false, hand: false, nitro: false },
  1: { steer: 0, accel: false, brake: false, hand: false, nitro: false },
};
window.broControls = { p1, p2 };

function readInput(ctl, target) {
  target.steer = ctl.axis('left', 'right');
  target.accel = ctl.down('accel') || (ctl.padBtns && ctl.padBtns[7]);
  target.brake = ctl.down('brake') || (ctl.padBtns && ctl.padBtns[6]);
  target.hand = ctl.down('hand') || (ctl.padBtns && ctl.padBtns[0]);
  target.nitro = ctl.down('nitro') || (ctl.padBtns && ctl.padBtns[5]);
}

// menus
let menuIndex = 0;
let menuPlayers = 2;

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' && racer.state === 'track') { menuIndex = (menuIndex + 2) % 3; Sfx.sfxSelect(); }
  if (e.code === 'ArrowRight' && racer.state === 'track') { menuIndex = (menuIndex + 1) % 3; Sfx.sfxSelect(); }
  if (e.code === 'KeyC' && racer.state === 'track') { menuPlayers = menuPlayers === 2 ? 1 : 2; Sfx.sfxClick(); }
  if (e.code === 'Enter' && racer.state === 'track') {
    Sfx.initAudio();
    Sfx.resumeAudio();
    racer.players = menuPlayers;
    racer.loadTrack(menuIndex);
  }
  if (e.code === 'KeyM') {
    Sfx.initAudio();
    const m = Sfx.toggleMute();
    const b = document.getElementById('btn-sound');
    if (b) b.textContent = m ? '🔇' : '🔊';
  }
  if (e.code === 'Escape') window.location.href = 'index.html';
  if (e.code === 'F1') {
    e.preventDefault();
    document.getElementById('overlay-help').classList.toggle('hidden');
  }
  if (e.code === 'F2') {
    e.preventDefault();
    openControls('racer');
  }
});

// controls panel + background music
initControlsButton(document.getElementById('btn-controls'), 'racer');
if (musicEnabled()) startMusic('racer');

document.getElementById('btn-help').addEventListener('click', () => {
  document.getElementById('overlay-help').classList.toggle('hidden');
});
document.getElementById('btn-close-help').addEventListener('click', () => {
  document.getElementById('overlay-help').classList.add('hidden');
});
document.getElementById('btn-sound').addEventListener('click', () => {
  Sfx.initAudio();
  Sfx.resumeAudio();
  const m = Sfx.toggleMute();
  document.getElementById('btn-sound').textContent = m ? '🔇' : '🔊';
});
document.getElementById('btn-restart').addEventListener('click', () => {
  racer.startRace();
});
document.getElementById('btn-hub').addEventListener('click', () => {
  window.location.href = 'index.html';
});
document.getElementById('overlay-result').classList.add('hidden');

const resultOverlay = document.getElementById('overlay-result');
document.getElementById('btn-rematch').addEventListener('click', () => {
  resultOverlay.classList.add('hidden');
  racer.startRace();
});
document.getElementById('btn-change-track').addEventListener('click', () => {
  resultOverlay.classList.add('hidden');
  racer.state = 'track';
});

const STEP = 1 / 120;
let acc = 0;
let last = performance.now();

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.25) dt = 0.25;

  pad.poll();
  p1.update();
  p2.update();

  if (racer.state !== 'track') {
    readInput(p1, input[0]);
    readInput(p2, input[1]);
    for (const c of racer.cars) {
      if (c.isPlayer) c.side = c.isPlayer ? (racer.cars.filter((x) => x.isPlayer).indexOf(c)) : 0;
    }
  }

  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 8) {
    racer.update(STEP, input);
    acc -= STEP;
  }
  if (guard >= 8) acc = 0;

  racer.render();

  if (racer.state === 'done' && resultOverlay.classList.contains('hidden')) {
    const r = racer.result || [];
    document.getElementById('result-title').textContent = r[0] ? `${r[0].name} WINS` : 'RACE OVER';
    document.getElementById('result-sub').textContent = `${racer.track.def.name} — ${racer.track.def.laps} laps`;
    document.getElementById('result-stats').innerHTML = r.map((x) => `
      <div class="statbox"><div class="sv">${x.place}</div><div class="sl">${x.name}</div></div>`).join('');
    resultOverlay.classList.remove('hidden');
  }

  pad.endFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
