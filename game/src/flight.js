// The aircraft: one state, stepped by the flight model. Arcade-true physics —
// throttle buys speed, pitch trades speed for height, bank turns, and a wing
// flown too slowly stops holding the sky.

import { PLANE, WORLD } from './config.js';
import { AIRFIELD, groundHeight } from './terrain.js';

/** A fresh aircraft on the runway, engine idling, full tanks. */
export function createPlane(x, y, z, heading) {
  return {
    x, y, z, heading,
    pitch: 0, // degrees, nose up positive
    bank: 0, // degrees, right wing down positive
    speed: 0, // knots
    throttle: 0, // 0..1
    fuel: PLANE.fuelCapacity,
    damage: 0, // 0..100; at 100 the sortie is over
    airborne: false,
    airTime: 0, // seconds since liftoff; the ground is patient while it is small
    crashed: false,
    landed: false,
    stall: false,
    gearStrike: false,
  };
}

const rad = (deg) => (deg * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Advance the aircraft one step. `controls` is {pitch, roll, throttleDelta}
 * with pitch and roll in -1..1. Returns the events that fired this step
 * (EVENT_TAKEOFF, EVENT_STRIKE, EVENT_CRASH, EVENT_LANDED) as a bitmask.
 */
export const EVENT_TAKEOFF = 1;
export const EVENT_STRIKE = 2;
export const EVENT_CRASH = 4;
export const EVENT_LANDED = 8;

export function stepPlane(plane, controls, dt) {
  let events = 0;
  plane.throttle = clamp(plane.throttle + controls.throttleDelta * dt, 0, 1);

  // The engine pulls speed toward what the throttle asks; drag and a raised
  // nose bleed it, a dropped nose feeds it.
  const target = plane.throttle * PLANE.maxSpeed;
  const slope = Math.sin(rad(plane.pitch)) * 26;
  plane.speed += clamp(target - plane.speed, -1, 1) * PLANE.throttleRate * dt * 0.55;
  plane.speed -= slope * dt * (plane.airborne ? 1 : 0.35);
  plane.speed = clamp(plane.speed, 0, PLANE.maxSpeed + 12);

  // Elevator and aileron, answered less eagerly on the ground.
  const authority = plane.airborne ? 1 : clamp(plane.speed / 40, 0.15, 0.6);
  plane.pitch += controls.pitch * PLANE.pitchRate * authority * dt;
  plane.pitch = clamp(plane.pitch, -PLANE.maxPitch, PLANE.maxPitch);
  plane.bank += controls.roll * PLANE.rollRate * authority * dt;
  plane.bank = clamp(plane.bank, -PLANE.maxBank, PLANE.maxBank);
  if (controls.roll === 0) plane.bank -= plane.bank * 1.9 * dt; // wings level themselves

  // A stalled wing drops the nose and stops turning the aircraft.
  plane.stall = plane.airborne && plane.speed < PLANE.stallSpeed;
  if (plane.stall) plane.pitch -= 26 * dt;

  // Heading follows bank; the turn is honest about speed.
  if (plane.airborne && !plane.stall) {
    plane.heading += Math.tan(rad(plane.bank)) * PLANE.turnPerBank * (PLANE.cruiseSpeed / Math.max(plane.speed, 40)) * dt * 10;
  }
  plane.heading = ((plane.heading % 360) + 360) % 360;

  // Climb is pitch paid for with speed; sink is what gravity keeps.
  const climbFpm = plane.airborne
    ? Math.sin(rad(plane.pitch)) * (plane.speed / PLANE.cruiseSpeed) * PLANE.maxClimb - (plane.stall ? 900 : 0)
    : 0;
  const forward = plane.speed * 0.514444; // knots to metres a second
  plane.x += Math.sin(rad(plane.heading)) * forward * dt;
  plane.z += Math.cos(rad(plane.heading)) * forward * dt;
  plane.y += climbFpm * 0.00508 * dt; // feet per minute to metres per second
  plane.x = clamp(plane.x, -WORLD.size / 2, WORLD.size / 2);
  plane.z = clamp(plane.z, -WORLD.size / 2, WORLD.size / 2);
  plane.y = Math.min(plane.y, PLANE.ceiling * 0.3048 + 2400);

  if (plane.airborne) plane.airTime += dt;

  // Fuel burns with the throttle; an empty tank is a gliding aircraft.
  plane.fuel = Math.max(0, plane.fuel - plane.throttle * PLANE.fuelBurn * dt);
  if (plane.fuel <= 0) plane.speed = Math.max(0, plane.speed - 9 * dt);

  // The ground settles every argument.
  const ground = groundHeight(plane.x, plane.z);
  const onRunway =
    Math.abs(plane.x - AIRFIELD.x) < AIRFIELD.width / 2 + 15 &&
    Math.abs(plane.z - AIRFIELD.z) < AIRFIELD.length / 2;
  if (!plane.airborne) {
    plane.y = ground;
    if (plane.speed > PLANE.stallSpeed + 6 && plane.pitch > 4) {
      plane.airborne = true;
      plane.airTime = 0;
      events |= EVENT_TAKEOFF;
    }
  } else if (plane.y <= ground - 2) {
    // Flown into rising ground outright: no landing check saves this.
    plane.y = ground;
    plane.damage = 100;
    plane.crashed = true;
    events |= EVENT_CRASH;
  } else if (plane.y <= ground + 0.5 && plane.airTime > 0.75) {
    plane.y = ground;
    const sink = -climbFpm;
    if (onRunway && plane.speed <= PLANE.landingMaxSpeed && sink <= PLANE.landingMaxSink && Math.abs(plane.bank) < 9) {
      plane.airborne = false;
      plane.landed = true;
      plane.speed = Math.min(plane.speed, 30);
      events |= EVENT_LANDED;
    } else {
      const hard = sink > PLANE.landingMaxSink || Math.abs(plane.bank) >= 14 || !onRunway;
      plane.damage += hard ? 46 : 22;
      plane.gearStrike = true;
      events |= EVENT_STRIKE;
      if (plane.damage >= 100 || sink > 1500) {
        plane.crashed = true;
        plane.damage = 100;
        events |= EVENT_CRASH;
      } else {
        plane.pitch = Math.max(plane.pitch, 7); // bounce back into the air
        plane.speed = Math.max(plane.speed * 0.72, 44);
        plane.y = ground + 1.4; // the bounce throws her clear of the ground
        plane.airTime = 0;
      }
    }
  }
  return events;
}

/** Height above the ground directly below, in feet — the radar altimeter. */
export function heightAboveGround(plane) {
  return Math.max(0, (plane.y - groundHeight(plane.x, plane.z)) * 3.28084);
}

/** Altitude in feet above the valley datum, what the altimeter shows. */
export function altitudeFeet(plane) {
  return plane.y * 3.28084;
}
