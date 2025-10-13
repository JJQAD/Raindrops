// sketch.js — Start-gated: first click starts audio+timeline; no drops on later clicks
// - "CLICK TO START" appears; nothing spawns until you click
// - On first click: unlock audio, fade hint, schedule first drop ~50ms later
// - Poisson/burst randomness + randomized interval timeline
// - Older p5.MonoSynth "plop" sound (downward glide)
//
// ============ Visual knobs ============
const GROWTH_RATE_PX_PER_SEC = 140; // ring expansion speed
const START_RADIUS = 0;             // 0 = point birth
const STROKE_WEIGHT = 2;            // ring outline thickness

// Color in HSL: dark blue -> light blue as it grows, plus alpha fade-out
const HUE = 210;             // blue hue
const SAT = 80;              // % saturation
const LIGHT_DARK = 25;       // starting lightness (%)
const LIGHT_LIGHT = 70;      // ending lightness (%)
const FADE_CURVE_POWER = 1.4;// 1 = linear; >1 lingers darker then fades

// ============ Spawn interval timeline ============
const SLOW_INTERVAL_MS = 10000; // fixed start
const FAST_INTERVAL_MS = 250;   // fixed fast target

// After the initial two segments, each new segment picks:
const RANDOM_DURATIONS_SEC = [15, 30, 45];     // segment length choices (seconds)
const MIN_INTERVAL_MS = 250;                   // random interval floor
const MAX_INTERVAL_MS = 10000;                 // random interval ceiling
const INTERVAL_STEP_MS = 250;                  // step size for random intervals

// ============ Poisson spawn randomness ============
let nextSpawnDueMs = null;        // absolute time (millis) for the next drop
const BURST_PROB = 0.12;          // chance a spawn is followed by extra drops
const BURST_MAX_EXTRA = 3;        // up to N extra drops immediately

function expMs(meanMs) {
  // Exponential RV with mean = meanMs
  return -Math.log(1 - random()) * meanMs;
}
function scheduleNext(meanMs) {
  nextSpawnDueMs = millis() + expMs(meanMs);
}

// ============ Sound knobs (MonoSynth “plop”) ============
const ENABLE_SOUND = true;
const NOTE_LEN_SECONDS = 0.10;
const NOTE_VELOCITY = 0.12;
const ATTACK = 0.004, DECAY = 0.07, SUSTAIN = 0.0, RELEASE = 0.12;
const WAVEFORM = "sine";

// G major, lowered one octave: MIDI G4..G5 (C4 = 60)
const G_MAJOR_MIDI = [67, 69, 71, 72, 74, 76, 78, 79];

// ============ Hint text ============
const HINT_TEXT = "CLICK TO START";
const HINT_FADE_SECONDS = 1.0; // fade-out duration after first click

// ------- internal state -------
let drops = [];
let started = false;       // NEW: gate the timeline until first click

// Sound
let synth;
let audioEnabled = false;

// Hint state
let hintAlpha = 1.0;     // 0..1 (colorMode alpha range)
let hintFading = false;  // start fading after user clicks

// Interval timeline state
let seg = null; // { t0, dur, startMs, endMs, type: "ramp"|"hold", _presetHoldNext? }

// --------- Ripple class ----------
class Drop {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = START_RADIUS;
    this.offscreenRadius = this.computeOffscreenRadius();
  }
  computeOffscreenRadius() {
    const dLeft   = this.x;
    const dRight  = width - this.x;
    const dTop    = this.y;
    const dBottom = height - this.y;
    return Math.max(dLeft, dRight, dTop, dBottom) + STROKE_WEIGHT * 0.5;
  }
  update(dtSec) {
    this.r += GROWTH_RATE_PX_PER_SEC * dtSec;
  }
  isGone() {
    return this.r >= this.offscreenRadius;
  }
  draw() {
    let p = constrain(this.r / this.offscreenRadius, 0, 1);
    const alpha = pow(1 - p, FADE_CURVE_POWER);
    const lightness = lerp(LIGHT_DARK, LIGHT_LIGHT, p);
    stroke(color(HUE, SAT, lightness, alpha));
    strokeWeight(STROKE_WEIGHT);
    noFill();
    circle(this.x, this.y, this.r * 2);
  }
}

// ===== p5 lifecycle =====
function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSL, 360, 100, 100, 1);
  noFill();
  strokeWeight(STROKE_WEIGHT);
  textAlign(CENTER, TOP);

  if (ENABLE_SOUND) {
    // p5.MonoSynth
    synth = new p5.MonoSynth();
    synth.setADSR(ATTACK, DECAY, SUSTAIN, RELEASE);
    synth.oscillator.setType(WAVEFORM);
    synth.portamento = 0;
  }

  // Define the timeline segments but DO NOT schedule spawns yet.
  // Start: ramp SLOW -> FAST over 45s, then preset a 45s FAST hold.
  seg = makeRampSegment(SLOW_INTERVAL_MS, FAST_INTERVAL_MS, 45);
  seg._presetHoldNext = true;

  // Leave nextSpawnDueMs = null until the user starts.
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  for (const d of drops) d.offscreenRadius = d.computeOffscreenRadius();
}

