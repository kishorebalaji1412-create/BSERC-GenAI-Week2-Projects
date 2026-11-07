"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const canvas = $("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const WORLD = { width: 900, height: 570, cx: 450, cy: 285, rx: 300, ry: 190 };
  const ROAD_HALF = 80;
  const LAP_GOAL = 3;
  const STORAGE_KEY = "auto-rally-records-v1";
  const SPEED_MAX = 1;
  const BASE_LAP_SECONDS = 34;
  const controls = { left: false, right: false, gas: false, brake: false, boost: false };
  const coinSites = [
    { f: .045, lane: -13 }, { f: .12, lane: 15 }, { f: .205, lane: -18 },
    { f: .29, lane: 19 }, { f: .37, lane: -10 }, { f: .46, lane: 17 },
    { f: .55, lane: -17 }, { f: .65, lane: 10 }, { f: .73, lane: -18 },
    { f: .82, lane: 16 }, { f: .91, lane: -12 }, { f: .97, lane: 14 }
  ];
  const obstacleSites = [
    { f: .16, lane: -32 }, { f: .335, lane: 34 }, { f: .51, lane: -36 },
    { f: .69, lane: 31 }, { f: .865, lane: -29 }
  ];
  const nitroSites = [
    { f: .255, lane: 32 }, { f: .605, lane: -30 }, { f: .79, lane: 32 }
  ];
  const scenery = [
    [61, 99, 1.05], [129, 83, .8], [218, 112, .9], [324, 76, .75], [558, 81, .9],
    [691, 108, .82], [807, 92, 1], [838, 194, .73], [820, 394, .93], [757, 485, .76],
    [632, 502, .88], [520, 472, .72], [334, 503, .82], [215, 475, .72], [95, 445, .96],
    [73, 325, .82], [105, 212, .75], [181, 537, .65], [720, 540, .68], [383, 548, .62]
  ];
  const state = {
    running: false,
    finished: false,
    progress: 0,
    lane: 0,
    speed: 0,
    boost: 1,
    score: 0,
    coins: 0,
    elapsed: 0,
    lapStartedAt: 0,
    lastFrame: 0,
    lastObstacleAt: -10,
    collected: new Set(),
    highScore: 0,
    bestLap: null,
    audio: null,
    muted: false,
    resized: false
  };

  function loadRecords() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      state.highScore = Number.isFinite(saved.highScore) ? Math.max(0, saved.highScore) : 0;
      state.bestLap = Number.isFinite(saved.bestLap) ? saved.bestLap : null;
    } catch (error) {
      console.error("Could not load Auto Rally records.", error);
    }
    updateRecords();
  }

  function saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ highScore: state.highScore, bestLap: state.bestLap }));
    } catch (error) {
      console.error("Could not save Auto Rally records.", error);
    }
  }

  function updateRecords() {
    $("#highScore").textContent = String(state.highScore).padStart(6, "0");
    $("#bestLap").textContent = state.bestLap === null ? "--:--.-" : formatTime(state.bestLap);
  }

  function formatTime(seconds) {
    seconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(1).padStart(4, "0")}`;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      state.resized = true;
    }
  }

  function worldTransform() {
    resizeCanvas();
    const scale = Math.min(canvas.width / WORLD.width, canvas.height / WORLD.height);
    const dx = (canvas.width - WORLD.width * scale) / 2;
    const dy = (canvas.height - WORLD.height * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, dx, dy);
  }

  function ellipsePath(rx, ry) {
    ctx.beginPath();
    ctx.ellipse(WORLD.cx, WORLD.cy, rx, ry, 0, 0, Math.PI * 2);
  }

  function roadPoint(fraction, lane = 0) {
    const angle = fraction * Math.PI * 2 - Math.PI / 2;
    const x = WORLD.rx * Math.cos(angle);
    const y = WORLD.ry * Math.sin(angle);
    const nx = Math.cos(angle) / WORLD.rx;
    const ny = Math.sin(angle) / WORLD.ry;
    const normalLength = Math.hypot(nx, ny) || 1;
    return {
      x: WORLD.cx + x + nx / normalLength * lane,
      y: WORLD.cy + y + ny / normalLength * lane,
      angle: Math.atan2(WORLD.ry * Math.cos(angle), -WORLD.rx * Math.sin(angle)) + Math.PI / 2
    };
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawTree(x, y, size, index) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#527b4d44";
    ctx.beginPath();
    ctx.ellipse(3 * size, 6 * size, 17 * size, 11 * size, -.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#76583b";
    roundedRect(ctx, -3 * size, -3 * size, 7 * size, 21 * size, 2 * size);
    ctx.fill();
    const colors = ["#377c56", "#478b5d", "#619c64", "#39764f"];
    ctx.fillStyle = colors[index % colors.length];
    ctx.beginPath();
    ctx.arc(0, -7 * size, 17 * size, 0, Math.PI * 2);
    ctx.arc(-10 * size, -1 * size, 10 * size, 0, Math.PI * 2);
    ctx.arc(10 * size, 0, 11 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a8cd7380";
    ctx.beginPath();
    ctx.arc(-5 * size, -12 * size, 4 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawScenery() {
    scenery.forEach(([x, y, size], index) => drawTree(x, y, size, index));
    ctx.fillStyle = "#f4d26e";
    ctx.beginPath();
    ctx.arc(760, 94, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff3b7";
    ctx.beginPath();
    ctx.arc(754, 88, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8e6bf";
    for (let index = 0; index < 5; index += 1) {
      ctx.beginPath();
      ctx.ellipse(174 + index * 17, 168 + index % 2 * 7, 7, 3, -.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e9c06d";
    roundedRect(ctx, 685, 164, 47, 26, 4);
    ctx.fill();
    ctx.fillStyle = "#fff1bd";
    roundedRect(ctx, 692, 170, 34, 3, 2);
    ctx.fill();
    ctx.fillStyle = "#e2d7b2";
    roundedRect(ctx, 155, 393, 55, 22, 4);
    ctx.fill();
    ctx.fillStyle = "#b09c6e";
    ctx.fillRect(162, 400, 40, 3);
  }

  function drawRoad() {
    ctx.fillStyle = "#8fba76";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = "#95c17d";
    for (let index = 0; index < 26; index += 1) {
      const x = (index * 173 + 32) % WORLD.width;
      const y = (index * 97 + 45) % WORLD.height;
      ctx.beginPath();
      ctx.ellipse(x, y, 13 + index % 4 * 3, 5 + index % 3 * 2, index * .3, 0, Math.PI * 2);
      ctx.fill();
    }
    drawScenery();
    ctx.fillStyle = "#c8975e";
    ellipsePath(WORLD.rx + ROAD_HALF + 11, WORLD.ry + ROAD_HALF + 11);
    ctx.fill();
    ctx.fillStyle = "#575d59";
    ellipsePath(WORLD.rx + ROAD_HALF, WORLD.ry + ROAD_HALF);
    ctx.fill();
    ctx.strokeStyle = "#ece0b4";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 12]);
    ellipsePath(WORLD.rx + ROAD_HALF + 5, WORLD.ry + ROAD_HALF + 5);
    ctx.stroke();
    ellipsePath(WORLD.rx - ROAD_HALF - 5, WORLD.ry - ROAD_HALF - 5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#dce1cb";
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 14]);
    ellipsePath(WORLD.rx, WORLD.ry);
    ctx.stroke();
    ctx.setLineDash([]);
    drawFinishLine();
  }

  function drawFinishLine() {
    const x = WORLD.cx;
    const y = WORLD.cy - WORLD.ry - ROAD_HALF + 4;
    const width = 17;
    const height = ROAD_HALF * 2 - 8;
    ctx.save();
    ctx.fillStyle = "#f8f6e8";
    ctx.fillRect(x - width / 2, y, width, height);
    const cell = width / 2;
    for (let row = 0; row < Math.ceil(height / cell); row += 1) {
      for (let column = 0; column < 2; column += 1) {
        if ((row + column) % 2 === 0) {
          ctx.fillStyle = "#38443d";
          ctx.fillRect(x - width / 2 + column * cell, y + row * cell, cell, cell);
        }
      }
    }
    ctx.restore();
  }

  function drawCoin(x, y, pulse = 0) {
    ctx.save();
    ctx.translate(x, y);
    const scale = .94 + Math.sin(pulse) * .06;
    ctx.scale(scale, 1);
    ctx.fillStyle = "#7b5724";
    ctx.beginPath();
    ctx.ellipse(1, 3, 10, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f3bb42";
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffe68d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff2ad";
    ctx.beginPath();
    ctx.arc(-3, -4, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCrate(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#272a2740";
    ctx.beginPath();
    ctx.ellipse(3, 10, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#965f36";
    roundedRect(ctx, -15, -14, 30, 28, 4);
    ctx.fill();
    ctx.strokeStyle = "#d49a5e";
    ctx.lineWidth = 3;
    ctx.strokeRect(-11, -10, 22, 20);
    ctx.beginPath();
    ctx.moveTo(-11, -10);
    ctx.lineTo(11, 10);
    ctx.moveTo(11, -10);
    ctx.lineTo(-11, 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawNitro(x, y, pulse = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#29343a4c";
    ctx.beginPath();
    ctx.ellipse(2, 10, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4084c1";
    roundedRect(ctx, -10, -14, 20, 26, 5);
    ctx.fill();
    ctx.fillStyle = "#9ed6ef";
    roundedRect(ctx, -5, -11, 4, 17, 2);
    ctx.fill();
    ctx.fillStyle = "#e6f4fb";
    ctx.fillRect(-5, -17, 10, 4);
    ctx.fillStyle = "#ffe36b";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("⚡", 0, 3 + Math.sin(pulse) * 1.5);
    ctx.restore();
  }

  function drawTrackItems() {
    const lap = Math.min(LAP_GOAL - 1, Math.floor(state.progress));
    const fraction = state.progress - Math.floor(state.progress);
    coinSites.forEach((site, index) => {
      const id = `c-${lap}-${index}`;
      if (state.collected.has(id)) return;
      const point = roadPoint(site.f, site.lane);
      drawCoin(point.x, point.y, state.elapsed * 5 + index);
    });
    obstacleSites.forEach((site, index) => {
      const id = `o-${lap}-${index}`;
      if (state.collected.has(id)) return;
      const point = roadPoint(site.f, site.lane);
      drawCrate(point.x, point.y);
    });
    nitroSites.forEach((site, index) => {
      const id = `n-${lap}-${index}`;
      if (state.collected.has(id)) return;
      const point = roadPoint(site.f, site.lane);
      drawNitro(point.x, point.y, state.elapsed * 4 + index);
    });
    void fraction;
  }

  function drawAuto() {
    const fraction = state.progress % 1;
    const point = roadPoint(fraction, state.lane);
    const angle = point.angle;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    if (controls.boost && state.boost > 0) {
      ctx.fillStyle = "#57b6ea";
      ctx.beginPath();
      ctx.moveTo(-5, 14);
      ctx.lineTo(0, 24 + Math.random() * 7);
      ctx.lineTo(5, 14);
      ctx.fill();
      ctx.fillStyle = "#ffe17b";
      ctx.beginPath();
      ctx.moveTo(-2, 14);
      ctx.lineTo(0, 21 + Math.random() * 4);
      ctx.lineTo(2, 14);
      ctx.fill();
    }
    ctx.fillStyle = "#28322e55";
    ctx.beginPath();
    ctx.ellipse(2, 6, 23, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#242a27";
    roundedRect(ctx, -17, -10, 7, 15, 2);
    ctx.fill();
    roundedRect(ctx, 10, -10, 7, 15, 2);
    ctx.fill();
    roundedRect(ctx, -17, 5, 7, 12, 2);
    ctx.fill();
    roundedRect(ctx, 10, 5, 7, 12, 2);
    ctx.fill();
    ctx.fillStyle = "#3eaa70";
    roundedRect(ctx, -13, -17, 26, 34, 8);
    ctx.fill();
    ctx.fillStyle = "#e8c54f";
    roundedRect(ctx, -11, -14, 22, 8, 4);
    ctx.fill();
    ctx.fillStyle = "#bce4c6";
    roundedRect(ctx, -9, -5, 18, 12, 4);
    ctx.fill();
    ctx.strokeStyle = "#28794e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, 5);
    ctx.lineTo(9, 5);
    ctx.stroke();
    ctx.fillStyle = "#34423b";
    ctx.beginPath();
    ctx.arc(0, -2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5bd8c";
    ctx.beginPath();
    ctx.arc(0, -4, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#49352a";
    ctx.beginPath();
    ctx.arc(0, -6.8, 3.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff2bd";
    ctx.beginPath();
    ctx.arc(-8, -14, 2, 0, Math.PI * 2);
    ctx.arc(8, -14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-1.5, -4.5, 1, 0, Math.PI * 2);
    ctx.arc(1.5, -4.5, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFrame() {
    worldTransform();
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    drawRoad();
    drawTrackItems();
    drawAuto();
  }

  function setupAudio() {
    if (state.audio) {
      state.audio.context.resume().catch((error) => console.warn("Audio resume was blocked.", error));
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = state.muted ? 0 : .42;
    master.connect(context.destination);
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const engineGain = context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = 58;
    filter.type = "lowpass";
    filter.frequency.value = 360;
    engineGain.gain.value = .025;
    oscillator.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    oscillator.start();
    state.audio = { context, master, oscillator, engineGain };
    context.resume().catch((error) => console.warn("Audio context could not resume.", error));
  }

  function updateEngineSound() {
    if (!state.audio) return;
    const { context, oscillator, engineGain } = state.audio;
    const now = context.currentTime;
    const boostFactor = controls.boost && state.boost > 0 ? 1.5 : 1;
    oscillator.frequency.setTargetAtTime(52 + state.speed * 95 * boostFactor, now, .08);
    engineGain.gain.setTargetAtTime(state.running ? .012 + state.speed * .025 : .003, now, .1);
  }

  function beep(frequency, duration, type = "sine", volume = .12, endFrequency = null) {
    if (!state.audio || state.muted) return;
    const { context, master } = state.audio;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, context.currentTime + duration);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  function playCoinSound() {
    beep(830, .09, "sine", .14, 1180);
    setTimeout(() => beep(1150, .12, "sine", .09, 1460), 55);
  }

  function playCrashSound() {
    beep(170, .22, "sawtooth", .17, 48);
    if (!state.audio || state.muted) return;
    const { context, master } = state.audio;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * .16), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = .1;
    source.connect(gain);
    gain.connect(master);
    source.start();
  }

  function startGame() {
    setupAudio();
    state.running = true;
    state.finished = false;
    state.progress = 0;
    state.lane = 0;
    state.speed = .12;
    state.boost = 1;
    state.score = 0;
    state.coins = 0;
    state.elapsed = 0;
    state.lapStartedAt = 0;
    state.lastObstacleAt = -10;
    state.collected.clear();
    state.lastFrame = performance.now();
    $("#startOverlay").classList.add("hidden");
    $("#finishOverlay").classList.add("hidden");
    updateHud();
  }

  function updateHud() {
    const lap = Math.min(LAP_GOAL, Math.floor(state.progress) + 1);
    $("#timer").textContent = formatTime(state.elapsed);
    $("#lapCounter").innerHTML = `${lap} <i>/ ${LAP_GOAL}</i>`;
    $("#score").textContent = String(state.score).padStart(6, "0");
    $("#speed").textContent = String(Math.round(state.speed * 142));
    $(".lap-dots").querySelectorAll("i").forEach((dot, index) => dot.classList.toggle("current", index === lap - 1));
    $("#progressLabel").textContent = `${Math.min(100, Math.floor(state.progress / LAP_GOAL * 100))}%`;
    $("#progressBar").style.width = `${Math.min(100, state.progress / LAP_GOAL * 100)}%`;
    $("#coinCount").textContent = String(state.coins);
    $("#nitroMeter b").style.width = `${Math.round(state.boost * 100)}%`;
  }

  function checkLapCrossing(oldProgress, newProgress) {
    const oldLap = Math.floor(oldProgress);
    const newLap = Math.floor(newProgress);
    if (newLap <= oldLap) return;
    for (let lap = oldLap; lap < newLap && lap < LAP_GOAL; lap += 1) {
      const lapTime = state.elapsed - state.lapStartedAt;
      state.lapStartedAt = state.elapsed;
      if (state.bestLap === null || lapTime < state.bestLap) {
        state.bestLap = lapTime;
        saveRecords();
        updateRecords();
      }
      if (lap + 1 < LAP_GOAL) beep(660, .12, "triangle", .08, 880);
    }
    if (newProgress >= LAP_GOAL) finishGame();
  }

  function collectTrackObjects(deltaProgress) {
    const lap = Math.floor(state.progress);
    const fraction = state.progress - lap;
    const lane = state.lane;
    const scan = (sites, prefix, type) => {
      sites.forEach((site, index) => {
        const id = `${prefix}-${lap}-${index}`;
        if (state.collected.has(id)) return;
        const distance = (site.f - fraction + 1) % 1;
        if (distance > Math.max(.018, deltaProgress * 2 + .005) || Math.abs(lane - site.lane) > (type === "obstacle" ? 29 : 33)) return;
        state.collected.add(id);
        if (type === "coin") {
          state.score += 100;
          state.coins += 1;
          playCoinSound();
        } else if (type === "nitro") {
          state.boost = Math.min(1, state.boost + .42);
          beep(430, .18, "triangle", .1, 820);
        } else if (state.elapsed - state.lastObstacleAt > 1.1) {
          state.speed = Math.max(.14, state.speed * .47);
          state.lastObstacleAt = state.elapsed;
          playCrashSound();
        }
      });
    };
    scan(coinSites, "c", "coin");
    scan(obstacleSites, "o", "obstacle");
    scan(nitroSites, "n", "nitro");
  }

  function update(deltaSeconds) {
    if (!state.running) return;
    const dt = Math.min(deltaSeconds, .05);
    state.elapsed += dt;
    if (controls.left) state.lane -= 104 * dt;
    if (controls.right) state.lane += 104 * dt;
    state.lane = Math.max(-ROAD_HALF + 15, Math.min(ROAD_HALF - 15, state.lane));
    const boosting = controls.boost && state.boost > 0;
    const acceleration = controls.gas ? .58 : -.08;
    state.speed += acceleration * dt;
    if (controls.brake) state.speed -= .95 * dt;
    if (boosting) {
      state.speed += .72 * dt;
      state.boost = Math.max(0, state.boost - .32 * dt);
    } else {
      state.boost = Math.min(1, state.boost + .035 * dt);
    }
    if (Math.abs(state.lane) > ROAD_HALF - 25) state.speed -= .18 * dt;
    state.speed = Math.max(0, Math.min(boosting ? 1 : .78, state.speed));
    const oldProgress = state.progress;
    const maxProgressPerSecond = 1 / BASE_LAP_SECONDS;
    const deltaProgress = state.speed * maxProgressPerSecond * dt;
    state.progress += deltaProgress;
    collectTrackObjects(deltaProgress);
    checkLapCrossing(oldProgress, state.progress);
    updateHud();
    updateEngineSound();
  }

  function finishGame() {
    if (state.finished) return;
    state.finished = true;
    state.running = false;
    const newHighScore = state.score > state.highScore;
    if (newHighScore) state.highScore = state.score;
    saveRecords();
    updateRecords();
    $("#finalTime").textContent = formatTime(state.elapsed);
    $("#finalScore").textContent = String(state.score).padStart(6, "0");
    $("#finishTitle").textContent = "What a ride!";
    $("#recordText").textContent = newHighScore ? "New personal best score!" : "Nice driving, little legend.";
    $("#finishOverlay").classList.remove("hidden");
    beep(620, .25, "triangle", .12, 1040);
    setTimeout(() => beep(820, .28, "triangle", .1, 1240), 220);
  }

  function frame(timestamp) {
    const dt = state.lastFrame ? Math.max(0, (timestamp - state.lastFrame) / 1000) : 0;
    state.lastFrame = timestamp;
    update(dt);
    drawFrame();
    requestAnimationFrame(frame);
  }

  function setControl(name, pressed, button = null) {
    if (!(name in controls)) return;
    controls[name] = pressed;
    if (button) button.classList.toggle("pressed", pressed);
    if (pressed && !state.audio) setupAudio();
  }

  function controlForKey(key) {
    const normalized = key.toLowerCase();
    if (normalized === "arrowleft" || normalized === "a") return "left";
    if (normalized === "arrowright" || normalized === "d") return "right";
    if (normalized === "arrowup" || normalized === "w") return "gas";
    if (normalized === "arrowdown" || normalized === "s") return "brake";
    if (normalized === " " || normalized === "shift") return "boost";
    return null;
  }

  function bindControls() {
    $$("[data-control]").forEach((button) => {
      const name = button.dataset.control;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (event.isTrusted) button.setPointerCapture(event.pointerId);
        setControl(name, true, button);
        if (!state.running && name === "gas") startGame();
      });
      const release = (event) => {
        event.preventDefault();
        setControl(name, false, button);
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", () => setControl(name, false, button));
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    });
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      const control = controlForKey(key);
      if (control) {
        event.preventDefault();
        setControl(control, true);
      } else if ((key === "enter" || key === " ") && !state.running && !state.finished) {
        event.preventDefault();
        startGame();
      }
    });
    window.addEventListener("keyup", (event) => {
      const control = controlForKey(event.key);
      if (control) {
        event.preventDefault();
        setControl(control, false);
      }
    });
    window.addEventListener("blur", () => {
      Object.keys(controls).forEach((name) => {
        controls[name] = false;
        $(`[data-control="${name}"]`).classList.remove("pressed");
      });
    });
  }

  $("#startButton").addEventListener("click", startGame);
  $("#replayButton").addEventListener("click", startGame);
  $("#muteButton").addEventListener("click", () => {
    state.muted = !state.muted;
    $("#muteIcon").textContent = state.muted ? "♪̸" : "♫";
    $("#muteButton").setAttribute("aria-label", state.muted ? "Unmute sounds" : "Mute sounds");
    $("#muteButton").title = state.muted ? "Unmute sounds" : "Mute sounds";
    if (state.audio) state.audio.master.gain.setTargetAtTime(state.muted ? 0 : .42, state.audio.context.currentTime, .02);
  });
  window.addEventListener("resize", resizeCanvas);
  loadRecords();
  bindControls();
  drawFrame();
  requestAnimationFrame(frame);
})();