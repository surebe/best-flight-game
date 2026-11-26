// The campaign: three sorties over one valley, each asking a different thing
// of the pilot. Rings reward precision, the beacon rewards fuel discipline,
// the approach rewards a gentle hand. State lives here; the flight model only
// flies, the renderer only draws.

import { LANDING_POINTS, RINGS } from './config.js';
import { EVENT_CRASH, EVENT_LANDED } from './flight.js';
import { AIRFIELD, BEACON, beaconHeight, ringCourse } from './terrain.js';

/** What the briefing card and the HUD banner say about each sortie. */
export const MISSION_BRIEF = {
  rings: {
    title: 'MISSION 1 — RING RUN',
    goal: 'Fly through all 8 rings down the valley. Each ring pays 120 points.',
    hint: 'Bank to turn, mind the stall. A missed ring can be circled back for.',
  },
  beacon: {
    title: 'MISSION 2 — BEACON RESCUE',
    goal: 'Reach the rescue beacon on the eastern ridge before your fuel runs out.',
    hint: 'Climb early, throttle back in the cruise. The smoke column marks the spot.',
  },
  approach: {
    title: 'MISSION 3 — FINAL APPROACH',
    goal: 'Bring her home: land on the runway, under 82 knots and a gentle sink.',
    hint: 'Line up on the valley heading, bleed speed early, flare over the numbers.',
  },
};

/** A fresh campaign state for one mission. */
export function createMission(id) {
  return {
    id,
    rings: id === 'rings' ? ringCourse() : [],
    ringsPassed: 0,
    score: 0,
    time: 0,
    done: false,
    success: false,
    note: '',
    beaconReached: false,
  };
}

/** Distance in metres from the plane to a point, in the horizontal plane. */
function distanceTo(plane, x, z) {
  return Math.hypot(plane.x - x, plane.z - z);
}

/**
 * Score one stepped frame. Call after stepPlane with the events it returned;
 * sets mission.done when the sortie ends, one way or the other.
 */
export function stepMission(mission, plane, events, dt) {
  if (mission.done) return;
  mission.time += dt;

  if (events & EVENT_CRASH) return endSortie(mission, false, 'The valley keeps her. Airframe lost.');
  if (plane.fuel <= 0 && !plane.airborne) return endSortie(mission, false, 'Out of fuel on the ground.');

  if (mission.id === 'rings') {
    for (const ring of mission.rings) {
      if (ring.passed) continue;
      const through = distanceTo(plane, ring.x, ring.z) < RINGS.radius && Math.abs(plane.y - ring.y) < RINGS.radius;
      if (through) {
        ring.passed = true;
        mission.ringsPassed += 1;
        mission.score += RINGS.points;
      }
    }
    if (mission.ringsPassed === mission.rings.length) {
      return endSortie(mission, true, 'Every ring threaded. The valley salutes you.');
    }
    if (plane.fuel <= 0 && plane.airborne && plane.speed < 20) {
      return endSortie(mission, false, 'Out of fuel over the valley.');
    }
  }

  if (mission.id === 'beacon') {
    const near = distanceTo(plane, BEACON.x, BEACON.z) < 420 && Math.abs(plane.y - beaconHeight()) < 320;
    if (near) {
      mission.beaconReached = true;
      mission.score += 400 + Math.round(plane.fuel * 4); // home fuel is score
      return endSortie(mission, true, 'Beacon reached — the stranded crew waves you home.');
    }
    if (plane.fuel <= 0) return endSortie(mission, false, 'The tanks ran dry short of the ridge.');
  }

  if (mission.id === 'approach') {
    if (events & EVENT_LANDED) {
      mission.score += LANDING_POINTS + Math.round(plane.fuel * 2);
      return endSortie(mission, true, 'Greased it. Coffee is on the tower.');
    }
    if (plane.landed && plane.speed <= 0.5) {
      return endSortie(mission, true, 'Down and stopped on the runway.');
    }
  }
  return undefined;
}

function endSortie(mission, success, note) {
  mission.done = true;
  mission.success = success;
  mission.note = note;
}

/** Where a sortie starts: on the runway for rings and approach, airborne for the rescue. */
export function startPose(missionId) {
  if (missionId === 'beacon') {
    return { x: -600, y: 900, z: 1400, heading: 62, speed: 108, airborne: true };
  }
  return { x: AIRFIELD.x, y: AIRFIELD.elevation, z: AIRFIELD.z - 620, heading: 0, speed: 0, airborne: false };
}

/** A letter grade for the debrief, from the campaign's total score. */
export function gradeFor(score) {
  if (score >= 1500) return 'A — ACE';
  if (score >= 1100) return 'B — SHARP';
  if (score >= 700) return 'C — STEADY';
  if (score >= 300) return 'D — ROUGH';
  return 'E — GROUNDED';
}
