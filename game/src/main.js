// AERIS — Dawn Patrol: the game's entry point. Owns the screens (title,
// briefing, flight, debrief), the campaign that strings the three sorties
// together, and the fixed-step loop every frame runs on. With ?shot=<scene>
// it stages one deterministic frame instead, for the hand-in screenshots.

import { MISSIONS, STEP, VIEW } from './config.js';
import { createAudio } from './audio.js';
import { EVENT_STRIKE, createPlane, stepPlane } from './flight.js';
import { createInput } from './input.js';
import { MISSION_BRIEF, createMission, startPose, stepMission } from './missions.js';
import { debriefLines, drawCard, drawFlight } from './render.js';
import { stageShot } from './shots.js';
import { scatter } from './terrain.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
const status = document.getElementById('status');
const input = createInput();
const audio = createAudio();
const worldScatter = scatter();

const query = new URLSearchParams(location.search);
const shotName = query.get('shot');

/** The title screen's camera: a slow orbit over the valley, no pilot needed. */
function orbitPlane(time) {
  const plane = createPlane(0, 0, 0, 0);
  const angle = time * 0.05;
  plane.x = Math.sin(angle) * 3400;
  plane.z = Math.cos(angle) * 3400 - 400;
  plane.heading = ((angle * 180) / Math.PI + 90 + 360) % 360;
  plane.y = 980;
  plane.speed = 104;
  plane.throttle = 0.6;
  plane.pitch = 1;
  plane.bank = 10;
  plane.airborne = true;
  return plane;
}

const game = {
  screen: 'title',
  campaign: { index: 0, results: [], total: 0 },
  plane: null,
  mission: null,
  endTimer: 0,
  time: 0,
};

function beginSortie(index) {
  const id = MISSIONS[index];
  game.mission = createMission(id);
  const pose = startPose(id);
  game.plane = createPlane(pose.x, pose.y, pose.z, pose.heading);
  game.plane.speed = pose.speed;
  game.plane.airborne = pose.airborne;
  if (pose.airborne) game.plane.throttle = 0.62;
  game.screen = 'brief';
  game.endTimer = 0;
}

function finishSortie() {
  const { mission, campaign } = game;
  campaign.results.push({ id: mission.id, success: mission.success, score: mission.score });
  campaign.total += mission.score;
  if (mission.success) audio.fanfare();
  if (campaign.index + 1 < MISSIONS.length) {
    campaign.index += 1;
    beginSortie(campaign.index);
  } else {
    game.screen = 'debrief';
  }
}

function stepPlay(dt) {
  const controls = input.read(VIEW);
  const before = game.mission.ringsPassed;
  const events = stepPlane(game.plane, controls, dt);
  stepMission(game.mission, game.plane, events, dt);
  if (game.mission.ringsPassed > before) audio.ring();
  if (events & EVENT_STRIKE) audio.strike();
  audio.engine(game.plane.throttle, game.plane.speed);
  if (game.mission.done) {
    game.endTimer += dt;
    if (game.endTimer > 2.4) finishSortie();
  }
  status.textContent = `${MISSION_BRIEF[game.mission.id].title}: altitude ${Math.round(game.plane.y * 3.28084)} feet, ${Math.round(game.plane.speed)} knots, score ${game.mission.score}`;
}

function draw() {
  if (game.screen === 'title') {
    const plane = orbitPlane(game.time);
    const ghost = { plane, mission: createMission('rings'), scatter: worldScatter, time: game.time };
    drawFlight(ctx, VIEW, ghost);
    drawCard(ctx, VIEW, [
      { text: 'A E R I S', font: '800 54px system-ui, sans-serif', color: '#f4f6f8' },
      { text: 'D A W N   P A T R O L', font: '700 22px system-ui, sans-serif', color: '#ffb648' },
      { text: 'Three sorties over one valley: thread the rings,', font: '400 17px system-ui, sans-serif', color: '#dfe7ee' },
      { text: 'reach the rescue beacon, then land her home.', font: '400 17px system-ui, sans-serif', color: '#dfe7ee' },
      { text: 'Arrows pitch & bank · W/S throttle · mouse steers', font: '400 15px system-ui, sans-serif', color: '#9fb2c3' },
      { text: 'Press ENTER to fly', font: '700 19px system-ui, sans-serif', color: '#59e39a' },
    ]);
    return;
  }
  if (game.screen === 'debrief') {
    const plane = orbitPlane(game.time);
    drawFlight(ctx, VIEW, { plane, mission: createMission('rings'), scatter: worldScatter, time: game.time });
    drawCard(ctx, VIEW, debriefLines(game.campaign));
    return;
  }
  const world = { plane: game.plane, mission: game.mission, scatter: worldScatter, time: game.time };
  drawFlight(ctx, VIEW, world);
  if (game.screen === 'brief') {
    const brief = MISSION_BRIEF[game.mission.id];
    drawCard(ctx, VIEW, [
      { text: brief.title, font: '800 24px system-ui, sans-serif', color: '#f4f6f8' },
      { text: brief.goal, font: '400 16px system-ui, sans-serif', color: '#dfe7ee' },
      { text: brief.hint, font: '400 15px system-ui, sans-serif', color: '#9fb2c3' },
      { text: 'Press ENTER — engine running', font: '700 18px system-ui, sans-serif', color: '#59e39a' },
    ]);
  }
  if (game.mission.done) {
    drawCard(ctx, VIEW, [
      { text: game.mission.success ? 'SORTIE COMPLETE' : 'SORTIE FAILED', font: '800 26px system-ui, sans-serif', color: game.mission.success ? '#59e39a' : '#ff6a5e' },
      { text: game.mission.note, font: '400 16px system-ui, sans-serif', color: '#dfe7ee' },
      { text: `${game.mission.score} points`, font: '700 18px system-ui, sans-serif', color: '#ffb648' },
    ]);
  }
}

let last = performance.now();
let accumulator = 0;
function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.time += elapsed;
  accumulator += elapsed;
  while (accumulator >= STEP) {
    accumulator -= STEP;
    if (game.screen === 'play') stepPlay(STEP);
  }
  if (input.consumeTap('Enter')) {
    audio.unlock();
    if (game.screen === 'title') {
      game.campaign = { index: 0, results: [], total: 0 };
      beginSortie(0);
    } else if (game.screen === 'brief') {
      game.screen = 'play';
    } else if (game.screen === 'debrief') {
      game.screen = 'title';
    }
  }
  draw();
  requestAnimationFrame(frame);
}

if (shotName) {
  const staged = stageShot(shotName, worldScatter);
  game.plane = staged.plane;
  game.mission = staged.mission;
  game.campaign = staged.campaign || game.campaign;
  game.screen = staged.screen === 'debrief' ? 'debrief' : 'play';
  if (staged.screen === 'debrief') game.campaign = staged.campaign;
  draw();
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}
