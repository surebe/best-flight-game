// The valley of AERIS: one heightfield every system agrees on — the renderer
// draws it, the flight model crashes into it, the missions hang their rings
// and runway on it. World units are metres; x runs east, z runs north.

import { RINGS, WORLD } from './config.js';
import { cellHash, makeRandom } from './random.js';

/** The river's centre line: a slow S-curve down the valley. */
export function riverCenter(z) {
  return 1500 * Math.sin(z * 0.00021) + 620 * Math.sin(z * 0.00083 + 1.7);
}

/** The airfield plateau: centre and heading of the one runway. */
export const AIRFIELD = { x: -2350, z: -1900, heading: 0, length: 1500, width: 90, elevation: 132 };

/** Rolling ground before the valley and the airfield shape it. */
function rawHeight(x, z) {
  const hills =
    210 * Math.sin(x * 0.00055 + 1.3) * Math.cos(z * 0.00047 + 0.4) +
    130 * Math.sin(x * 0.0016 + 4.1) * Math.sin(z * 0.0013 + 2.2) +
    46 * Math.sin(x * 0.006 + 0.7) * Math.cos(z * 0.005 + 3.0);
  const east = Math.max(0, (x - 2600) / 5200); // the ridge climbs to the east
  const ridge = WORLD.ridgeHeight * Math.pow(Math.min(1, east), 1.6) * (0.82 + 0.18 * Math.sin(z * 0.0009 + 0.5));
  return WORLD.valleyFloor + hills + ridge;
}

/** Ground height at a point, with the river's valley carved and the airfield flattened. */
export function groundHeight(x, z) {
  let h = rawHeight(x, z);
  const riverDist = Math.abs(x - riverCenter(z));
  const carve = Math.max(0, 1 - riverDist / 1500); // the valley floor hugs the river
  h = h * (1 - 0.72 * carve * carve) + WORLD.valleyFloor * 0.35 * carve * carve;
  const dx = x - AIRFIELD.x;
  const dz = z - AIRFIELD.z;
  const flat = Math.max(0, 1 - Math.max(Math.abs(dx) / 620, Math.abs(dz) / (AIRFIELD.length / 2 + 420)));
  const eased = flat * flat * (3 - 2 * flat);
  return h * (1 - eased) + AIRFIELD.elevation * eased;
}

/** What covers the ground at a point: the renderer colours by this. */
export function groundKind(x, z) {
  if (Math.abs(x - riverCenter(z)) < 130) return 'river';
  const dx = x - AIRFIELD.x;
  const dz = z - AIRFIELD.z;
  if (Math.abs(dx) < AIRFIELD.width / 2 && Math.abs(dz) < AIRFIELD.length / 2) return 'runway';
  if (Math.abs(dx) < 330 && Math.abs(dz) < AIRFIELD.length / 2 + 260) return 'apron';
  const plot = cellHash(Math.floor(x / 700), Math.floor(z / 700));
  const h = groundHeight(x, z);
  if (h > 620 || plot < 0.3) return 'forest';
  if (plot < 0.55) return 'fieldA';
  if (plot < 0.8) return 'fieldB';
  return 'fieldC';
}

/** The eight target rings of mission 1, hung down the valley in flying order. */
export function ringCourse() {
  const rings = [];
  for (let i = 0; i < RINGS.count; i += 1) {
    const z = 400 + i * 1750;
    const x = riverCenter(z) + (i % 2 === 0 ? -420 : 460) * Math.sin(i * 1.7 + 0.6);
    const y = groundHeight(x, z) + 300 + 130 * Math.sin(i * 2.3);
    rings.push({ x, y, z, passed: false });
  }
  return rings;
}

/** The rescue beacon of mission 2: a hilltop east of the ridge shoulder. */
export const BEACON = { x: 4300, z: 9200 };

/** Beacon altitude, read off the same heightfield the renderer draws. */
export function beaconHeight() {
  return groundHeight(BEACON.x, BEACON.z);
}

/** Scatter for the renderer: pine trees on the forest, houses in two villages. */
export function scatter() {
  const random = makeRandom(20261126);
  const trees = [];
  const houses = [];
  for (let i = 0; i < 2600; i += 1) {
    const x = (random() - 0.5) * WORLD.size;
    const z = (random() - 0.5) * WORLD.size;
    const kind = groundKind(x, z);
    if (kind === 'forest') trees.push({ x, z, s: 0.7 + random() * 0.8 });
  }
  for (const village of [{ x: -900, z: 2600 }, { x: 1500, z: -3600 }]) {
    for (let i = 0; i < 26; i += 1) {
      const x = village.x + (random() - 0.5) * 640;
      const z = village.z + (random() - 0.5) * 640;
      if (groundKind(x, z) !== 'river') houses.push({ x, z, r: random() * Math.PI });
    }
  }
  return { trees, houses };
}
