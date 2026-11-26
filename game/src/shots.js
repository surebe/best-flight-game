// The screenshot scenes behind ?shot=cover|rings|approach|debrief. Each one
// poses the real aircraft and mission state — no mock-ups — steps the real
// flight model a short way so the frame is a moment of actual play, and the
// fixed poses make the same frame every time.

import { STEP } from './config.js';
import { createPlane, stepPlane } from './flight.js';
import { createMission, startPose } from './missions.js';
import { AIRFIELD, groundHeight, ringCourse } from './terrain.js';

const deg = (r) => (r * 180) / Math.PI;

/** Put the plane `dist` metres short of a target, aimed at it, at a height. */
function poseToward(plane, tx, tz, dist, y, speed) {
  const heading = deg(Math.atan2(tx - plane.x, tz - plane.z));
  plane.x = tx - Math.sin((heading * Math.PI) / 180) * dist;
  plane.z = tz - Math.cos((heading * Math.PI) / 180) * dist;
  plane.heading = heading;
  plane.y = y;
  plane.speed = speed;
  plane.throttle = 0.62;
  plane.airborne = true;
}

/** Fly the staged pose forward a few real steps with a gentle hand. */
function settle(plane, seconds, controls) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) stepPlane(plane, controls, STEP);
}

/**
 * Build the world state for a named scene. Returns {plane, mission, screen}
 * with screen 'play' or 'debrief', plus a campaign summary for the debrief.
 */
export function stageShot(name, scatter) {
  if (name === 'rings') {
    const mission = createMission('rings');
    const plane = createPlane(0, 0, 0, 0);
    const target = mission.rings[2];
    plane.x = target.x - 300;
    plane.z = target.z - 1500;
    poseToward(plane, target.x, target.z, 1250, target.y + 40, 124);
    plane.bank = 21;
    plane.pitch = 3;
    mission.rings[0].passed = true;
    mission.rings[1].passed = true;
    mission.ringsPassed = 2;
    mission.score = 240;
    settle(plane, 0.7, { pitch: 0.05, roll: 0.12, throttleDelta: 0 });
    plane.bank = 21;
    return { plane, mission, screen: 'play', scatter };
  }
  if (name === 'approach') {
    const mission = createMission('approach');
    const plane = createPlane(0, 0, 0, 0);
    plane.x = AIRFIELD.x + 130;
    plane.z = AIRFIELD.z - 1500;
    poseToward(plane, AIRFIELD.x, AIRFIELD.z + 200, 1180, AIRFIELD.elevation + 105, 76);
    plane.pitch = -4;
    plane.throttle = 0.34;
    mission.score = 960;
    settle(plane, 0.6, { pitch: 0.02, roll: 0, throttleDelta: 0 });
    plane.pitch = -4;
    return { plane, mission, screen: 'play', scatter };
  }
  if (name === 'debrief') {
    const mission = createMission('approach');
    const pose = startPose('approach');
    const plane = createPlane(pose.x, pose.y, pose.z, pose.heading);
    plane.fuel = 41;
    const campaign = {
      results: [
        { id: 'rings', success: true, score: 960 },
        { id: 'beacon', success: true, score: 588 },
        { id: 'approach', success: true, score: 592 },
      ],
      total: 2140,
    };
    return { plane, mission, screen: 'debrief', scatter, campaign };
  }
  // cover: the dawn valley, the river, and the first rings ahead.
  const mission = createMission('rings');
  const plane = createPlane(0, 0, 0, 0);
  const rings = ringCourse();
  plane.x = rings[0].x - 260;
  plane.z = rings[0].z - 1900;
  poseToward(plane, rings[0].x, rings[0].z, 1750, rings[0].y + 150, 117);
  plane.bank = -7;
  plane.pitch = 2;
  mission.score = 0;
  settle(plane, 0.8, { pitch: 0.03, roll: -0.05, throttleDelta: 0 });
  plane.bank = -7;
  if (plane.y < groundHeight(plane.x, plane.z) + 240) plane.y = groundHeight(plane.x, plane.z) + 240;
  return { plane, mission, screen: 'play', scatter };
}
