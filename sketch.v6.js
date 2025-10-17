// sketch.v6.js — Start-gated; first click starts audio+timeline (no drops on later clicks)
const GROWTH_RATE_PX_PER_SEC = 140;
const START_RADIUS = 0;
const STROKE_WEIGHT = 2;
const HUE = 210, SAT = 80, LIGHT_DARK = 25, LIGHT_LIGHT = 70, FADE_CURVE_POWER = 1.4;
const SLOW_INTERVAL_MS = 10000, FAST_INTERVAL_MS = 250;
const RANDOM_DURATIONS_SEC = [15, 30, 45], MIN_INTERVAL_MS = 250, MAX_INTERVAL_MS = 10000, INTERVAL_STEP_MS = 250;
let nextSpawnDueMs = null; const BURST_PROB = 0.12, BURST_MAX_EXTRA = 3;
function expMs(meanMs){ return -Math.log(1 - random()) * meanMs; }
function scheduleNext(meanMs){ nextSpawnDueMs = millis() + expMs(meanMs); }
const ENABLE_SOUND = true;
const NOTE_LEN_SECONDS = 0.10, NOTE_VELOCITY = 0.12;
const ATTACK = 0.004, DECAY = 0.07, SUSTAIN = 0.0, RELEASE = 0.12;
const WAVEFORM = "sine";
const G_MAJOR_MIDI = [67, 69, 71, 72, 74, 76, 78, 79];
const HINT_TEXT = "CLICK TO START"; const HINT_FADE_SECONDS = 1.0;
let drops = []; let started = false;
let synth; let audioEnabled = false;
let hintAlpha = 1.0, hintFading = false;
let seg = null;

class Drop {
  constructor(x,y){ this.x=x; this.y=y; this.r=START_RADIUS; this.offscreenRadius=this.computeOffscreenRadius(); }
  computeOffscreenRadius(){ const dLeft=this.x,dRight=width-this.x,dTop=this.y,dBottom=height-this.y; return Math.max(dLeft,dRight,dTop,dBottom)+STROKE_WEIGHT*0.5; }
  update(dt){ this.r += GROWTH_RATE_PX_PER_SEC*dt; }
  isGone(){ return this.r >= this.offscreenRadius; }
  draw(){ const p=constrain(this.r/this.offscreenRadius,0,1), a=pow(1-p,FADE_CURVE_POWER), L=lerp(LIGHT_DARK,LIGHT_LIGHT,p); stroke(color(HUE,SAT,L,a)); strokeWeight(STROKE_WEIGHT); noFill(); circle(this.x,this.y,this.r*2); }
}

function setup(){
  createCanvas(windowWidth, windowHeight);
  colorMode(HSL,360,100,100,1); noFill(); strokeWeight(STROKE_WEIGHT);
  textAlign(CENTER,CENTER);
  if (ENABLE_SOUND){ synth=new p5.MonoSynth(); synth.setADSR(ATTACK,DECAY,SUSTAIN,RELEASE); synth.oscillator.setType(WAVEFORM); synth.portamento=0; }
  seg = makeRampSegment(SLOW_INTERVAL_MS, FAST_INTERVAL_MS, 45); seg._presetHoldNext = true;
}

function windowResized(){ resizeCanvas(windowWidth, windowHeight); for (const d of drops) d.offscreenRadius=d.computeOffscreenRadius(); }

function draw(){
  background(210,70,12);
  const dt = deltaTime/1000, meanMs = currentIntervalMs();

  if (started){
    const now=millis();
    while(nextSpawnDueMs!==null && now>=nextSpawnDueMs){
      spawnDrop();
      if (random()<BURST_PROB){ const n=1+floor(random(BURST_MAX_EXTRA+1)); for(let i=0;i<n;i++) spawnDrop(); nextSpawnDueMs=now+random(5,25); }
      scheduleNext(meanMs);
    }
  }

  for (let i=drops.length-1;i>=0;i--){ const d=drops[i]; d.update(dt); d.draw(); if (d.isGone()) drops.splice(i,1); }

  if (hintAlpha>0){
    if (hintFading) hintAlpha = max(0, hintAlpha - dt/HINT_FADE_SECONDS);
    noStroke(); fill(0,0,100,hintAlpha);
    push();
    textAlign(CENTER, CENTER);
    textSize(28);
    text("RAIN DROPS", width/2, height/2 - 22);
    textSize(21);
    text(HINT_TEXT, width/2, height/2 + 12);
    pop();
  }
}

function spawnDrop(){
  const x = random(width), y = random(height);
  drops.push(new Drop(x,y));
  if (ENABLE_SOUND && audioEnabled && synth){
    const midi = random(G_MAJOR_MIDI);
    const hz = midiToFreq(midi);
    playPlop(hz);
  }
}

// Timeline helpers
function makeRampSegment(a,b,d){ return {type:"ramp", t0: millis()/1000, dur:d, startMs:a, endMs:b}; }
function makeHoldSegment(v,d){ return {type:"hold", t0: millis()/1000, dur:d, startMs:v, endMs:v}; }
function easeInOutCubic(t){ t=constrain(t,0,1); return t<.5?4*t*t*t:1-pow(-2*t+2,3)/2; }
function currentIntervalMs(){
  const now=millis()/1000; let e=now-seg.t0;
  if (e>=seg.dur){
    const endVal=seg.endMs;
    if (seg._presetHoldNext){ seg=makeHoldSegment(FAST_INTERVAL_MS,45); }
    else { const dur=randomChoice(RANDOM_DURATIONS_SEC); const target=randomIntervalMsStepped(MIN_INTERVAL_MS,MAX_INTERVAL_MS,INTERVAL_STEP_MS,endVal); seg=makeRampSegment(endVal,target,dur); }
    e=0;
  }
  if (seg.type==="hold") return seg.startMs;
  const t=easeInOutCubic((now-seg.t0)/seg.dur); return lerp(seg.startMs, seg.endMs, t);
}
function randomChoice(arr){ return arr[floor(random(arr.length))]; }
function randomIntervalMsStepped(minMs,maxMs,step,currentVal){
  const steps=floor((maxMs-minMs)/step)+1; if(steps<=1) return minMs;
  let idx=floor(random(steps)); let val=minMs+idx*step;
  if(val===currentVal){ idx=(idx+1)%steps; val=minMs+idx*step; }
  return val;
}

// MonoSynth plop helper
function playPlop(hz){
  synth.play(hz, NOTE_VELOCITY, 0, NOTE_LEN_SECONDS);
  const drop=random(3,7);
  const target=hz*pow(2,-drop/12);
  synth.oscillator.freq(target,0.05);
}

// Start button / audio unlock
let _startAttempted=false;
async function startIfNeeded(){
  if(_startAttempted) return;
  _startAttempted=true;
  started=true;
  hintFading=true;
  nextSpawnDueMs=millis()+10; // ~10ms first drop
  scheduleNext(SLOW_INTERVAL_MS);
  try{
    const ctx=getAudioContext();
    await userStartAudio();
    if(ctx.state!=='running') await ctx.resume();
    audioEnabled=(ctx.state==='running');
  }catch(e){ audioEnabled=false; }
}
function mousePressed(){ startIfNeeded(); } function touchStarted(){ startIfNeeded(); } function keyPressed(){ startIfNeeded(); }
