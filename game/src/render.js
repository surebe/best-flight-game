// The renderer: a pseudo-3D cockpit view drawn on a 2D canvas. The world is
// projected honestly from the aircraft — heading swings the valley, pitch
// moves the horizon, bank rolls the whole frame — and the cockpit below it
// carries lit instruments and the HUD the brief demands: altitude, speed,
// heading, always on show.

import { PALETTE, RINGS, VIEW } from './config.js';
import { altitudeFeet, heightAboveGround } from './flight.js';
import { MISSION_BRIEF, gradeFor } from './missions.js';
import { AIRFIELD, BEACON, groundHeight, groundKind } from './terrain.js';

const rad = (deg) => (deg * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const FOCAL = 1020;
const BANDS = 44;
const COLS = 26;

/** A projector bound to one frame's camera: world metres to screen pixels. */
function makeProjector(plane, view) {
  const h = rad(plane.heading);
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const rx = Math.cos(h);
  const rz = -Math.sin(h);
  const camY = plane.y + 2.2;
  const horizonY = view.height * 0.44 + plane.pitch * 7.5;
  return {
    horizonY,
    project(x, y, z) {
      const dx = x - plane.x;
      const dz = z - plane.z;
      const forward = dx * fx + dz * fz;
      if (forward < 2) return null;
      const lateral = dx * rx + dz * rz;
      return {
        x: view.width / 2 + (lateral / forward) * FOCAL,
        y: horizonY + ((camY - y) / forward) * FOCAL,
        depth: forward,
      };
    },
  };
}

function mix(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

const KIND_FILL = {
  river: PALETTE.river,
  runway: PALETTE.runway,
  apron: '#6f7a5e',
  forest: PALETTE.forest,
  fieldA: PALETTE.fieldA,
  fieldB: PALETTE.fieldB,
  fieldC: PALETTE.fieldC,
};

/** Sky, sun and the two ridge silhouettes that sit on the horizon. */
function drawSky(ctx, view, plane, time) {
  const horizonY = view.height * 0.44 + plane.pitch * 7.5;
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 30);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(0.62, PALETTE.skyMid);
  sky.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(-view.width * 0.3, -view.height * 0.3, view.width * 1.6, horizonY + 30 + view.height * 0.3);

  // The dawn sun rides the eastern sky; heading swings it across the glass.
  const sunAz = 105;
  let rel = ((sunAz - plane.heading + 540) % 360) - 180;
  const sunX = view.width / 2 + (rel / 62) * view.width * 0.62;
  const sunY = horizonY - view.height * 0.16;
  if (Math.abs(rel) < 95) {
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 190);
    glow.addColorStop(0, 'rgba(255,217,143,0.85)');
    glow.addColorStop(1, 'rgba(255,217,143,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 200, sunY - 200, 400, 400);
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ridge silhouettes, parallaxed by heading so a turn sweeps them past.
  for (const layer of [
    { par: 0.35, base: 6, amp: 34, fill: PALETTE.ridgeFar, seed: 3.1 },
    { par: 0.7, base: 16, amp: 22, fill: PALETTE.ridgeNear, seed: 7.7 },
  ]) {
    ctx.fillStyle = layer.fill;
    ctx.globalAlpha = layer.par < 0.5 ? 0.55 : 0.8;
    ctx.beginPath();
    ctx.moveTo(-view.width * 0.3, horizonY + layer.base);
    for (let sx = -view.width * 0.3; sx <= view.width * 1.3; sx += 26) {
      const a = (sx / view.width) * 5.2 + plane.heading * layer.par * 0.11 + layer.seed;
      const peak = Math.sin(a) * layer.amp + Math.sin(a * 2.63 + 1.2) * layer.amp * 0.42;
      ctx.lineTo(sx, horizonY + layer.base - Math.abs(peak) - 4);
    }
    ctx.lineTo(view.width * 1.3, horizonY + layer.base);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  return horizonY;
}

/** The ground: exponential bands of projected terrain, far to near. */
function drawGround(ctx, view, plane, proj) {
  const h = rad(plane.heading);
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const rx = Math.cos(h);
  const rz = -Math.sin(h);
  const distances = [];
  for (let b = 0; b <= BANDS; b += 1) distances.push(14 * Math.pow(1.245, b));
  const rows = [];
  for (let b = 0; b <= BANDS; b += 1) {
    const d = distances[b];
    const row = [];
    for (let c = 0; c <= COLS; c += 1) {
      const lat = -d * 1.05 - 40 + (c / COLS) * (2 * d * 1.05 + 80);
      const wx = plane.x + fx * d + rx * lat;
      const wz = plane.z + fz * d + rz * lat;
      row.push({ p: proj.project(wx, groundHeight(wx, wz), wz), wx, wz });
    }
    rows.push(row);
  }
  for (let b = BANDS - 1; b >= 0; b -= 1) {
    const fog = clamp(distances[b] / 9500, 0, 0.62);
    for (let c = 0; c < COLS; c += 1) {
      const a = rows[b][c];
      const bq = rows[b][c + 1];
      const cq = rows[b + 1][c + 1];
      const dq = rows[b + 1][c];
      if (!a.p || !bq.p || !cq.p || !dq.p) continue;
      const midX = (a.wx + cq.wx) / 2;
      const midZ = (a.wz + cq.wz) / 2;
      const kind = groundKind(midX, midZ);
      let fill = KIND_FILL[kind];
      const height = groundHeight(midX, midZ);
      if (height > 780 && kind !== 'river') fill = '#7a6a58'; // bare rock up high
      ctx.fillStyle = mix(fill, '#cfd9e4', fog);
      ctx.beginPath();
      ctx.moveTo(a.p.x, a.p.y);
      ctx.lineTo(bq.p.x, bq.p.y);
      ctx.lineTo(cq.p.x, cq.p.y);
      ctx.lineTo(dq.p.x, dq.p.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Runway paint, rings, beacon smoke, trees and houses — far to near. */
function drawFeatures(ctx, view, plane, proj, world, time) {
  const items = [];
  // The runway as one projected slab with its markings.
  const rw = AIRFIELD;
  const corners = [
    proj.project(rw.x - rw.width / 2, rw.elevation + 1, rw.z - rw.length / 2),
    proj.project(rw.x + rw.width / 2, rw.elevation + 1, rw.z - rw.length / 2),
    proj.project(rw.x + rw.width / 2, rw.elevation + 1, rw.z + rw.length / 2),
    proj.project(rw.x - rw.width / 2, rw.elevation + 1, rw.z + rw.length / 2),
  ];
  if (corners.every(Boolean)) {
    const depth = Math.hypot(plane.x - rw.x, plane.z - rw.z);
    items.push({
      depth,
      draw() {
        ctx.fillStyle = PALETTE.runway;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = Math.max(1, 900 / depth);
        ctx.setLineDash([26, 20]);
        ctx.beginPath();
        ctx.moveTo((corners[0].x + corners[1].x) / 2, (corners[0].y + corners[1].y) / 2);
        ctx.lineTo((corners[2].x + corners[3].x) / 2, (corners[2].y + corners[3].y) / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      },
    });
  }
  for (const tree of world.scatter.trees) {
    const p = proj.project(tree.x, groundHeight(tree.x, tree.z), tree.z);
    if (!p || p.depth > 5200 || p.x < -40 || p.x > view.width + 40) continue;
    const s = clamp((26 * tree.s * FOCAL) / p.depth, 1.5, 42);
    items.push({
      depth: p.depth,
      draw() {
        ctx.fillStyle = mix(PALETTE.forest, '#22331f', 0.25);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s * 1.7);
        ctx.lineTo(p.x - s * 0.5, p.y);
        ctx.lineTo(p.x + s * 0.5, p.y);
        ctx.closePath();
        ctx.fill();
      },
    });
  }
  for (const house of world.scatter.houses) {
    const base = groundHeight(house.x, house.z);
    const p = proj.project(house.x, base, house.z);
    if (!p || p.depth > 5200) continue;
    const s = clamp((15 * FOCAL) / p.depth, 1.5, 30);
    items.push({
      depth: p.depth,
      draw() {
        ctx.fillStyle = '#c9b18c';
        ctx.fillRect(p.x - s / 2, p.y - s * 0.7, s, s * 0.7);
        ctx.fillStyle = '#8a4f38';
        ctx.beginPath();
        ctx.moveTo(p.x - s * 0.62, p.y - s * 0.7);
        ctx.lineTo(p.x, p.y - s * 1.15);
        ctx.lineTo(p.x + s * 0.62, p.y - s * 0.7);
        ctx.closePath();
        ctx.fill();
      },
    });
  }
  // The rings: the next one burns amber, the rest wait in white and orange.
  world.mission.rings.forEach((ring, index) => {
    if (ring.passed) return;
    const p = proj.project(ring.x, ring.y, ring.z);
    if (!p || p.depth > 9000) return;
    const next = index === world.mission.rings.findIndex((r) => !r.passed);
    const r = (RINGS.radius / p.depth) * FOCAL;
    if (r < 3) return;
    items.push({
      depth: p.depth,
      draw() {
        ctx.lineWidth = clamp(r * 0.16, 2, 15);
        for (let seg = 0; seg < 8; seg += 1) {
          ctx.strokeStyle = seg % 2 ? '#f4f6f8' : next ? PALETTE.lampAmber : '#e8763a';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, (seg / 8) * Math.PI * 2, ((seg + 1) / 8) * Math.PI * 2);
          ctx.stroke();
        }
        if (next) {
          ctx.strokeStyle = 'rgba(255,182,72,0.2)';
          ctx.lineWidth = clamp(r * 0.34, 3, 26);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      },
    });
  });
  // The beacon's smoke column, drifting with the clock.
  if (world.mission.id === 'beacon') {
    const base = groundHeight(BEACON.x, BEACON.z);
    const p = proj.project(BEACON.x, base, BEACON.z);
    if (p && p.depth < 11000) {
      items.push({
        depth: p.depth,
        draw() {
          for (let i = 0; i < 7; i += 1) {
            const rise = i * (340 / p.depth) * 60 * 0.16 + Math.sin(time * 0.7 + i) * 3;
            const r = clamp(((30 + i * 13) / p.depth) * FOCAL * 0.14, 2, 30);
            ctx.fillStyle = `rgba(70,72,78,${0.5 - i * 0.05})`;
            ctx.beginPath();
            ctx.arc(p.x + i * r * 0.55, p.y - rise - r, r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = Math.sin(time * 4) > 0 ? PALETTE.lampRed : '#7a2d26';
          ctx.beginPath();
          ctx.arc(p.x, p.y - 4, clamp(600 / p.depth, 2, 7), 0, Math.PI * 2);
          ctx.fill();
        },
      });
    }
  }
  items.sort((a, b) => b.depth - a.depth);
  for (const item of items) item.draw();
}

/** One round instrument: bezel, dial, needle, digital readout under it. */
function drawGauge(ctx, x, y, r, label, value, needleAngle, readout, warn) {
  ctx.fillStyle = '#0c0f14';
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = warn ? PALETTE.lampRed : PALETTE.lampGreen;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(needleAngle) * r * 0.78, y + Math.sin(needleAngle) * r * 0.78);
  ctx.stroke();
  ctx.fillStyle = '#e8eef4';
  ctx.font = `600 ${Math.round(r * 0.3)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - r * 0.42);
  ctx.font = `700 ${Math.round(r * 0.34)}px ui-monospace, monospace`;
  ctx.fillStyle = PALETTE.hud;
  ctx.fillText(readout, x, y + r * 0.62);
}

/** The artificial horizon: the one instrument that is a little world itself. */
function drawHorizonGauge(ctx, x, y, r, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-rad(plane.bank));
  const pitchPx = clamp(plane.pitch * 2.4, -r, r);
  ctx.fillStyle = '#3f6ea6';
  ctx.fillRect(-r, -r, r * 2, r + pitchPx);
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(-r, pitchPx, r * 2, r - pitchPx);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.5;
  for (const off of [-18, -9, 9, 18]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, pitchPx + off * 1.6);
    ctx.lineTo(r * 0.28, pitchPx + off * 1.6);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.lampAmber;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.52, y);
  ctx.lineTo(x - r * 0.16, y);
  ctx.moveTo(x + r * 0.16, y);
  ctx.lineTo(x + r * 0.52, y);
  ctx.stroke();
  ctx.fillStyle = PALETTE.lampAmber;
  ctx.beginPath();
  ctx.arc(x, y, 3.4, 0, Math.PI * 2);
  ctx.fill();
}

/** The cockpit: frame, panel, instruments and the HUD over the glass. */
function drawCockpit(ctx, view, plane, mission, time) {
  const W = view.width;
  const H = view.height;
  const panelTop = H * 0.615;
  // Windshield posts and the panel's curved brow.
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, panelTop + 66);
  ctx.quadraticCurveTo(W * 0.5, panelTop - 34, W, panelTop + 66);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W * 0.115, panelTop + 58);
  ctx.moveTo(W, 0);
  ctx.lineTo(W * 0.885, panelTop + 58);
  ctx.moveTo(W * 0.115, panelTop + 58);
  ctx.quadraticCurveTo(W * 0.5, panelTop - 34, W * 0.885, panelTop + 58);
  ctx.stroke();

  const cy = panelTop + 118;
  const alt = altitudeFeet(plane);
  drawGauge(ctx, W * 0.155, cy, 62, 'AIRSPEED', plane.speed, rad(-225 + (plane.speed / 200) * 270), `${Math.round(plane.speed)} KT`, plane.stall);
  drawHorizonGauge(ctx, W * 0.335, cy, 68, plane);
  drawGauge(ctx, W * 0.515, cy, 62, 'ALTITUDE', alt, rad(-225 + (alt / 7000) * 270), `${Math.round(alt)} FT`, false);

  // Compass tape across the top of the glass, under the mission banner.
  const tapeY = 84;
  ctx.fillStyle = 'rgba(10,13,18,0.72)';
  ctx.fillRect(W / 2 - 210, tapeY, 420, 26);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.strokeRect(W / 2 - 210, tapeY, 420, 26);
  ctx.save();
  ctx.beginPath();
  ctx.rect(W / 2 - 210, tapeY, 420, 26);
  ctx.clip();
  ctx.fillStyle = '#e8eef4';
  ctx.font = '600 14px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (let d = -66; d <= 66; d += 3) {
    const hdg = (((Math.round(plane.heading / 3) * 3 + d) % 360) + 360) % 360;
    if (hdg % 3 !== 0) continue;
    const x = W / 2 + (d - (plane.heading - Math.round(plane.heading / 3) * 3)) * 3.1;
    if (hdg % 30 === 0) {
      const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[hdg];
      ctx.fillText(name || String(hdg / 10).padStart(2, '0'), x, tapeY + 18);
    } else if (hdg % 10 === 0) {
      ctx.fillRect(x - 0.75, tapeY + 15, 1.5, 7);
    }
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.lampAmber;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 6, tapeY + 26);
  ctx.lineTo(W / 2 + 6, tapeY + 26);
  ctx.lineTo(W / 2, tapeY + 34);
  ctx.closePath();
  ctx.fill();

  // Fuel and airframe bars, right of the gauges.
  const bx = W * 0.635;
  ctx.textAlign = 'left';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = '#e8eef4';
  ctx.fillText('FUEL', bx, cy - 44);
  ctx.fillStyle = plane.fuel < 22 ? PALETTE.lampRed : PALETTE.lampGreen;
  ctx.fillRect(bx, cy - 34, (W * 0.13) * (plane.fuel / 100), 13);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.strokeRect(bx, cy - 34, W * 0.13, 13);
  ctx.fillStyle = '#e8eef4';
  ctx.fillText('AIRFRAME', bx, cy + 8);
  ctx.fillStyle = plane.damage > 55 ? PALETTE.lampRed : PALETTE.lampAmber;
  ctx.fillRect(bx, cy + 18, (W * 0.13) * (1 - plane.damage / 100), 13);
  ctx.strokeRect(bx, cy + 18, W * 0.13, 13);
  ctx.fillStyle = '#9fb2c3';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`THROTTLE ${Math.round(plane.throttle * 100)}%`, bx, cy + 62);

  // Warning lamps.
  ctx.textAlign = 'center';
  if (plane.stall) {
    ctx.fillStyle = Math.sin(time * 9) > 0 ? PALETTE.lampRed : '#5e2320';
    ctx.font = '800 21px system-ui, sans-serif';
    ctx.fillText('STALL', W * 0.845, cy - 40);
  }
  if (plane.fuel < 22 && plane.fuel > 0) {
    ctx.fillStyle = PALETTE.lampAmber;
    ctx.font = '800 17px system-ui, sans-serif';
    ctx.fillText('LOW FUEL', W * 0.845, cy - 12);
  }
  if (plane.damage > 0) {
    ctx.fillStyle = PALETTE.lampRed;
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText(`DAMAGE ${Math.round(plane.damage)}%`, W * 0.845, cy + 16);
  }

  drawHud(ctx, view, plane, mission);
}

/** The HUD proper: the three numbers the brief demands, big over the glass. */
function drawHud(ctx, view, plane, mission) {
  const W = view.width;
  ctx.textAlign = 'left';
  ctx.font = '700 25px ui-monospace, monospace';
  ctx.fillStyle = PALETTE.hud;
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 5;
  ctx.fillText(`ALT ${Math.round(altitudeFeet(plane))} FT`, 26, 44);
  ctx.fillText(`SPD ${Math.round(plane.speed)} KT`, 26, 78);
  ctx.fillText(`HDG ${String(Math.round(plane.heading)).padStart(3, '0')}°`, 26, 112);
  ctx.textAlign = 'right';
  ctx.fillText(`AGL ${Math.round(heightAboveGround(plane))} FT`, W - 26, 44);
  ctx.fillText(`SCORE ${mission.score}`, W - 26, 78);
  ctx.shadowBlur = 0;

  // Mission banner and the live objective line.
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(10,13,18,0.55)';
  const title = MISSION_BRIEF[mission.id].title;
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillRect(W / 2 - 240, 16, 480, 56);
  ctx.fillStyle = '#f4f6f8';
  ctx.fillText(title, W / 2, 40);
  ctx.font = '400 15px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.hud;
  ctx.fillText(objectiveLine(mission, plane), W / 2, 63);
}

/** The one line that tells the pilot what to do next, with its distance. */
export function objectiveLine(mission, plane) {
  if (mission.id === 'rings') {
    const next = mission.rings.find((r) => !r.passed);
    if (!next) return 'All rings threaded — bring her home.';
    const d = Math.round(Math.hypot(plane.x - next.x, plane.z - next.z));
    return `Next ring ${d} m — ${mission.ringsPassed} of ${mission.rings.length} threaded`;
  }
  if (mission.id === 'beacon') {
    const d = Math.round(Math.hypot(plane.x - BEACON.x, plane.z - BEACON.z));
    return `Rescue beacon ${d} m — fuel ${Math.round(plane.fuel)}%`;
  }
  const d = Math.round(Math.hypot(plane.x - AIRFIELD.x, plane.z - AIRFIELD.z));
  return plane.landed ? 'Down. Debrief awaits.' : `Runway ${d} m — land under 82 KT, sink under 620 FPM`;
}

/** The objective diamond: a marker over the next thing to fly to. */
function drawObjectiveMarker(ctx, view, plane, proj, mission) {
  let target = null;
  if (mission.id === 'rings') target = mission.rings.find((r) => !r.passed);
  if (mission.id === 'beacon') target = { x: BEACON.x, y: groundHeight(BEACON.x, BEACON.z) + 160, z: BEACON.z };
  if (mission.id === 'approach' && !plane.landed) target = { x: AIRFIELD.x, y: AIRFIELD.elevation + 30, z: AIRFIELD.z };
  if (!target) return;
  const p = proj.project(target.x, target.y, target.z);
  if (!p || p.depth < 130) return;
  const x = clamp(p.x, 30, view.width - 30);
  const y = clamp(p.y, 132, view.height * 0.55);
  ctx.strokeStyle = PALETTE.lampAmber;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 13);
  ctx.lineTo(x + 13, y);
  ctx.lineTo(x, y + 13);
  ctx.lineTo(x - 13, y);
  ctx.closePath();
  ctx.stroke();
}

/** The full flight frame: world rolled by bank, cockpit steady over it. */
export function drawFlight(ctx, view, world) {
  const { plane, mission, time } = world;
  ctx.save();
  ctx.translate(view.width / 2, view.height * 0.44);
  ctx.rotate(-rad(plane.bank) * 0.38);
  ctx.translate(-view.width / 2, -view.height * 0.44);
  const proj = makeProjector(plane, view);
  drawSky(ctx, view, plane, time);
  drawGround(ctx, view, plane, proj);
  drawFeatures(ctx, view, plane, proj, world, time);
  ctx.restore();
  drawObjectiveMarker(ctx, view, plane, makeProjector(plane, view), mission);
  drawCockpit(ctx, view, plane, mission, time);
}

/** A centred card for title, briefing and debrief screens. */
export function drawCard(ctx, view, lines) {
  const W = view.width;
  const H = view.height;
  ctx.fillStyle = 'rgba(8,11,16,0.72)';
  ctx.fillRect(0, 0, W, H);
  const cardW = 660;
  const cardH = 56 + lines.length * 34;
  const x = (W - cardW) / 2;
  const y = (H - cardH) / 2 - 30;
  ctx.fillStyle = '#12161d';
  ctx.strokeStyle = PALETTE.lampAmber;
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, cardW, cardH);
  ctx.strokeRect(x, y, cardW, cardH);
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, W / 2, y + 44 + i * 34);
  });
}

/** The debrief card's lines for a finished campaign. */
export function debriefLines(campaign) {
  const lines = [
    { text: 'DAWN PATROL — DEBRIEF', font: '800 27px system-ui, sans-serif', color: '#f4f6f8' },
    ...campaign.results.map((r) => ({
      text: `${MISSION_BRIEF[r.id].title}: ${r.success ? 'COMPLETE' : 'FAILED'} — ${r.score} PTS`,
      font: '600 17px system-ui, sans-serif',
      color: r.success ? PALETTE.lampGreen : PALETTE.lampRed,
    })),
    { text: `TOTAL ${campaign.total} PTS — GRADE ${gradeFor(campaign.total)}`, font: '800 21px system-ui, sans-serif', color: PALETTE.lampAmber },
    { text: 'Press ENTER to fly the campaign again', font: '400 15px system-ui, sans-serif', color: '#9fb2c3' },
  ];
  return lines;
}

export { VIEW };
