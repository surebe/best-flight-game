// AERIS — Dawn Patrol: every tuning number of the game in one place.

/** Canvas design resolution; the page scales it to the window. */
export const VIEW = { width: 1280, height: 800 };

/** Fixed simulation step, seconds. The same step in play and in screenshots. */
export const STEP = 1 / 60;

/** Aircraft limits, in the units the HUD shows: knots, feet, degrees. */
export const PLANE = {
  minSpeed: 0,
  maxSpeed: 190,
  stallSpeed: 58,
  cruiseSpeed: 105,
  throttleRate: 26, // knots per second toward the throttle's target
  pitchRate: 46, // degrees per second of elevator
  rollRate: 95, // degrees per second of aileron
  maxPitch: 24,
  maxBank: 62,
  turnPerBank: 1.55, // heading degrees per second per degree of bank at cruise
  maxClimb: 1900, // feet per minute at full pitch and cruise speed
  ceiling: 6500,
  fuelCapacity: 100,
  fuelBurn: 0.62, // fuel units per second at full throttle
  landingMaxSpeed: 82,
  landingMaxSink: 620, // feet per minute of sink a landing gear takes
};

/** The valley the sorties fly over: world units are metres. */
export const WORLD = {
  size: 26000, // the flyable square, centred on the airfield
  seaLevel: 0,
  ridgeHeight: 1180,
  valleyFloor: 120,
};

/** Ring course of mission 1: how many rings, and the score each one pays. */
export const RINGS = { count: 8, points: 120, radius: 95 };

/** Mission ids in the order a campaign flies them. */
export const MISSIONS = ['rings', 'beacon', 'approach'];

/** Score a clean landing pays on the final approach. */
export const LANDING_POINTS = 500;

/** Colours of the dawn sky and the valley, one style across every screen. */
export const PALETTE = {
  skyTop: '#2e4a7a',
  skyMid: '#7fa8c9',
  skyLow: '#f2c98a',
  sun: '#ffd98f',
  ridgeFar: '#5d7292',
  ridgeNear: '#47603f',
  fieldA: '#679a48',
  fieldB: '#8fa653',
  fieldC: '#b08d42',
  forest: '#33602b',
  river: '#4f83a8',
  road: '#8d8578',
  runway: '#3c4148',
  panel: '#14181f',
  panelEdge: '#2b323d',
  lampAmber: '#ffb648',
  lampGreen: '#59e39a',
  lampRed: '#ff6a5e',
  hud: '#aef2c1',
};