function draw() {
  background(210, 70, 12); // deep blue
  const dtSec = deltaTime / 1000;

  // Determine current mean interval from the active segment
  const meanMs = currentIntervalMs();

  // Only run the spawn scheduler after the user has started
  if (started) {
    const nowMs = millis();

    // Poisson-style spawns with bursts; catch up if multiple due this frame
    while (nextSpawnDueMs !== null && nowMs >= nextSpawnDueMs) {
      spawnDrop();

      // occasional burst: a few extra drops at (nearly) the same moment
      if (random() < BURST_PROB) {
        const extras = 1 + floor(random(BURST_MAX_EXTRA + 1)); // 1..BURST_MAX_EXTRA
        for (let i = 0; i < extras; i++) {
          spawnDrop();
        }
        // tiny nudge so they’re not exactly the same timestamp
        nextSpawnDueMs = nowMs + random(5, 25);
      }

      // schedule the next spawn using the *current* mean interval
      scheduleNext(meanMs);
    }
  }

  // Update & render drops
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.update(dtSec);
    d.draw();
    if (d.isGone()) drops.splice(i, 1);
  }

  // Draw hint text and manage fade after click
  if (hintAlpha > 0) {
    if (hintFading) {
      hintAlpha = max(0, hintAlpha - dtSec / HINT_FADE_SECONDS);
    }
    noStroke();
    fill(0, 0, 100, hintAlpha);
    textSize(14);
    text(HINT_TEXT, width / 2, 8);
  }
}

// Single place to create a drop + sound
function spawnDrop() {
  const x = random(width);
  const y = random(height);
  drops.push(new Drop(x, y));

  if (ENABLE_SOUND && audioEnabled && synth) {
    const midi = random(G_MAJOR_MIDI);
    const startHz = midiToFreq(midi);
    playPlop(startHz);
  }
}

// ===== Interval timeline helpers =====

// Create a ramp segment
function makeRampSegment(startMs, endMs, durationSec) {
  return {
    type: "ramp",
    t0: millis() / 1000,
    dur: durationSec,
    startMs,
    endMs
  };
}

// Create a hold segment
function makeHoldSegment(valueMs, durationSec) {
  return {
    type: "hold",
    t0: millis() / 1000,
    dur: durationSec,
    startMs: valueMs,
    endMs: valueMs
  };
}

// Easing for ramps: smooth and natural
function easeInOutCubic(t) {
  t = constrain(t, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
}

// Return the current interval value (ms) and advance segments as needed
function currentIntervalMs() {
  const now = millis() / 1000;
  let elapsed = now - seg.t0;

  // If current segment finished, advance to next segment
  if (elapsed >= seg.dur) {
    const endVal = seg.endMs;

    if (seg._presetHoldNext) {
      // Enforce the initial FAST hold (45 s), then clear the flag
      seg = makeHoldSegment(FAST_INTERVAL_MS, 45);
    } else {
      // After the initial 2 segments, always generate a new random *ramp* segment
      // from the current end value to a random target interval, over a random duration.
      const durSec = randomChoice(RANDOM_DURATIONS_SEC);
      const targetMs = randomIntervalMsStepped(
        MIN_INTERVAL_MS, MAX_INTERVAL_MS, INTERVAL_STEP_MS, endVal
      );
      seg = makeRampSegment(endVal, targetMs, durSec);
    }
    elapsed = 0; // reset
  }

  // Compute the current value based on segment type
  if (seg.type === "hold") {
    return seg.startMs; // constant
  } else {
    // ramp
    const t = easeInOutCubic((now - seg.t0) / seg.dur);
    return lerp(seg.startMs, seg.endMs, t);
  }
}

// Choose a random element from an array
function randomChoice(arr) {
  return arr[floor(random(arr.length))];
}

// Pick a random interval in [minMs, maxMs] on step increments (e.g., 250ms steps),
// ensuring it's not identical to the current value (to guarantee actual change).
function randomIntervalMsStepped(minMs, maxMs, stepMs, currentVal) {
  const steps = floor((maxMs - minMs) / stepMs) + 1;
  if (steps <= 1) return minMs;

  let idx = floor(random(steps));
  let val = minMs + idx * stepMs;

  // Avoid no-op (same as current)
  if (val === currentVal) {
    idx = (idx + 1) % steps;
    val = minMs + idx * stepMs;
  }
  return val;
}

// --- MonoSynth plop helper: quick downward pitch slide ---
function playPlop(startHz) {
  synth.play(startHz, NOTE_VELOCITY, 0, NOTE_LEN_SECONDS);
  const semitoneDrop = random(3, 7);
  const targetHz = startHz * pow(2, -semitoneDrop / 12);
  synth.oscillator.freq(targetHz, 0.05);
}

// --- Start button / audio unlock (canvas-only) ---
let _startAttempted = false;
async function startIfNeeded() {
  if (_startAttempted) return; // only act on the FIRST user gesture
  _startAttempted = true;

  // Start timeline regardless of audio success
  started = true;
  hintFading = true;

  // Schedule the first spawn ~50ms from now, and seed the scheduler
  nextSpawnDueMs = millis() + 50;  // immediate first drop
  scheduleNext(SLOW_INTERVAL_MS);  // seed ongoing scheduling from slow mean

  // Try to unlock audio
  try {
    const ctx = getAudioContext();
    await userStartAudio();                 // must be inside a user gesture
    if (ctx.state !== 'running') await ctx.resume();
    audioEnabled = (ctx.state === 'running');
  } catch (e) {
    audioEnabled = false;
  }
}

// Only the first click/touch/keypress will start things. Later clicks do nothing.
function mousePressed() { startIfNeeded(); }
function touchStarted() { startIfNeeded(); }
function keyPressed()   { startIfNeeded(); }
