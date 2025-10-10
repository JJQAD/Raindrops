// p5.js sketch: Raindrop ripples with curved spawn schedule + ploppy notes + hint text
// Add **p5.sound** via the CDN in index.html (already included).

// ============ Visual knobs ============
const GROWTH_RATE_PX_PER_SEC = 140; // ring expansion speed
const START_RADIUS = 0;             // 0 = point birth (try 1–2)
const STROKE_WEIGHT = 2;            // ring outline thickness

// Color in HSL: dark blue -> light blue as it grows, plus alpha fade-out
const HUE = 210;             // blue hue
const SAT = 80;              // % saturation
const LIGHT_DARK = 25;       // starting lightness (%)
const LIGHT_LIGHT = 70;      // ending lightness (%)
const FADE_CURVE_POWER = 1.4;// 1 = linear; >1 lingers darker then fades

// ============ Spawn schedule ============
// We modulate the *interval* between spawns (in ms).
// Slow = 10000ms per drop; Fast = 250ms per drop (updated).
const SLOW_INTERVAL_MS = 10000;
const FAST_INTERVAL_MS = 250;   // UPDATED

// Timing (seconds) — UPDATED: ramp up 45s, fast hold 45s
const RAMP_UP_SECONDS   = 45;   // slow -> fast on a steepening curve (UPDATED)
const FAST_HOLD_SECONDS = 45;   // hold fast (UPDATED)
const RAMP_DOWN_SECONDS = 30;   // fast -> slow on a more gradual curve
const SLOW_HOLD_SECONDS = 30;   // hold slow

// Curves (exponents): higher = steeper near the end.
// Up should be steeper; down should be more gradual.
const RAMP_UP_POWER   = 3.0;  // Ease-in cubic (steepening)
const RAMP_DOWN_POWER = 2.0;  // Ease-in quad (more gradual than up)

// ============ Sound knobs (lower, “plop”) ============
const ENABLE_SOUND = true;
const NOTE_LEN_SECONDS = 0.10;
const NOTE_VELOCITY = 0.12;
const ATTACK = 0.004, DECAY = 0.07, SUSTAIN = 0.0, RELEASE = 0.12;
const WAVEFORM = "sine";

// Downward pitch slide for "plop":
const PLOP_MIN_DROP_SEMITONES = 3;
const PLOP_MAX_DROP_SEMITONES = 7;
const PLOP_GLIDE_TIME = 0.05;

// G major, lowered one octave: MIDI G4..G5 (C4 = 60)
const G_MAJOR_MIDI = [67, 69, 71, 72, 74, 76, 78, 79];

// ============ Hint text ============
const HINT_TEXT = "CLICK FOR SOUND";
const HINT_FADE_SECONDS = 1.0; // fade-out duration after first click

let drops = [];
let spawnAccumulator = 0; // when >= 1, spawn a drop

// Sound
let synth;
let audioEnabled = false;

// Hint state
let hintAlpha = 1.0;     // 0..1 (colorMode alpha range)
let hintFading = false;  // start fading after user clicks

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

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSL, 360, 100, 100, 1);
  noFill();
  strokeWeight(STROKE_WEIGHT);
  textAlign(CENTER, TOP);

  if (ENABLE_SOUND) {
    synth = new p5.MonoSynth();
    synth.setADSR(ATTACK, DECAY, SUSTAIN, RELEASE);
    synth.oscillator.setType(WAVEFORM);
    synth.portamento = 0; // we glide manually
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  for (const d of drops) d.offscreenRadius = d.computeOffscreenRadius();
}

function draw() {
  background(210, 70, 12); // deep blue
  const dtSec = deltaTime / 1000;

  // --- Evolving, curved spawn interval ---
  const intervalMs = currentSpawnIntervalMs();

  // Accumulate spawns proportionally to (deltaTime / interval)
  spawnAccumulator += deltaTime / intervalMs;
  while (spawnAccumulator >= 1) {
    const x = random(width);
    const y = random(height);
    drops.push(new Drop(x, y));
    spawnAccumulator -= 1;

    if (ENABLE_SOUND && audioEnabled && synth) {
      const midi = random(G_MAJOR_MIDI);
      const startHz = midiToFreq(midi);
      playPlop(startHz);
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
    // Light text with current alpha (colorMode alpha is 0..1)
    fill(0, 0, 100, hintAlpha);
    textSize(14);
    text(HINT_TEXT, width / 2, 8);
  }
}

// ---- Curved schedule helpers ----
function easeInPow(t, k) { return pow(constrain(t, 0, 1), k); }

function currentSpawnIntervalMs() {
  const t = millis() / 1000;
  const cycleLen =
    RAMP_UP_SECONDS + FAST_HOLD_SECONDS + RAMP_DOWN_SECONDS + SLOW_HOLD_SECONDS;
  const pos = t % cycleLen;

  if (pos < RAMP_UP_SECONDS) {
    // Steepening curve slow -> fast
    const p = pos / RAMP_UP_SECONDS;           // 0..1
    const eased = easeInPow(p, RAMP_UP_POWER); // small -> big (steep end)
    return lerp(SLOW_INTERVAL_MS, FAST_INTERVAL_MS, eased);
  }

  let acc = RAMP_UP_SECONDS;

  if (pos < (acc += FAST_HOLD_SECONDS)) {
    // Hold fast
    return FAST_INTERVAL_MS;
  }

  if (pos < (acc += RAMP_DOWN_SECONDS)) {
    // More gradual curve fast -> slow
    const p = (pos - (acc - RAMP_DOWN_SECONDS)) / RAMP_DOWN_SECONDS; // 0..1
    const eased = easeInPow(p, RAMP_DOWN_POWER);
    return lerp(FAST_INTERVAL_MS, SLOW_INTERVAL_MS, eased);
  }

  // Hold slow
  return SLOW_INTERVAL_MS;
}

// --- Plop helper: trigger note + quick downward pitch slide ---
function playPlop(startHz) {
  synth.play(startHz, NOTE_VELOCITY, 0, NOTE_LEN_SECONDS);
  const semitoneDrop = random(PLOP_MIN_DROP_SEMITONES, PLOP_MAX_DROP_SEMITONES);
  const targetHz = startHz * pow(2, -semitoneDrop / 12);
  synth.oscillator.freq(targetHz, PLOP_GLIDE_TIME);
}

// Enable audio on first user interaction (required by browsers)
// Also start fading the hint after any user interaction.
function mousePressed() { hintFading = true; enableAudioIfNeeded(); }
function touchStarted() { hintFading = true; enableAudioIfNeeded(); }
function keyPressed()   { hintFading = true; enableAudioIfNeeded(); }

function enableAudioIfNeeded() {
  const ctx = getAudioContext();
  if (ctx.state !== 'running') {
    userStartAudio().then(() => { audioEnabled = true; })
                    .catch(() => { audioEnabled = false; });
  } else {
    audioEnabled = true;
  }
}
