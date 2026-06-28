const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ── SPD 精灵图资源加载（正确帧尺寸提取）──
const spriteImages = {};
function loadSprite(name, path) {
  const img = new Image();
  img.src = path;
  spriteImages[name] = img;
}
// 英雄：avatars.png 第一个角色 32×32
loadSprite("hero", "sprites/hero_avatar.png");
// 怪物 idle 帧：16×15
loadSprite("rat", "sprites/rat_idle.png");
loadSprite("gnoll", "sprites/gnoll_idle.png");
loadSprite("skeleton", "sprites/skeleton_idle.png");
loadSprite("snake", "sprites/snake_idle.png");
loadSprite("bat", "sprites/bat_idle.png");
loadSprite("crab", "sprites/crab_idle.png");
loadSprite("slime", "sprites/slime_idle.png");
loadSprite("shooter", "sprites/eye_idle.png");
loadSprite("brute", "sprites/brute_idle.png");
// Boss
loadSprite("boss", "sprites/king_idle.png");
loadSprite("relic", "sprites/amulet_idle.png");

// ── 怪物配置表（fw/fh = SPD 源帧尺寸，确保裁剪正确）──
const MONSTERS = {
  rat:      { label: "巨鼠",   baseHp: 3, baseAtk: 1, score: 2,  minFloor: 1,  aura: false, shadowW: 11, fw: 16, fh: 15 },
  snake:    { label: "毒蛇",   baseHp: 3, baseAtk: 2, score: 3,  minFloor: 1,  aura: false, shadowW: 12, fw: 12, fh: 11 },
  slime:    { label: "史莱姆", baseHp: 4, baseAtk: 1, score: 3,  minFloor: 1,  aura: false, shadowW: 13, fw: 14, fh: 12 },
  gnoll:    { label: "豺狼人", baseHp: 5, baseAtk: 2, score: 4,  minFloor: 2,  aura: false, shadowW: 12, fw: 12, fh: 15 },
  skeleton: { label: "骷髅兵", baseHp: 4, baseAtk: 3, score: 5,  minFloor: 3,  aura: false, shadowW: 12, fw: 12, fh: 15 },
  bat:      { label: "蝙蝠",   baseHp: 3, baseAtk: 2, score: 3,  minFloor: 3,  aura: false, shadowW: 10, fw: 15, fh: 15 },
  crab:     { label: "巨蟹",   baseHp: 7, baseAtk: 2, score: 6,  minFloor: 4,  aura: false, shadowW: 14, fw: 16, fh: 16 },
  shooter:  { label: "魔眼",   baseHp: 4, baseAtk: 2, score: 6,  minFloor: 4,  aura: true,  shadowW: 13, fw: 16, fh: 18 },
  brute:    { label: "石像鬼", baseHp: 8, baseAtk: 3, score: 8,  minFloor: 7,  aura: false, shadowW: 16, fw: 12, fh: 16 },
  boss:     { label: "守护者", baseHp: 18, baseAtk: 4, score: 35, minFloor: 5,  aura: true,  shadowW: 18, fw: 16, fh: 16 },
};

function getMonsterPool(floor) {
  return Object.entries(MONSTERS)
    .filter(([, cfg]) => cfg.minFloor <= floor && cfg.minFloor !== 5)
    .map(([kind]) => kind);
}

function getDeathColor(kind) {
  const map = { rat: "#ff758d", snake: "#7ae582", slime: "#7ae582", gnoll: "#f59e0b",
    skeleton: "#cbd5e1", bat: "#c084fc", crab: "#f97316", shooter: "#c084fc",
    brute: "#a78bfa", boss: "#ff7da6" };
  return map[kind] || "#fff";
}

let spritesReady = false;
Promise.all(
  Object.values(spriteImages).map(
    (img) => new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; })
  )
).then(() => { spritesReady = true; });

const ui = {
  floor: document.getElementById("floorValue"),
  level: document.getElementById("levelValue"),
  xp: document.getElementById("xpValue"),
  climate: document.getElementById("climateValue"),
  turn: document.getElementById("turnValue"),
  hp: document.getElementById("hpValue"),
  attack: document.getElementById("attackValue"),
  armor: document.getElementById("armorValue"),
  combo: document.getElementById("comboValue"),
  status: document.getElementById("statusValue"),
  score: document.getElementById("scoreValue"),
  audioButton: document.getElementById("audioButton"),
  message: document.getElementById("messageBox"),
  upgradePanel: document.getElementById("upgradePanel"),
  restartButton: document.getElementById("restartButton"),
  menuButton: document.getElementById("menuButton"),
  startScreen: document.getElementById("startScreen"),
  profileNameInput: document.getElementById("profileNameInput"),
  newProfileButton: document.getElementById("newProfileButton"),
  refreshSavesButton: document.getElementById("refreshSavesButton"),
  saveList: document.getElementById("saveList"),
};

const CELL_SIZE = 48;
const GRID_SIZE = 14;
const BOARD_PADDING = 18;
const SPRITE_UNIT = 3;
const ATTACK_EFFECT_DURATION = 220;
const DESCENT_DURATION = 1400;
const SPAWN_POINTS = [
  { x: 1, y: 1 },
  { x: 12, y: 1 },
  { x: 1, y: 12 },
  { x: 12, y: 12 },
  { x: 7, y: 1 },
  { x: 7, y: 12 },
  { x: 1, y: 7 },
  { x: 12, y: 7 },
];

const COLORS = {
  floorA: "#17202b",
  floorB: "#111920",
  wall: "#334155",
  wallEdge: "#6b7c93",
  hero: "#58a6ff",
  heroEdge: "#c8e1ff",
  slime: "#ff6b6b",
  shooter: "#f59e0b",
  brute: "#a855f7",
  relic: "#7ae582",
  text: "#eef3f8",
  accent: "#ffd166",
  shadow: "rgba(0,0,0,0.28)",
};

const CLIMATES = {
  fog: {
    label: "迷雾区",
    floorA: "#141a22",
    floorB: "#0d1218",
    accent: "#c8d8e8",
    glow: "rgba(200, 210, 230, 0.12)",
    overlay: "rgba(180, 195, 215, 0.06)",
  },
  rain: {
    label: "暴雨区",
    floorA: "#111e28",
    floorB: "#0c161f",
    accent: "#6eb8dd",
    glow: "rgba(88, 180, 220, 0.14)",
    overlay: "rgba(50, 140, 200, 0.06)",
  },
  inferno: {
    label: "熔岩区",
    floorA: "#2a1a14",
    floorB: "#1f100d",
    accent: "#ff9966",
    glow: "rgba(255, 150, 80, 0.20)",
    overlay: "rgba(220, 100, 50, 0.10)",
  },
};

const SAVE_STORAGE_PREFIX = "pixel-dungeon-save:";

let currentProfileName = "";
let gameMode = "menu";

const audioState = {
  context: null,
  master: null,
  musicGain: null,
  enabled: false,
  musicStep: 0,
  musicTimer: null,
};

function ensureAudio() {
  if (!audioState.context) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    audioState.context = new AudioContextCtor();
    audioState.master = audioState.context.createGain();
    audioState.musicGain = audioState.context.createGain();
    audioState.master.gain.value = 0.48;
    audioState.musicGain.gain.value = 0.5;
    audioState.musicGain.connect(audioState.master);
    audioState.master.connect(audioState.context.destination);
  }

  if (audioState.context.state === "suspended") {
    audioState.context.resume();
  }

  return audioState.context;
}

function updateAudioButton() {
  if (!ui.audioButton) {
    return;
  }

  if (!audioState.enabled) {
    ui.audioButton.textContent = "声音：点击开启";
    ui.audioButton.classList.remove("is-active");
    ui.audioButton.classList.add("is-muted");
    return;
  }

  ui.audioButton.textContent = "声音：已开启";
  ui.audioButton.classList.add("is-active");
  ui.audioButton.classList.remove("is-muted");
}

function unlockAudio() {
  const context = ensureAudio();
  if (!context || audioState.enabled) {
    updateAudioButton();
    return;
  }

  audioState.enabled = true;
  startMusicLoop();
  playTone(262, 0.08, { type: "triangle", gain: 0.03 });
  playTone(392, 0.14, { type: "triangle", gain: 0.026, when: context.currentTime + 0.08 });
  updateAudioButton();
}

function playTone(frequency, duration, options = {}) {
  const context = ensureAudio();
  if (!context || !frequency) {
    return;
  }

  const {
    type = "square",
    gain = 0.035,
    when = context.currentTime,
    slideTo = null,
  } = options;

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), when + duration);
  }

  gainNode.gain.setValueAtTime(0.0001, when);
  gainNode.gain.exponentialRampToValueAtTime(gain, when + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(gainNode);
  gainNode.connect(audioState.master);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.02);
}

function playSound(name) {
  const context = ensureAudio();
  if (!context || !audioState.enabled) {
    return;
  }

  const now = context.currentTime;
  if (name === "move") {
    playTone(240, 0.06, { type: "square", gain: 0.04, when: now });
    playTone(320, 0.05, { type: "triangle", gain: 0.028, when: now + 0.03 });
  } else if (name === "wait") {
    playTone(180, 0.09, { type: "triangle", gain: 0.032, when: now });
  } else if (name === "attack") {
    // 金属撞击裂声 + 低频冲击体 + 泛音余震
    playTone(720, 0.05, { type: "square", gain: 0.065, when: now, slideTo: 180 });
    playTone(100, 0.08, { type: "sine", gain: 0.08, when: now, slideTo: 50 });
    playTone(1440, 0.09, { type: "triangle", gain: 0.028, when: now + 0.008, slideTo: 860 });
  } else if (name === "hit") {
    // 受击闷响 + 低频震荡
    playTone(220, 0.09, { type: "sawtooth", gain: 0.06, when: now, slideTo: 90 });
    playTone(75, 0.14, { type: "sine", gain: 0.07, when: now, slideTo: 42 });
  } else if (name === "kill") {
    playTone(330, 0.08, { type: "square", gain: 0.055, when: now });
    playTone(494, 0.12, { type: "triangle", gain: 0.04, when: now + 0.05 });
  } else if (name === "levelUp") {
    playTone(392, 0.1, { type: "triangle", gain: 0.04, when: now });
    playTone(523, 0.12, { type: "triangle", gain: 0.045, when: now + 0.08 });
    playTone(659, 0.16, { type: "triangle", gain: 0.04, when: now + 0.16 });
  } else if (name === "descend") {
    // 风啸扫落（双层向下滑音）
    playTone(520, 0.55, { type: "sawtooth", gain: 0.048, when: now, slideTo: 48 });
    playTone(1300, 0.65, { type: "sine", gain: 0.032, when: now, slideTo: 110 });
    // 坠落途中穿越楼层的冲击节拍
    playTone(145, 0.09, { type: "sawtooth", gain: 0.038, when: now + 0.28, slideTo: 78 });
    playTone(130, 0.09, { type: "sawtooth", gain: 0.032, when: now + 0.55, slideTo: 68 });
    playTone(115, 0.09, { type: "sawtooth", gain: 0.026, when: now + 0.82, slideTo: 58 });
    playTone(100, 0.09, { type: "sawtooth", gain: 0.020, when: now + 1.09, slideTo: 50 });
    // 落地重击：低频轰鸣 + 中高频脉冲
    playTone(68, 0.28, { type: "sawtooth", gain: 0.09, when: now + 1.28, slideTo: 32 });
    playTone(320, 0.07, { type: "square", gain: 0.055, when: now + 1.29 });
    playTone(640, 0.05, { type: "triangle", gain: 0.038, when: now + 1.29 });
  } else if (name === "boss") {
    playTone(110, 0.16, { type: "square", gain: 0.06, when: now });
    playTone(146, 0.16, { type: "square", gain: 0.05, when: now + 0.1 });
    playTone(196, 0.26, { type: "sawtooth", gain: 0.045, when: now + 0.22 });
  } else if (name === "bossHit") {
    // 重锤碾压：超低频闷响 + 中频裂声 + 高频崩裂
    playTone(58, 0.24, { type: "sawtooth", gain: 0.085, when: now, slideTo: 28 });
    playTone(175, 0.15, { type: "square", gain: 0.055, when: now, slideTo: 65 });
    playTone(520, 0.06, { type: "triangle", gain: 0.038, when: now + 0.012 });
  }
}

function startMusicLoop() {
  if (audioState.musicTimer) {
    return;
  }

  // A小调 16步音序器：主旋律 / 低音线 / 和弦衬垫
  const leadPattern = [440, null, 523, null, 659, null, 587, 523, 494, null, 440, null, 392, 440, null, 329];
  const bassPattern = [110, null, null, 110, null, null, 130, null, 110, null, null, 165, null, null, 130, null];
  // 每4步切换一次和弦：Am → G → F → Em
  const chordPattern = [
    [220, 261, 329], null, null, null,
    [196, 247, 294], null, null, null,
    [174, 220, 261], null, null, null,
    [164, 196, 247], null, null, null,
  ];

  audioState.musicTimer = window.setInterval(() => {
    if (!audioState.enabled) {
      return;
    }

    const context = ensureAudio();
    if (!context) {
      return;
    }

    const step = audioState.musicStep % 16;
    const when = context.currentTime + 0.02;

    // 主旋律：三角波 + 高八度正弦泛音
    const lead = leadPattern[step];
    if (lead) {
      playTone(lead, 0.19, { type: "triangle", gain: 0.034, when });
      playTone(lead * 2, 0.07, { type: "sine", gain: 0.013, when: when + 0.025 });
    }

    // 低音线：温暖正弦 + 下八度方波
    const bass = bassPattern[step];
    if (bass) {
      const osc = context.createOscillator();
      const gn = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(bass, when);
      osc.frequency.linearRampToValueAtTime(bass * 1.003, when + 0.18);
      gn.gain.setValueAtTime(0.0001, when);
      gn.gain.exponentialRampToValueAtTime(0.034, when + 0.05);
      gn.gain.exponentialRampToValueAtTime(0.0001, when + 0.38);
      osc.connect(gn);
      gn.connect(audioState.musicGain);
      osc.start(when);
      osc.stop(when + 0.42);

      const osc2 = context.createOscillator();
      const gn2 = context.createGain();
      osc2.type = "square";
      osc2.frequency.setValueAtTime(bass / 2, when);
      gn2.gain.setValueAtTime(0.0001, when);
      gn2.gain.exponentialRampToValueAtTime(0.016, when + 0.04);
      gn2.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
      osc2.connect(gn2);
      gn2.connect(audioState.musicGain);
      osc2.start(when);
      osc2.stop(when + 0.26);
    }

    // 和弦衬垫：多正弦持续音
    const chord = chordPattern[step];
    if (chord) {
      chord.forEach((freq) => {
        const osc = context.createOscillator();
        const gn = context.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, when);
        gn.gain.setValueAtTime(0.0001, when);
        gn.gain.exponentialRampToValueAtTime(0.015, when + 0.1);
        gn.gain.linearRampToValueAtTime(0.008, when + 0.7);
        gn.gain.exponentialRampToValueAtTime(0.0001, when + 0.95);
        osc.connect(gn);
        gn.connect(audioState.musicGain);
        osc.start(when);
        osc.stop(when + 1.0);
      });
    }

    // 第 4/8/12 步加入噪声镲片（非主拍律动感）
    if (step === 4 || step === 8 || step === 12) {
      const buf = context.createBuffer(1, Math.floor(context.sampleRate * 0.045), context.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = context.createBufferSource();
      const gn = context.createGain();
      const filter = context.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 5000;
      src.buffer = buf;
      gn.gain.setValueAtTime(0.022, when);
      gn.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
      src.connect(filter);
      filter.connect(gn);
      gn.connect(audioState.musicGain);
      src.start(when);
    }

    audioState.musicStep += 1;
  }, 240);
}

const upgradePool = [
  {
    id: "attackBoost",
    title: "强力打击",
    description: "攻击力 +1。",
    apply: (state) => {
      state.player.attack += 1;
      spawnParticles(state.player.x, state.player.y, "#ffd166", 10, "burst");
      pushMessage(state, "你的剑刃更加锋利，攻击力上升。");
    },
  },
  {
    id: "maxHpBoost",
    title: "精灵祝福",
    description: "最大生命 +4，并恢复 4 点生命。",
    apply: (state) => {
      state.player.maxHp += 4;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 4);
      spawnParticles(state.player.x, state.player.y, "#7ae582", 8, "burst");
      pushMessage(state, "铠甲附魔完成，你更能扛了。");
    },
  },
  {
    id: "armorBoost",
    title: "龙鳞护甲",
    description: "护甲 +2。",
    apply: (state) => {
      state.player.armor += 2;
      spawnParticles(state.player.x, state.player.y, "#6fa8dc", 8, "burst");
      pushMessage(state, "一片龙鳞附着在你的铠甲上。");
    },
  },
  {
    id: "pulse",
    title: "魔力脉冲",
    description: "获得脉冲技能：每 5 回合自动对周围敌人造成 2 点伤害。",
    apply: (state) => {
      state.player.pulse = true;
      spawnParticles(state.player.x, state.player.y, "#c084fc", 12, "burst");
      pushMessage(state, "地牢的魔力在你周围涌动，脉冲开始充能。");
    },
  },
  {
    id: "vampire",
    title: "生命汲取",
    description: "每击败一个敌人回复 1 点生命。",
    apply: (state) => {
      state.player.lifeSteal = true;
      spawnParticles(state.player.x, state.player.y, "#ff4060", 10, "burst");
      pushMessage(state, "你的武器渴望着敌人的灵魂，每次击杀都能汲取生命。");
    },
  },
  {
    id: "dash",
    title: "疾风步",
    description: "直线移动时可额外前进一格。",
    apply: (state) => {
      state.player.dash = true;
      spawnParticles(state.player.x, state.player.y, "#7bdff2", 10, "burst");
      pushMessage(state, "疾风之靴赋予你速度，移动更灵活。");
    },
  },
];

function createInitialState() {
  const walls = [];
  for (let x = 0; x < GRID_SIZE; x += 1) {
    walls.push({ x, y: 0 });
    walls.push({ x, y: GRID_SIZE - 1 });
  }
  for (let y = 1; y < GRID_SIZE - 1; y += 1) {
    walls.push({ x: 0, y });
    walls.push({ x: GRID_SIZE - 1, y });
  }

  const innerWalls = [
    { x: 4, y: 4 },
    { x: 5, y: 4 },
    { x: 8, y: 4 },
    { x: 9, y: 4 },
    { x: 4, y: 9 },
    { x: 5, y: 9 },
    { x: 8, y: 9 },
    { x: 9, y: 9 },
    { x: 4, y: 5 },
    { x: 9, y: 8 },
  ];

  const blockedTiles = [
    ...walls,
    ...innerWalls,
    { x: 7, y: 7 },
    { x: 7, y: 10 },
  ];

  return {
    turn: 1,
    floor: 1,
    climate: createClimateForFloor(1),
    level: 1,
    xp: 0,
    xpToNext: 1,
    score: 0,
    killCount: 0,
    pendingLevelUps: 0,
    pendingDescent: false,
    descending: false,
    descentStartedAt: 0,
    awaitingUpgrade: false,
    gameOver: false,
    messages: ["地牢深处传来低沉的咆哮。保持走位，别让怪物包围你。"],
    upgradeChoices: [],
    walls: [...walls, ...innerWalls],
    bushes: createBushes(blockedTiles, 20),
    relics: [{ x: 7, y: 7, value: 2 }],
    player: {
      x: 7,
      y: 10,
      facing: 1,
      hp: 14,
      maxHp: 14,
      attack: 3,
      armor: 0,
      combo: 0,
      pulse: false,
      lifeSteal: false,
      dash: false,
    },
    enemies: [],
    attackEffects: [],
    particles: [],
    shakeUntil: 0,
    shakeIntensity: 0,
    mouseGridX: -1,
    mouseGridY: -1,
  };
}

function makeEmptySaveMeta(name) {
  return {
    name,
    updatedAt: Date.now(),
    version: 1,
  };
}

function normalizeState(savedState) {
  const fresh = createInitialState();
  const stateSource = savedState && typeof savedState === "object" ? savedState : {};
  const playerSource = stateSource.player && typeof stateSource.player === "object" ? stateSource.player : {};

  return {
    ...fresh,
    ...stateSource,
    player: {
      ...fresh.player,
      ...playerSource,
    },
    messages: Array.isArray(stateSource.messages) && stateSource.messages.length
      ? [...stateSource.messages]
      : [...fresh.messages],
    upgradeChoices: Array.isArray(stateSource.upgradeChoices) ? [...stateSource.upgradeChoices] : [],
    walls: Array.isArray(stateSource.walls) ? [...stateSource.walls] : [...fresh.walls],
    bushes: Array.isArray(stateSource.bushes) ? [...stateSource.bushes] : [...fresh.bushes],
    relics: Array.isArray(stateSource.relics) ? [...stateSource.relics] : [...fresh.relics],
    enemies: Array.isArray(stateSource.enemies) ? [...stateSource.enemies] : [],
    attackEffects: Array.isArray(stateSource.attackEffects) ? [...stateSource.attackEffects] : [],
    particles: Array.isArray(stateSource.particles) ? [...stateSource.particles] : [],
    turn: Number.isFinite(stateSource.turn) ? stateSource.turn : fresh.turn,
    floor: Number.isFinite(stateSource.floor) ? stateSource.floor : fresh.floor,
    climate: stateSource.climate || fresh.climate,
    level: Number.isFinite(stateSource.level) ? stateSource.level : fresh.level,
    xp: Number.isFinite(stateSource.xp) ? stateSource.xp : fresh.xp,
    xpToNext: Number.isFinite(stateSource.xpToNext) ? stateSource.xpToNext : fresh.xpToNext,
    score: Number.isFinite(stateSource.score) ? stateSource.score : fresh.score,
    killCount: Number.isFinite(stateSource.killCount) ? stateSource.killCount : fresh.killCount,
    pendingLevelUps: Number.isFinite(stateSource.pendingLevelUps) ? stateSource.pendingLevelUps : fresh.pendingLevelUps,
    pendingDescent: Boolean(stateSource.pendingDescent),
    descending: Boolean(stateSource.descending),
    descentStartedAt: Number.isFinite(stateSource.descentStartedAt) ? stateSource.descentStartedAt : fresh.descentStartedAt,
    awaitingUpgrade: Boolean(stateSource.awaitingUpgrade),
    gameOver: Boolean(stateSource.gameOver),
    shakeUntil: Number.isFinite(stateSource.shakeUntil) ? stateSource.shakeUntil : fresh.shakeUntil,
    shakeIntensity: Number.isFinite(stateSource.shakeIntensity) ? stateSource.shakeIntensity : fresh.shakeIntensity,
    mouseGridX: Number.isFinite(stateSource.mouseGridX) ? stateSource.mouseGridX : fresh.mouseGridX,
    mouseGridY: Number.isFinite(stateSource.mouseGridY) ? stateSource.mouseGridY : fresh.mouseGridY,
  };
}

function getStorageKey(profileName) {
  return `${SAVE_STORAGE_PREFIX}${encodeURIComponent(profileName)}`;
}

function safeReadStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function safeWriteStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

function safeRemoveStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}

function listProfiles() {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(SAVE_STORAGE_PREFIX)) {
        continue;
      }

      const payload = safeReadStorage(key);
      if (!payload || !payload.meta || !payload.state) {
        continue;
      }

      entries.push({
        key,
        name: payload.meta.name || decodeURIComponent(key.slice(SAVE_STORAGE_PREFIX.length)),
        meta: payload.meta,
        state: payload.state,
      });
    }
  } catch (error) {
    return [];
  }

  return entries.sort((a, b) => (b.meta.updatedAt || 0) - (a.meta.updatedAt || 0));
}

function formatSaveTime(timestamp) {
  if (!timestamp) {
    return "未记录";
  }

  const date = new Date(timestamp);
  return `${date.toLocaleDateString("zh-CN")} ${date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function describeSave(state) {
  const status = state.gameOver ? "已失败" : state.awaitingUpgrade ? "强化中" : state.descending ? "坠落中" : "进行中";
  return `楼层 ${state.floor} · 等级 ${state.level} · 得分 ${state.score} · ${status}`;
}

function renderSaveList() {
  if (!ui.saveList) {
    return;
  }

  const profiles = listProfiles();
  ui.saveList.innerHTML = "";

  if (!profiles.length) {
    const empty = document.createElement("div");
    empty.className = "save-slot save-slot--empty";
    empty.textContent = "当前没有档案。输入名字后点击“新建档案”开始第一段冒险。";
    ui.saveList.appendChild(empty);
    return;
  }

  profiles.forEach((profile) => {
    const slot = document.createElement("article");
    slot.className = "save-slot";

    const meta = document.createElement("div");
    meta.className = "save-slot__meta";

    const name = document.createElement("div");
    name.className = "save-slot__name";
    name.textContent = profile.name;

    const details = document.createElement("div");
    details.className = "save-slot__details";
    details.textContent = `${describeSave(profile.state)} · 最后保存 ${formatSaveTime(profile.meta.updatedAt)}`;

    meta.appendChild(name);
    meta.appendChild(details);

    const actions = document.createElement("div");
    actions.className = "save-slot__actions";

    const loadButton = document.createElement("button");
    loadButton.className = "primary-button";
    loadButton.textContent = "继续";
    loadButton.addEventListener("click", () => loadProfile(profile.name));

    const deleteButton = document.createElement("button");
    deleteButton.className = "ghost-button";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", () => removeProfile(profile.name));

    actions.appendChild(loadButton);
    actions.appendChild(deleteButton);
    slot.appendChild(meta);
    slot.appendChild(actions);
    ui.saveList.appendChild(slot);
  });
}

function syncMenuState() {
  if (ui.startScreen) {
    ui.startScreen.setAttribute("aria-hidden", gameMode === "playing" ? "true" : "false");
  }

  document.body.classList.toggle("menu-open", gameMode === "menu");
  if (ui.menuButton) {
    ui.menuButton.textContent = gameMode === "menu" ? "返回游戏" : "档案";
  }
}

function getProfileNameFromInput() {
  const value = ui.profileNameInput ? ui.profileNameInput.value.trim() : "";
  return value.replace(/[\\/:*?"<>|]/g, "").slice(0, 16);
}

function saveCurrentProfile() {
  if (!currentProfileName || gameMode !== "playing") {
    return;
  }

  const payload = {
    meta: makeEmptySaveMeta(currentProfileName),
    state,
  };

  safeWriteStorage(getStorageKey(currentProfileName), payload);
  renderSaveList();
}

function loadProfile(profileName) {
  const payload = safeReadStorage(getStorageKey(profileName));
  if (!payload || !payload.state) {
    return;
  }

  currentProfileName = payload.meta?.name || profileName;
  state = normalizeState(payload.state);
  gameMode = "playing";
  syncMenuState();
  unlockAudio();
  updateAudioButton();
  render();
}

function removeProfile(profileName) {
  const key = getStorageKey(profileName);
  safeRemoveStorage(key);
  renderSaveList();

  if (currentProfileName === profileName) {
    currentProfileName = "";
  }
}

function createNewProfile(profileName, overwrite = true) {
  const normalizedName = profileName || "冒险者";
  if (!overwrite && safeReadStorage(getStorageKey(normalizedName))) {
    return false;
  }

  currentProfileName = normalizedName;
  unlockAudio();
  state = createInitialState();
  setupFloorState(state);
  spawnEnemiesForFloor(state, 1);
  gameMode = "playing";
  syncMenuState();
  saveCurrentProfile();
  render();
  return true;
}

function openMenu() {
  gameMode = "menu";
  syncMenuState();
  renderSaveList();
  render();
  ui.profileNameInput?.focus();
}

function isGameplayLocked() {
  return gameMode !== "playing";
}

let state = createInitialState();

function pushMessage(currentState, message) {
  currentState.messages.unshift(message);
  currentState.messages = currentState.messages.slice(0, 4);
}

function isWall(x, y) {
  return state.walls.some((wall) => wall.x === x && wall.y === y);
}

function getEnemyAt(x, y) {
  return state.enemies.find((enemy) => enemy.x === x && enemy.y === y);
}

function isRelicAt(x, y) {
  return state.relics.find((relic) => relic.x === x && relic.y === y);
}

function isBushAt(x, y) {
  return state.bushes.some((bush) => bush.x === x && bush.y === y);
}

function isPlayerHidden() {
  return isBushAt(state.player.x, state.player.y);
}

function isEnemyHidden(enemy) {
  return enemy.kind !== "boss" && isBushAt(enemy.x, enemy.y);
}

function createClimateForFloor(floor) {
  const keys = Object.keys(CLIMATES);
  return keys[(floor - 1) % keys.length];
}

function getBaseBlockedTiles() {
  return [
    ...state.walls,
    { x: 7, y: 7 },
    { x: 7, y: 10 },
  ];
}

function createBushes(blockedTiles, count) {
  const blocked = new Set(blockedTiles.map((tile) => `${tile.x},${tile.y}`));
  const bushes = [];
  const openTiles = [];

  for (let y = 1; y < GRID_SIZE - 1; y += 1) {
    for (let x = 1; x < GRID_SIZE - 1; x += 1) {
      if (!blocked.has(`${x},${y}`)) {
        openTiles.push({ x, y });
      }
    }
  }

  const shuffled = openTiles.sort(() => Math.random() - 0.5);
  for (const tile of shuffled) {
    if (bushes.length >= count) {
      break;
    }

    const neighbors = bushes.filter(
      (bush) => Math.abs(bush.x - tile.x) <= 1 && Math.abs(bush.y - tile.y) <= 1
    ).length;

    if (neighbors > 3) {
      continue;
    }

    bushes.push(tile);
  }

  return bushes;
}

function isOccupied(x, y) {
  if (state.player.x === x && state.player.y === y) {
    return true;
  }

  return (
    isWall(x, y) ||
    Boolean(getEnemyAt(x, y)) ||
    Boolean(isRelicAt(x, y))
  );
}

function randomFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function setupFloorState(currentState) {
  currentState.player.x = 7;
  currentState.player.y = 10;
  currentState.player.facing = 1;
  currentState.climate = createClimateForFloor(currentState.floor);
  currentState.relics = [{ x: 7, y: 7, value: 2 }];
  currentState.attackEffects = [];
  currentState.particles = [];
  currentState.enemies = [];
  currentState.bushes = createBushes(getBaseBlockedTiles(), 18 + (currentState.floor % 4));
}

function createBoss(floor) {
  const cfg = MONSTERS.boss;
  const hp = cfg.baseHp + Math.floor(floor * 1.5);
  return {
    kind: "boss",
    x: 7,
    y: 3,
    hp,
    maxHp: hp,
    attack: cfg.baseAtk + Math.floor(floor / 5),
    cooldown: 0,
    score: cfg.score,
  };
}

function spawnEnemiesForFloor(currentState, floor = currentState.floor) {
  if (floor % 5 === 0) {
    currentState.bushes = currentState.bushes.filter((bush) => Math.abs(bush.x - 7) + Math.abs(bush.y - 3) > 2);
    currentState.enemies.push(createBoss(floor));
    return;
  }

  const spawnCount = Math.min(1 + Math.floor((floor - 1) / 3), 6);
  const tries = [...SPAWN_POINTS].sort(() => Math.random() - 0.5);
  let spawned = 0;

  while (tries.length > 0 && spawned < spawnCount) {
    const spawn = tries.pop();
    const tooClose =
      Math.abs(spawn.x - currentState.player.x) + Math.abs(spawn.y - currentState.player.y) < 5;

    if (tooClose || isOccupied(spawn.x, spawn.y)) {
      continue;
    }

    currentState.enemies.push(createEnemyByTurn(currentState.floor, spawn.x, spawn.y));
    spawned += 1;
  }
}

function createEnemyByTurn(floor, x, y) {
  const pool = getMonsterPool(floor);
  // 按权重选择：近期解锁的新型怪物权重更高
  const weighted = [];
  pool.forEach((kind) => {
    const cfg = MONSTERS[kind];
    const weight = cfg.minFloor >= floor - 1 ? 3 : cfg.minFloor >= floor - 2 ? 2 : 1;
    for (let i = 0; i < weight; i++) weighted.push(kind);
  });

  const kind = randomFrom(weighted);
  const cfg = MONSTERS[kind];
  const hp = cfg.baseHp + Math.floor(floor / 10);
  return {
    kind,
    x,
    y,
    hp,
    maxHp: hp,
    attack: cfg.baseAtk + Math.floor(floor / 12),
    score: cfg.score,
  };
}

function spawnParticles(gridX, gridY, color, count, style = "burst") {
  const { px, py } = cellToPixel(gridX, gridY);
  const cx = px + 22;
  const cy = py + 20;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
    const speed = style === "burst" ? 1.2 + Math.random() * 2.5 : 0.5 + Math.random() * 1.2;
    const particle = {
      x: cx + (Math.random() - 0.5) * 8,
      y: cy + (Math.random() - 0.5) * 8,
      size: style === "burst" ? 2 + Math.random() * 3 : 1.5 + Math.random() * 2,
      color,
      life: 1.0,
      decay: 0.015 + Math.random() * 0.02,
    };
    if (style === "drain") {
      // 向玩家位置飞去
      const { px: hpx, py: hpy } = cellToPixel(state.player.x, state.player.y);
      const hcx = hpx + 22;
      const hcy = hpy + 20;
      const dx = hcx - cx;
      const dy = hcy - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const drainSpeed = 1.2 + Math.random() * 2;
      particle.vx = (dx / dist) * drainSpeed * (0.8 + Math.random() * 0.4);
      particle.vy = (dy / dist) * drainSpeed * (0.8 + Math.random() * 0.4);
      particle.size = 1.5 + Math.random() * 2;
      particle.decay = 0.02 + Math.random() * 0.025;
    } else {
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed - (style === "rise" ? 1.5 : 0);
    }
    state.particles.push(particle);
  }
}

function triggerShake(intensity, durationMs) {
  state.shakeUntil = performance.now() + durationMs;
  state.shakeIntensity = Math.max(state.shakeIntensity, intensity);
}

function createAttackEffect(sourceX, sourceY, targetX, targetY, type) {
  return {
    sourceX,
    sourceY,
    targetX,
    targetY,
    type,
    createdAt: performance.now(),
  };
}

function awardXp(amount) {
  state.xp += amount;

  while (state.xp >= state.xpToNext) {
    state.xp -= state.xpToNext;
    state.level += 1;
    state.xpToNext = Math.max(1, Math.floor(state.level * 0.8));
    state.pendingLevelUps += 1;
    // 每升一级，血量上限和攻击力各 +1
    state.player.maxHp += 1;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
    state.player.attack += 1;
    playSound("levelUp");
    pushMessage(state, `升到 ${state.level} 级！攻击 +1、生命上限 +1，并可选择一项强化。`);
  }
}

function startDescent() {
  if (state.descending || state.gameOver) {
    return;
  }

  state.pendingDescent = false;
  state.descending = true;
  state.descentStartedAt = performance.now();
  playSound("descend");
  pushMessage(state, `第 ${state.floor} 层已清空，你坠入更深的地牢。`);

  window.setTimeout(() => {
    if (state.gameOver) {
      return;
    }

    state.descending = false;
    state.floor += 1;
    setupFloorState(state);
    spawnEnemiesForFloor(state, state.floor);
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2);

    if (state.floor % 5 === 0) {
      playSound("boss");
      pushMessage(state, `第 ${state.floor} 层被 ${CLIMATES[state.climate].label} 笼罩，守护者出现了。`);
    } else {
      pushMessage(state, `你坠入第 ${state.floor} 层，这里弥漫着${CLIMATES[state.climate].label}。`);
    }

    render();
  }, DESCENT_DURATION);
}

function collectRelic() {
  const relic = isRelicAt(state.player.x, state.player.y);

  if (!relic) {
    return;
  }

  state.score += relic.value * 5;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + relic.value * 2);
  state.relics = state.relics.filter((item) => item !== relic);
  pushMessage(state, `你拾起了灵魂宝石，恢复 ${relic.value * 2} 点生命。`);
}

function attackEnemy(enemy, bonusDamage = 0) {
  const damage = state.player.attack + bonusDamage;
  enemy.hp -= damage;
  playSound(enemy.kind === "boss" ? "bossHit" : "attack");
  state.attackEffects.push(
    createAttackEffect(state.player.x, state.player.y, enemy.x, enemy.y, "player")
  );
  spawnParticles(enemy.x, enemy.y, "#ffd166", 6, "burst");

  if (enemy.hp <= 0) {
    state.killCount += 1;
    state.player.combo += 1;
    awardXp(1);
    state.score += 10 + enemy.score + state.player.combo * 2;
    spawnParticles(enemy.x, enemy.y, getDeathColor(enemy.kind), enemy.kind === "boss" ? 28 : 14, "burst");
    state.enemies = state.enemies.filter((entry) => entry !== enemy);
    playSound("kill");
    pushMessage(state, `击败 ${enemyLabel(enemy.kind)}，连斩来到 ${state.player.combo}。`);

    if (state.player.lifeSteal) {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
      // 生命汲取动画：从敌人位置飞向玩家的红色粒子
      spawnParticles(enemy.x, enemy.y, "#ff4060", 5, "drain");
    }

    if (Math.random() > 0.8 && state.relics.length < 3) {
      state.relics.push({ x: enemy.x, y: enemy.y, value: 2 });
    }

    return;
  }

  pushMessage(state, `你对 ${enemyLabel(enemy.kind)} 造成 ${damage} 点伤害。`);
}

function performPlayerAttack(enemy) {
  if (isGameplayLocked() || state.awaitingUpgrade || state.gameOver || state.descending) {
    return false;
  }

  if (!enemy || isEnemyHidden(enemy)) {
    return false;
  }

  const distance = Math.abs(enemy.x - state.player.x) + Math.abs(enemy.y - state.player.y);
  if (distance !== 1) {
    pushMessage(state, "目标离你太远，近战攻击需要贴近一格。");
    render();
    return false;
  }

  if (enemy.x !== state.player.x) {
    state.player.facing = Math.sign(enemy.x - state.player.x);
  }

  attackEnemy(enemy);
  endTurn();
  return true;
}

function enemyLabel(kind) {
  return MONSTERS[kind] ? MONSTERS[kind].label : kind;
}

function movePlayer(dx, dy) {
  if (isGameplayLocked() || state.awaitingUpgrade || state.gameOver || state.descending) {
    return;
  }

  const wasHidden = isPlayerHidden();
  if (dx !== 0) {
    state.player.facing = Math.sign(dx);
  }

  let targetX = state.player.x + dx;
  let targetY = state.player.y + dy;

  if (state.player.dash && Math.random() > 0.55) {
    const dashX = targetX + dx;
    const dashY = targetY + dy;

    if (!isWall(dashX, dashY)) {
      targetX = dashX;
      targetY = dashY;
    }
  }

  const targetEnemy = getEnemyAt(targetX, targetY);
  if (targetEnemy) {
    pushMessage(state, "敌人挡在前面，靠近后请用鼠标点击它发动攻击。");
    render();
    return;
  }

  if (isWall(targetX, targetY)) {
    pushMessage(state, "你撞上了墙壁，这回合白忙了。");
    state.player.combo = 0;
    playSound("hit");
    endTurn();
    return;
  }

  state.player.x = targetX;
  state.player.y = targetY;
  playSound("move");
  collectRelic();
  const hiddenNow = isPlayerHidden();
  if (!wasHidden && hiddenNow) {
    pushMessage(state, "你躲进阴影之中，敌人暂时失去你的踪迹。");
  } else if (wasHidden && !hiddenNow) {
    pushMessage(state, "你走出阴影，重新暴露在视野中。");
  } else if (hiddenNow) {
    pushMessage(state, "你贴着阴影边缘移动，仍然保持隐藏。");
  } else {
    pushMessage(state, "你在地牢中挪动位置，重新拉开距离。");
  }
  endTurn();
}

function waitTurn() {
  if (isGameplayLocked() || state.awaitingUpgrade || state.gameOver || state.descending) {
    return;
  }

  playSound("wait");
  pushMessage(
    state,
    isPlayerHidden() ? "你屏住呼吸藏在阴影中，等待敌人错身而过。" : "你原地观察敌人的动向。"
  );
  state.player.combo = 0;
  endTurn();
}

function triggerPulseIfNeeded() {
  if (!state.player.pulse || state.turn % 5 !== 0) {
    return;
  }

  const nearby = state.enemies.filter(
    (enemy) =>
      Math.abs(enemy.x - state.player.x) <= 1 && Math.abs(enemy.y - state.player.y) <= 1
  );

  if (!nearby.length) {
    return;
  }

  nearby.forEach((enemy) => attackEnemy(enemy, 2));
  pushMessage(state, "脉冲扫荡触发，周围敌人受到额外冲击。");
}

function moveEnemies() {
  for (const enemy of [...state.enemies]) {
    const seesPlayer = !isPlayerHidden();
    const dx = Math.sign(state.player.x - enemy.x);
    const dy = Math.sign(state.player.y - enemy.y);
    const distance = Math.abs(state.player.x - enemy.x) + Math.abs(state.player.y - enemy.y);

    if (distance === 1 && seesPlayer) {
      state.attackEffects.push(createAttackEffect(enemy.x, enemy.y, state.player.x, state.player.y, "enemy"));
      damagePlayer(enemy.attack, `${enemyLabel(enemy.kind)} 在你身边发动攻击。`);
      continue;
    }

    // 远程攻击：魔眼
    if (enemy.kind === "shooter" && seesPlayer && distance <= 4 && (enemy.cooldown || 0) === 0) {
      state.attackEffects.push(createAttackEffect(enemy.x, enemy.y, state.player.x, state.player.y, "enemy"));
      damagePlayer(enemy.attack, `${enemyLabel(enemy.kind)} 发射脉冲光束。`);
      enemy.cooldown = 2;
      continue;
    }

    // Boss 远程震击
    if (enemy.kind === "boss" && seesPlayer && distance <= 3 && (enemy.cooldown || 0) === 0) {
      state.attackEffects.push(createAttackEffect(enemy.x, enemy.y, state.player.x, state.player.y, "enemy"));
      damagePlayer(enemy.attack + 1, `${enemyLabel(enemy.kind)} 挥出重锤震击。`);
      enemy.cooldown = 2;
      continue;
    }

    // 冷却递减
    if (enemy.cooldown > 0) {
      enemy.cooldown -= 1;
    }

    // 蝙蝠随机乱飞
    if (enemy.kind === "bat") {
      const rdirs = [
        { x: enemy.x + 1, y: enemy.y }, { x: enemy.x - 1, y: enemy.y },
        { x: enemy.x, y: enemy.y + 1 }, { x: enemy.x, y: enemy.y - 1 },
      ].sort(() => Math.random() - 0.5);
      for (const option of rdirs) {
        if (!isWall(option.x, option.y) && !getEnemyAt(option.x, option.y) && !isRelicAt(option.x, option.y)) {
          enemy.x = option.x;
          enemy.y = option.y;
          break;
        }
      }
      continue;
    }

    // 蛇：概率跳跃 2 格
    const moveDirs = seesPlayer
      ? [{ x: enemy.x + dx, y: enemy.y }, { x: enemy.x, y: enemy.y + dy }].sort(() => Math.random() - 0.5)
      : [{ x: enemy.x + 1, y: enemy.y }, { x: enemy.x - 1, y: enemy.y },
         { x: enemy.x, y: enemy.y + 1 }, { x: enemy.x, y: enemy.y - 1 }].sort(() => Math.random() - 0.5);

    let moved = false;
    const steps = (enemy.kind === "snake" && seesPlayer && Math.random() > 0.6) ? 2 : 1;

    for (const option of moveDirs) {
      const fx = enemy.x + Math.sign(option.x - enemy.x) * steps;
      const fy = enemy.y + Math.sign(option.y - enemy.y) * steps;
      const blocked = isWall(fx, fy) || getEnemyAt(fx, fy) || isRelicAt(fx, fy)
        || (fx === state.player.x && fy === state.player.y && !isPlayerHidden());
      if (!blocked && fx >= 0 && fx < GRID_SIZE && fy >= 0 && fy < GRID_SIZE) {
        enemy.x = fx;
        enemy.y = fy;
        moved = true;
        break;
      }
    }

    if (!moved) {
      for (const option of moveDirs) {
        const s1x = enemy.x + Math.sign(option.x - enemy.x);
        const s1y = enemy.y + Math.sign(option.y - enemy.y);
        const blocked = isWall(s1x, s1y) || getEnemyAt(s1x, s1y) || isRelicAt(s1x, s1y)
          || (s1x === state.player.x && s1y === state.player.y && !isPlayerHidden());
        if (!blocked && s1x >= 0 && s1x < GRID_SIZE && s1y >= 0 && s1y < GRID_SIZE) {
          enemy.x = s1x;
          enemy.y = s1y;
          break;
        }
      }
    }
  }
}

function damagePlayer(amount, reason) {
  const actual = Math.max(0, amount - state.player.armor);
  state.player.hp -= actual;
  state.player.combo = 0;
  playSound("hit");
  triggerShake(actual >= 3 ? 6 : 3.5, actual >= 3 ? 280 : 160);
  spawnParticles(state.player.x, state.player.y, "#ff6b6b", 8, "burst");
  pushMessage(state, `${reason} 你失去 ${actual} 点生命。`);

  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    pushMessage(state, "你被击败了。按右上角按钮可以重新开始冒险。");
  }
}

function prepareUpgradeChoices() {
  const pool = [...upgradePool].sort(() => Math.random() - 0.5);
  state.awaitingUpgrade = true;
  state.upgradeChoices = pool.slice(0, 3);
  pushMessage(state, `等级提升，选择一项力量强化。`);
}

function applyUpgrade(id) {
  if (!state.awaitingUpgrade) {
    return;
  }

  const choice = state.upgradeChoices.find((entry) => entry.id === id);
  if (!choice) {
    return;
  }

  choice.apply(state);
  state.awaitingUpgrade = false;
  state.upgradeChoices = [];
  state.pendingLevelUps = Math.max(0, state.pendingLevelUps - 1);

  if (state.pendingLevelUps > 0) {
    prepareUpgradeChoices();
    render();
    return;
  }

  if (state.pendingDescent || state.enemies.length === 0) {
    startDescent();
    render();
    return;
  }

  render();
}

function endTurn() {
  if (isGameplayLocked() || state.awaitingUpgrade || state.descending) {
    render();
    return;
  }

  triggerPulseIfNeeded();
  moveEnemies();

  if (state.gameOver) {
    render();
    return;
  }

  state.turn += 1;
  state.score += 4;

  // 每 5 回合自动恢复 1 点生命
  if (state.turn % 5 === 0 && state.player.hp < state.player.maxHp) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
    pushMessage(state, "时间流逝，你恢复 1 点生命。");
  }

  if (state.pendingLevelUps > 0) {
    prepareUpgradeChoices();
    if (state.enemies.length === 0) {
      state.pendingDescent = true;
    }
  } else if (state.enemies.length === 0) {
    startDescent();
  }

  if (state.relics.length === 0 && state.turn % 3 === 0) {
    placeRelic();
  }

  render();
}

function placeRelic() {
  const openTiles = [];

  for (let y = 1; y < GRID_SIZE - 1; y += 1) {
    for (let x = 1; x < GRID_SIZE - 1; x += 1) {
      if (!isOccupied(x, y)) {
        openTiles.push({ x, y });
      }
    }
  }

  if (!openTiles.length) {
    return;
  }

  const tile = randomFrom(openTiles);
  state.relics.push({ x: tile.x, y: tile.y, value: 2 });
}

function updateUi() {
  ui.floor.textContent = String(state.floor);
  ui.level.textContent = String(state.level);
  ui.xp.textContent = `${state.xp} / ${state.xpToNext}`;
  ui.climate.textContent = CLIMATES[state.climate].label;
  ui.turn.textContent = String(state.turn);
  ui.hp.textContent = `${state.player.hp} / ${state.player.maxHp}`;
  ui.attack.textContent = String(state.player.attack);
  ui.armor.textContent = String(state.player.armor);
  ui.combo.textContent = String(state.player.combo);
  ui.status.textContent = isPlayerHidden() ? "隐藏" : "显形";
  ui.score.textContent = String(state.score);
  ui.message.textContent = state.messages[0];
  updateAudioButton();

  if (!state.awaitingUpgrade) {
    ui.upgradePanel.innerHTML =
      '<p class="muted">击败敌人获得经验。升级需求按等级递增，清空楼层后会坠入下一层。</p>';
    return;
  }

  ui.upgradePanel.innerHTML = "";
  state.upgradeChoices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "upgrade-button";
    button.innerHTML = `<strong>${choice.title}</strong><span>${choice.description}</span>`;
    button.addEventListener("click", () => applyUpgrade(choice.id));
    ui.upgradePanel.appendChild(button);
  });
}

function drawPixelRect(x, y, color, inset = 7) {
  const px = BOARD_PADDING + x * CELL_SIZE;
  const py = BOARD_PADDING + y * CELL_SIZE;
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(px + 4, py + 4, CELL_SIZE - inset, CELL_SIZE - inset);
  ctx.fillStyle = color;
  ctx.fillRect(px, py, CELL_SIZE - inset, CELL_SIZE - inset);
}

function drawSpritePattern(pattern, palette, px, py, options = {}) {
  const { scale = SPRITE_UNIT, mirror = false } = options;

  for (let row = 0; row < pattern.length; row += 1) {
    const line = pattern[row];
    for (let col = 0; col < line.length; col += 1) {
      const key = line[col];
      if (key === "." || !palette[key]) {
        continue;
      }

      const drawCol = mirror ? line.length - 1 - col : col;
      ctx.fillStyle = palette[key];
      ctx.fillRect(px + drawCol * scale, py + row * scale, scale, scale);
    }
  }
}

function drawShadow(cx, cy, width, height, alpha = 0.24) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, width, height, 0, 0, Math.PI * 2);
  ctx.fill();
}

function cellToPixel(x, y) {
  return {
    px: BOARD_PADDING + x * CELL_SIZE,
    py: BOARD_PADDING + y * CELL_SIZE,
  };
}

function getPulse(time, speed = 1, amount = 1) {
  return Math.sin(time / speed) * amount;
}

// SPRITES 已替换为 PNG 精灵图（SPD 素材）
// 使用 spriteImages 对象和 spriteFrames 数据
// 旧的 pattern/palette 系统已废弃，所有绘制函数改用 drawImage


function drawFloorTile(x, y, time) {
  const { px, py } = cellToPixel(x, y);
  const shimmer = ((x * 17 + y * 11 + Math.floor(time / 220)) % 9) / 28;
  const climate = CLIMATES[state.climate];
  const w = CELL_SIZE - 4;
  const h = CELL_SIZE - 4;

  // SPD 风格地牢底板 - 交错石板
  ctx.fillStyle = (x + y) % 2 === 0 ? climate.floorA : climate.floorB;
  ctx.fillRect(px, py, w, h);

  // 石板纹理线
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(px, py, w, 1);
  ctx.fillRect(px, py + 1, 1, h - 2);

  // 底部暗边
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(px, py + h - 2, w, 2);

  // 石板接缝十字线（随机变化）
  if ((x * 3 + y * 7) % 5 === 0) {
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(px + w / 2, py + 4, 1, h - 8);
    ctx.fillRect(px + 4, py + h / 2, w - 8, 1);
  }

  // 气候装饰
  if (state.climate === "fog") {
    ctx.fillStyle = `rgba(200, 210, 230, ${0.015 + shimmer * 0.02})`;
    ctx.fillRect(px + 8, py + 14, 14, 2);
    ctx.fillRect(px + 16, py + 28, 8, 1);
  } else if (state.climate === "rain") {
    ctx.fillStyle = `rgba(100, 180, 220, ${0.03 + shimmer * 0.03})`;
    ctx.fillRect(px + 20 + (x % 4) * 4, py + 10 + (y % 5) * 6, 3, 1);
    ctx.fillRect(px + 10 + (y % 3) * 5, py + 24 + (x % 4) * 4, 2, 1);
  } else if (state.climate === "inferno") {
    ctx.fillStyle = `rgba(255, 140, 60, ${0.03 + shimmer * 0.04})`;
    ctx.beginPath();
    ctx.moveTo(px + 8, py + 16);
    ctx.lineTo(px + 14, py + 12);
    ctx.lineTo(px + 18, py + 16);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillRect(px + 16, py + 26, 2, 2);
  }
}

function drawClimateOverlay(time) {
  const climate = CLIMATES[state.climate];

  if (state.climate === "fog") {
    // ── 浓雾：多层漂浮雾团 + 整体雾罩 ──
    for (let layer = 0; layer < 4; layer += 1) {
      const layerAlpha = 0.04 + layer * 0.02;
      const speed = 0.008 + layer * 0.005;
      for (let i = 0; i < 5; i += 1) {
        const x = ((time * speed + i * 240 + layer * 80) % (canvas.width + 340)) - 170;
        const y = 50 + layer * 150 + i * 30 + Math.sin(time / (600 + layer * 300) + i * 1.7) * 25;
        const w = 120 + layer * 35 + Math.sin(time / 500 + i) * 20;
        const h = 30 + layer * 12;
        ctx.fillStyle = `rgba(200, 210, 230, ${layerAlpha})`;
        ctx.beginPath();
        ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 雾中微光扫描
    for (let i = 0; i < 3; i += 1) {
      const sx = 50 + i * 220 + ((time * 0.015 + i * 70) % 620);
      const sy = 50 + Math.sin(time / 900 + i) * 180;
      const beam = ctx.createLinearGradient(sx, sy - 40, sx + 60, sy + 40);
      beam.addColorStop(0, "rgba(255,255,255,0)");
      beam.addColorStop(0.5, "rgba(230,240,255,0.05)");
      beam.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = beam;
      ctx.fillRect(sx - 10, sy - 40, 80, 80);
    }
    // 整体雾罩
    const fogGrad = ctx.createRadialGradient(336, 250, 60, 336, 250, 320);
    fogGrad.addColorStop(0, "rgba(210, 220, 240, 0.06)");
    fogGrad.addColorStop(0.4, "rgba(190, 200, 220, 0.04)");
    fogGrad.addColorStop(1, "rgba(10, 16, 22, 0)");
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

  } else if (state.climate === "rain") {
    // ── 暴雨：密集斜雨 + 水面涟漪 + 锯齿闪电 + 屏幕闪白 ──
    const W = canvas.width, H = canvas.height;
    const rainAlpha = 0.7 + Math.min(0.3, (state.turn || 0) * 0.02);

    // ─ 闪电周期 ─
    // 用低频正弦模拟间歇性放电：每 3~7 秒一次
    const boltPeriod = 4200; // ms
    const boltPhase = (time % boltPeriod) / boltPeriod; // 0..1 within a period
    const boltActive = boltPhase < 0.12; // flash lasts ~12% of period ≈ 500ms

    // ─ 雨滴（两层：远景细密 + 近景粗疏，带斜风） ─
    const windSlant = 2.5; // 雨滴 x 偏移
    for (let layer = 0; layer < 2; layer += 1) {
      const count = layer === 0 ? 60 : 28;
      const spd = layer === 0 ? 0.07 : 0.14;
      const alpha = layer === 0 ? 0.22 : 0.4;
      const len = layer === 0 ? 9 : 14;
      for (let i = 0; i < count; i += 1) {
        // 用质数间隔 + 速度 制造不重复感
        const rx = ((i * 47 + layer * 19 + time * spd * 17) % (W + 40)) - 20;
        const ry = ((i * 41 + layer * 13 + time * spd * 24) % (H + 40)) - 20;
        const bright = boltActive ? Math.min(1, alpha * 2.2) : alpha;
        ctx.strokeStyle = `rgba(180, 215, 240, ${bright})`;
        ctx.lineWidth = layer === 0 ? 1 : 1.5;
        ctx.beginPath();
        ctx.moveTo(rx - len * 0.15, ry - len);
        ctx.lineTo(rx + len * 0.15, ry);
        ctx.stroke();
      }
    }

    // ─ 地面涟漪 ─
    for (let i = 0; i < 22; i += 1) {
      const rpx = (i * 37.7 + time * 0.003) % W;
      const rpy = (i * 43.3 + time * 0.007) % H;
      const rip = (time * 0.002 + i * 0.73) % 6.28;
      if (rip < 1.8) {
        const t = rip / 1.8;
        const r = 2 + t * 7;
        const a = 0.14 * (1 - t);
        ctx.strokeStyle = `rgba(140, 210, 250, ${boltActive ? a * 2 : a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rpx, rpy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ══════════════════════════════════════
    // 闪电主体
    // ══════════════════════════════════════
    if (boltActive) {
      // 用 (time, period) 哈希出稳定的随机起点和分支参数，避免每帧乱跳
      const hash = (a, b) => { let h = (a * 37 + b * 101) | 0; h = ((h >> 5) ^ h) * 1274126177; return (h ^ (h >> 15)) & 0x7fffffff; };

      // 每周期生成一条主闪电
      const boltIndex = Math.floor(time / boltPeriod);
      const startX = 80 + (hash(boltIndex, 1) % 520);  // top entry
      const segCount = 9 + (hash(boltIndex, 2) % 7);    // 9~15 段锯齿
      const branchCount = 2 + (hash(boltIndex, 3) % 3);  // 2~4 个分支
      const boltProgress = boltPhase / 0.12;             // 0→1 within flash
      const boltAlpha = boltProgress < 0.08 ? 1 : Math.max(0, 1 - (boltProgress - 0.08) / 0.92);

      // ─ 生成主链顶点 ─
      const pts = [];
      pts.push({ x: startX, y: -4 }); // 从屏幕上方进入
      for (let s = 1; s <= segCount; s += 1) {
        const ty = (s / segCount) * H;
        const spread = 12 + Math.random() * 22;
        const px = pts[s - 1].x + (Math.random() - 0.5) * spread * 2;
        pts.push({ x: px, y: ty });
      }
      pts.push({ x: pts[segCount].x + (Math.random() - 0.5) * 30, y: H + 4 }); // 穿出屏幕

      // ─ 外层辉光（宽、低透明度） ─
      ctx.save();
      ctx.globalAlpha = boltAlpha * 0.45;
      ctx.strokeStyle = "#a0d0ff";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let s = 1; s < pts.length; s += 1) {
        ctx.lineTo(pts[s].x, pts[s].y);
      }
      ctx.stroke();

      // ─ 中层亮光 ─
      ctx.globalAlpha = boltAlpha * 0.7;
      ctx.strokeStyle = "#e0f0ff";
      ctx.lineWidth = 4;
      ctx.stroke();

      // ─ 核心白线 ─
      ctx.globalAlpha = boltAlpha;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // ─ 分支 ─
      for (let b = 0; b < branchCount; b += 1) {
        const attachIdx = 3 + (hash(boltIndex, 10 + b) % (segCount - 3)); // 在主链中段分叉
        const bx = pts[attachIdx].x;
        const by = pts[attachIdx].y;
        const angle = (hash(boltIndex, 20 + b) % 120 - 60) * Math.PI / 180; // ±60°
        const brLen = 30 + (hash(boltIndex, 30 + b) % 65); // 分支长度
        const brSegs = 3 + (hash(boltIndex, 40 + b) % 4); // 3~6 小段
        const bxEnd = bx + Math.cos(angle) * brLen;
        const byEnd = by + Math.sin(angle) * brLen + brLen * 0.3; // 略向下

        const bpts = [{ x: bx, y: by }];
        for (let s = 1; s <= brSegs; s += 1) {
          const t = s / brSegs;
          const sx = bx + (bxEnd - bx) * t + (Math.random() - 0.5) * 20;
          const sy = by + (byEnd - by) * t + (Math.random() - 0.5) * 16;
          bpts.push({ x: sx, y: sy });
        }

        // 分支辉光
        ctx.save();
        ctx.globalAlpha = boltAlpha * 0.35;
        ctx.strokeStyle = "#b0d8ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bpts[0].x, bpts[0].y);
        for (let s = 1; s < bpts.length; s += 1) ctx.lineTo(bpts[s].x, bpts[s].y);
        ctx.stroke();

        // 分支核心
        ctx.globalAlpha = boltAlpha * 0.6;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // ─ 全屏闪白（短暂） ─
      const flashAlpha = boltAlpha * (boltProgress < 0.04 ? boltProgress / 0.04 * 0.3 : Math.max(0, 0.3 * (1 - (boltProgress - 0.04) / 0.96)));
      ctx.fillStyle = `rgba(200, 220, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);

      // ─ 云层高光 ─
      const cloudGrad = ctx.createRadialGradient(startX, 0, 10, startX, H * 0.3, W * 0.4);
      cloudGrad.addColorStop(0, `rgba(180, 210, 255, ${boltAlpha * 0.15})`);
      cloudGrad.addColorStop(1, "rgba(180, 210, 255, 0)");
      ctx.fillStyle = cloudGrad;
      ctx.fillRect(0, 0, W, H);
    }

    // ─ 暗色雨幕叠加（闪电时提亮） ─
    const rainOverlay = ctx.createLinearGradient(0, 0, 0, H);
    const overlayDark = boltActive ? 0.08 : 0.22;
    rainOverlay.addColorStop(0, `rgba(15, 30, 50, ${overlayDark})`);
    rainOverlay.addColorStop(0.5, `rgba(20, 40, 60, ${overlayDark * 0.5})`);
    rainOverlay.addColorStop(1, `rgba(10, 20, 35, ${overlayDark + 0.03})`);
    ctx.fillStyle = rainOverlay;
    ctx.fillRect(0, 0, W, H);

  } else if (state.climate === "inferno") {
    // ── 熔岩：浮游余烬 + 上升火星 + 熔岩裂纹 + 热浪 ──
    // 上升火星
    for (let i = 0; i < 35; i += 1) {
      const ex = (i * 23 + Math.sin(i * 0.7) * 18) % canvas.width;
      const ey = (i * 31 + time * 0.04 + ((i * 7) % 60)) % (canvas.height + 15) - 15;
      const size = 1 + (i % 3);
      const emberAlpha = 0.3 + Math.sin(time * 0.01 + i) * 0.2;
      ctx.fillStyle = i % 5 === 0
        ? `rgba(255, 200, 50, ${emberAlpha})`
        : `rgba(255, 100, 30, ${emberAlpha * 0.8})`;
      ctx.fillRect(ex, ey, size, size);
      // 拖尾
      ctx.fillStyle = `rgba(255, 150, 50, ${emberAlpha * 0.3})`;
      ctx.fillRect(ex - 1, ey - 3, size + 2, 4);
    }
    // 大型浮游余烬
    for (let i = 0; i < 10; i += 1) {
      const fx = (i * 67 + time * 0.025 + ((i * 13) % 80)) % canvas.width;
      const fy = (i * 73 + Math.sin(time * 0.012 + i) * 25 + ((i * 11) % 50)) % canvas.height;
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 5 + (i % 3) * 2);
      grad.addColorStop(0, "rgba(255, 220, 100, 0.35)");
      grad.addColorStop(0.5, "rgba(255, 120, 40, 0.18)");
      grad.addColorStop(1, "rgba(255, 60, 10, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx, fy, 7 + (i % 3) * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // 熔岩裂纹（地板发光裂缝）
    for (let i = 0; i < 8; i += 1) {
      const cx = (i * 82 + 41) % canvas.width;
      const cy = (i * 91 + 55) % canvas.height;
      const crackLen = 12 + Math.sin(time * 0.005 + i) * 4;
      ctx.strokeStyle = `rgba(255, 140, 50, ${0.2 + Math.sin(time * 0.01 + i) * 0.1})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - crackLen * 0.3, cy - crackLen * 0.5);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + crackLen * 0.5, cy + crackLen * 0.3);
      ctx.stroke();
      // 裂缝发光点
      ctx.fillStyle = `rgba(255, 180, 60, ${0.15 + Math.sin(time * 0.015 + i) * 0.1})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // 热浪扭曲效果（边缘辉光）
    const edgeGlow = ctx.createLinearGradient(0, 0, canvas.width, 0);
    edgeGlow.addColorStop(0, "rgba(255, 140, 60, 0.18)");
    edgeGlow.addColorStop(0.1, "rgba(255, 100, 40, 0.06)");
    edgeGlow.addColorStop(0.5, "rgba(255, 80, 30, 0)");
    edgeGlow.addColorStop(0.9, "rgba(255, 100, 40, 0.06)");
    edgeGlow.addColorStop(1, "rgba(255, 140, 60, 0.18)");
    ctx.fillStyle = edgeGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 底部熔岩光
    const lavaGlow = ctx.createLinearGradient(0, canvas.height * 0.7, 0, canvas.height);
    lavaGlow.addColorStop(0, "rgba(255, 80, 20, 0)");
    lavaGlow.addColorStop(0.6, "rgba(255, 60, 15, 0.08)");
    lavaGlow.addColorStop(1, "rgba(255, 40, 10, 0.15)");
    ctx.fillStyle = lavaGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const vignette = ctx.createRadialGradient(336, 336, 120, 336, 336, 460);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.18)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawWallTile(x, y) {
  const { px, py } = cellToPixel(x, y);
  const w = CELL_SIZE - 4;
  const h = CELL_SIZE - 4;

  // SPD 风格石墙底色
  ctx.fillStyle = "#333344";
  ctx.fillRect(px, py, w, h);

  // 不规则石块
  const brickH = 8;
  const mortar = 2;
  const rows = Math.floor(h / (brickH + mortar));
  for (let row = 0; row < rows; row += 1) {
    const by = py + row * (brickH + mortar);
    const offset = row % 2 === 0 ? 0 : 7;

    for (let bx = px + offset - 13; bx < px + w + 5; bx += 13 + mortar) {
      const clampL = Math.max(px, bx);
      const clampR = Math.min(px + w, bx + 13);
      if (clampR <= clampL) continue;

      const shade = ((x * 7 + y * 13 + row * 3) % 5);
      const base = shade === 0 ? "#4a4a5a" : shade === 1 ? "#3e3e4e" : shade === 2 ? "#444454" : shade === 3 ? "#484858" : "#404050";
      ctx.fillStyle = base;
      ctx.fillRect(clampL, by, clampR - clampL, brickH);

      // 石块顶高光
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(clampL, by, clampR - clampL, 1);

      // 石块底阴影
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(clampL, by + brickH - 2, clampR - clampL, 2);
    }
  }

  // 顶部暗色装饰线
  ctx.fillStyle = "#555566";
  ctx.fillRect(px, py, w, 2);

  // 墙壁边缘投影
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(px, py + h - 3, w, 3);
  ctx.fillRect(px + w - 3, py + 2, 3, h - 5);
}

function drawHealthPips(entity, x, y, color) {
  const maxPips = Math.min(6, Math.max(1, entity.hp));
  const count = Math.min(maxPips, entity.hp);
  const startX = x + 4;
  const top = y + CELL_SIZE - 8;

  for (let i = 0; i < maxPips; i += 1) {
    ctx.fillStyle = i < count ? color : "rgba(255,255,255,0.1)";
    ctx.fillRect(startX + i * 6, top, 4, 3);
  }
}

function drawHealthBar(x, y, width, hp, maxHp, fillColor) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  ctx.fillStyle = "rgba(8, 13, 20, 0.82)";
  ctx.fillRect(x, y, width, 7);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(x + 1, y + 1, width - 2, 5);
  ctx.fillStyle = fillColor;
  ctx.fillRect(x + 1, y + 1, (width - 2) * ratio, 5);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 6);
}

function drawAttackEffects(time) {
  state.attackEffects = state.attackEffects.filter(
    (effect) => time - effect.createdAt < ATTACK_EFFECT_DURATION
  );

  state.attackEffects.forEach((effect) => {
    const age = (time - effect.createdAt) / ATTACK_EFFECT_DURATION;
    const start = cellToPixel(effect.sourceX, effect.sourceY);
    const end = cellToPixel(effect.targetX, effect.targetY);
    const startX = start.px + 22;
    const startY = start.py + 20;
    const endX = end.px + 22;
    const endY = end.py + 20;
    const color =
      effect.type === "player"
        ? `rgba(255, 209, 102, ${1 - age})`
        : `rgba(255, 107, 107, ${1 - age})`;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(endX, endY, 4 + age * 7, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawRelic(relic, time) {
  const { px, py } = cellToPixel(relic.x, relic.y);
  const bob = getPulse(time + relic.x * 60 + relic.y * 40, 260, 2);
  drawShadow(px + 22, py + 34, 10, 5, 0.18);
  const img = spriteImages.relic;
  if (img && img.complete) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, px + 10, py + 10 + bob, 22, 22);
  }
}

function drawBushPatch(bush, time, frontLayer = false) {
  const { px, py } = cellToPixel(bush.x, bush.y);
  const sway = getPulse(time + bush.x * 70 + bush.y * 90, 320, 1.6);
  const backColor = frontLayer ? "#63bf71" : "#397b4d";
  const mainColor = frontLayer ? "#8fe388" : "#56a966";
  const highColor = frontLayer ? "#c9ffb8" : "#77c96f";
  const baseY = py + (frontLayer ? 22 : 18);

  ctx.fillStyle = backColor;
  ctx.fillRect(px + 4 + sway, baseY, 6, 18);
  ctx.fillRect(px + 14, baseY - 4, 6, 22);
  ctx.fillRect(px + 25 - sway, baseY, 6, 18);
  ctx.fillRect(px + 34, baseY - 2, 5, 20);

  ctx.fillStyle = mainColor;
  ctx.fillRect(px + 8 + sway, baseY - 6, 6, 18);
  ctx.fillRect(px + 18, baseY - 10, 7, 26);
  ctx.fillRect(px + 28 - sway, baseY - 7, 6, 19);

  ctx.fillStyle = highColor;
  ctx.fillRect(px + 12, baseY - 12, 3, 11);
  ctx.fillRect(px + 23, baseY - 15, 3, 13);
  ctx.fillRect(px + 31, baseY - 11, 3, 10);
}

function drawEnemy(enemy, time) {
  const { px, py } = cellToPixel(enemy.x, enemy.y);
  const hidden = isEnemyHidden(enemy);
  const cfg = MONSTERS[enemy.kind] || {};
  const fw = cfg.fw || 16;
  const fh = cfg.fh || 15;
  if (hidden) return;
  const faceRight = state.player.x >= enemy.x;
  const isLarge = enemy.kind === "boss" || enemy.kind === "brute" || enemy.kind === "crab";
  const isFloating = enemy.kind === "shooter" || enemy.kind === "bat";
  const isSmall = enemy.kind === "rat" || enemy.kind === "snake" || enemy.kind === "slime";

  const bobBase = enemy.kind === "slime" ? 210 : isFloating ? 300 : enemy.kind === "boss" ? 180 : 240;
  const bob = getPulse(time + enemy.x * 90 + enemy.y * 35, bobBase, isFloating ? 2.5 : 2);
  const shadowW = cfg.shadowW || (isLarge ? 16 : isSmall ? 10 : 13);
  const shadowOY = 1 + Math.round(fh * 0.4);

  drawShadow(px + 22, py + 36, shadowW, 5, 0.22);

  // 敌人光环
  if (cfg.aura) {
    const auraColor = enemy.kind === "shooter" ? "rgba(180,60,255,0.3)" : "rgba(245,158,11,0.35)";
    const auraR = (isLarge ? 18 : 15) + getPulse(time, 120, isLarge ? 1.5 : 1.2);
    ctx.strokeStyle = auraColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px + 22, py + 20 + bob, auraR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── SPD 精灵绘制 ──
  // 根据实际帧尺寸按比例放大，保持宽高比
  const img = spriteImages[enemy.kind];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false;
    // 目标尺寸：最大高度 ~34px（boss 40），宽度等比缩放
    const maxH = enemy.kind === "boss" ? 40 : isLarge ? 34 : isSmall ? 22 : 28;
    const scale = maxH / fh;
    const dw = Math.round(fw * scale);
    const dh = Math.round(fh * scale);
    const ox = px + Math.round((CELL_SIZE - 4 - dw) / 2);
    const oy = py + (enemy.kind === "boss" ? 0 : isLarge ? 4 : 8) + bob;
    if (faceRight) {
      ctx.drawImage(img, ox, oy, dw, dh);
    } else {
      ctx.save();
      ctx.translate(ox + dw, oy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      ctx.restore();
    }
  }

  // boss/brute 顶部高光
  if (isLarge) {
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(px + 8, py + 3 + bob, enemy.kind === "boss" ? 26 : 22, 2);
  }

  const hpColor = enemy.kind === "boss" ? "#ff7da6" : enemy.kind === "brute" ? "#d8c2ff" : "#ffd166";
  drawHealthBar(px + (enemy.kind === "boss" ? 4 : 7), py - 2, enemy.kind === "boss" ? 36 : 30, enemy.hp, enemy.maxHp ?? enemy.hp, hpColor);
}

function drawHero(time) {
  const { px, py } = cellToPixel(state.player.x, state.player.y);
  const hidden = isPlayerHidden();
  const bob = getPulse(time + state.turn * 80, 240, 1.5);
  const aura = 11 + getPulse(time, 180, 1.5);
  const mirror = state.player.facing < 0;
  // Hero avatar from avatars.png: 24×32 (SPD SurfaceScene.java WIDTH=24, HEIGHT=32)
  const HERO_FW = 24, HERO_FH = 32;
  const heroH = 36;                          // max display height
  const heroW = Math.round(HERO_FW * (heroH / HERO_FH)); // 27px wide

  // ── 冲刺残影（疾风步）──
  if (state.player.dash && state.player.combo > 0) {
    ctx.save();
    ctx.globalAlpha = 0.2 + Math.sin(time * 0.01) * 0.08;
    const img = spriteImages.hero;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      const ox = px + Math.round((CELL_SIZE - 4 - heroW) / 2) - state.player.facing * 5;
      const oy = py + 2 + bob + 2;
      if (mirror) {
        ctx.save();
        ctx.translate(ox + heroW, oy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, heroW, heroH);
        ctx.restore();
      } else {
        ctx.drawImage(img, ox, oy, heroW, heroH);
      }
    }
    ctx.restore();
  }

  drawShadow(px + 22, py + 37, 14, 6, 0.2);

  // ── 护盾光环（龙鳞护甲）──
  if (state.player.armor > 0) {
    const shieldAlpha = 0.15 + state.player.armor * 0.06 + getPulse(time, 160, 0.05);
    const shieldR = 22 + state.player.armor + getPulse(time, 150, 2);
    ctx.strokeStyle = `rgba(100, 160, 220, ${shieldAlpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px + 22, py + 20 + bob, shieldR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── 英雄光环 ──
  ctx.strokeStyle = "rgba(88, 166, 255, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px + 22, py + 21 + bob, aura, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  if (hidden) {
    ctx.globalAlpha = 0.72;
  }

  // ── SPD avatars.png 战士 24×32 ──
  const img = spriteImages.hero;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false;
    const ox = px + Math.round((CELL_SIZE - 4 - heroW) / 2);
    const oy = py + 2 + bob;
    if (mirror) {
      ctx.save();
      ctx.translate(ox + heroW, oy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, heroW, heroH);
      ctx.restore();
    } else {
      ctx.drawImage(img, ox, oy, heroW, heroH);
    }
  }

  // ── 武器发光（攻击力提升）──
  if (state.player.attack > 2) {
    const extraAtk = state.player.attack - 2;
    const glowAlpha = 0.15 + extraAtk * 0.08 + getPulse(time, 100, 0.08);
    const swordX = mirror ? px + 6 : px + 34;
    const swordY = py + 22 + bob;
    const glowGrad = ctx.createRadialGradient(swordX, swordY, 1, swordX, swordY, 8 + extraAtk * 2);
    glowGrad.addColorStop(0, `rgba(255, 255, 220, ${glowAlpha})`);
    glowGrad.addColorStop(0.5, `rgba(255, 209, 102, ${glowAlpha * 0.6})`);
    glowGrad.addColorStop(1, "rgba(255, 209, 102, 0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(swordX - 12, swordY - 12, 24, 24);
  }

  // ── 生命汲取血色光环 ──
  if (state.player.lifeSteal) {
    const siphonR = 16 + getPulse(time, 120, 2);
    const siphonAlpha = 0.12 + getPulse(time, 140, 0.06);
    const siphonGrad = ctx.createRadialGradient(px + 22, py + 20 + bob, 6, px + 22, py + 20 + bob, siphonR);
    siphonGrad.addColorStop(0, "rgba(200, 30, 30, 0)");
    siphonGrad.addColorStop(0.7, `rgba(200, 30, 30, ${siphonAlpha})`);
    siphonGrad.addColorStop(1, "rgba(200, 30, 30, 0)");
    ctx.fillStyle = siphonGrad;
    ctx.fillRect(px, py - 5, 48, 48);
  }

  ctx.restore();

  // ── 魔力脉冲环（脉冲扫荡）──
  if (state.player.pulse) {
    const pulsePhase = state.turn % 5;
    const pulseAge = pulsePhase / 5;
    const pulseR = 17 + pulseAge * 10;
    const pulseAlpha = 0.35 * (1 - pulseAge) + getPulse(time, 90, 0.1);
    ctx.strokeStyle = `rgba(123, 223, 242, ${pulseAlpha})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px + 22, py + 20 + bob, pulseR, 0, Math.PI * 2);
    ctx.stroke();
    // 外环
    ctx.strokeStyle = `rgba(123, 223, 242, ${pulseAlpha * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px + 22, py + 20 + bob, pulseR + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawHealthBar(px + 7, py - 2, 30, state.player.hp, state.player.maxHp, "#7bdff2");
}

function drawHeroGlow(time) {
  const { px, py } = cellToPixel(state.player.x, state.player.y);
  const cx = px + 22;
  const cy = py + 20;
  const pulse = 0.12 + getPulse(time, 200, 0.04);
  const radius = 110 + getPulse(time, 180, 15);

  const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius);
  glow.addColorStop(0, `rgba(123, 223, 242, ${pulse * 1.2})`);
  glow.addColorStop(0.3, `rgba(88, 166, 255, ${pulse * 0.6})`);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

function drawCellHighlight(time) {
  const gx = state.mouseGridX;
  const gy = state.mouseGridY;
  if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return;
  if (isWall(gx, gy)) return;
  if (state.awaitingUpgrade || state.gameOver || state.descending) return;

  const { px, py } = cellToPixel(gx, gy);
  const w = CELL_SIZE - 4;
  const enemy = getEnemyAt(gx, gy);
  const dist = Math.abs(gx - state.player.x) + Math.abs(gy - state.player.y);
  const pulse = 0.3 + getPulse(time, 150, 0.15);

  if (enemy && dist === 1 && !isEnemyHidden(enemy)) {
    // 可攻击目标：红色闪烁边框
    ctx.strokeStyle = `rgba(255, 107, 107, ${pulse + 0.3})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
    // 十字准星
    const mid = w / 2;
    ctx.strokeStyle = `rgba(255, 107, 107, ${pulse * 0.6})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + mid - 6, py + mid); ctx.lineTo(px + mid - 2, py + mid);
    ctx.moveTo(px + mid + 2, py + mid); ctx.lineTo(px + mid + 6, py + mid);
    ctx.moveTo(px + mid, py + mid - 6); ctx.lineTo(px + mid, py + mid - 2);
    ctx.moveTo(px + mid, py + mid + 2); ctx.lineTo(px + mid, py + mid + 6);
    ctx.stroke();
  } else {
    // 普通悬停：淡白色边框
    ctx.strokeStyle = `rgba(255, 255, 255, ${pulse * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 1.5, py + 1.5, w - 3, w - 3);
  }
}

function updateAndDrawParticles(time) {
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const p of state.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.04; // gravity
    p.life -= p.decay;
    if (p.life <= 0) continue;
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.ceil(p.size), Math.ceil(p.size));
  }
  ctx.globalAlpha = 1;
}

function drawScanlines() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
  for (let y = 0; y < canvas.height; y += 3) {
    ctx.fillRect(0, y, canvas.width, 1);
  }
}

function drawBoard(time = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── 屏幕抖动 ──
  ctx.save();
  if (time < state.shakeUntil) {
    const remaining = (state.shakeUntil - time) / 280;
    const intensity = state.shakeIntensity * remaining;
    const sx = (Math.random() - 0.5) * intensity * 2;
    const sy = (Math.random() - 0.5) * intensity * 2;
    ctx.translate(sx, sy);
  } else {
    state.shakeIntensity = 0;
  }

  ctx.fillStyle = "#091017";
  ctx.fillRect(-4, -4, canvas.width + 8, canvas.height + 8);

  // ── 地板 ──
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      drawFloorTile(x, y, time);
    }
  }

  // ── 墙壁 ──
  state.walls.forEach((wall) => drawWallTile(wall.x, wall.y));

  // ── 草丛（底层）──
  state.bushes.forEach((bush) => drawBushPatch(bush, time, false));

  // ── 遗物 ──
  state.relics.forEach((relic) => drawRelic(relic, time));

  // ── 英雄火炬光照 ──
  drawHeroGlow(time);

  // ── 气候叠加层 ──
  drawClimateOverlay(time);

  // ── 敌人 ──
  state.enemies.forEach((enemy) => drawEnemy(enemy, time));

  // ── 英雄 ──
  drawHero(time);

  // ── 攻击特效线 ──
  drawAttackEffects(time);

  // ── 粒子 ──
  updateAndDrawParticles(time);

  // ── 草丛（顶层）──
  state.bushes.forEach((bush) => {
    const occupantHere =
      (state.player.x === bush.x && state.player.y === bush.y) ||
      state.enemies.some((enemy) => enemy.x === bush.x && enemy.y === bush.y);
    drawBushPatch(bush, time + 80, occupantHere);
  });

  // ── 鼠标悬停高亮 ──
  drawCellHighlight(time);

  // ── 底部状态文字 ──
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, canvas.height - 36, canvas.width, 36);
  ctx.fillStyle = COLORS.text;
  ctx.font = '15px "Courier New", monospace';
  ctx.fillText(`Turn ${state.turn}`, 22, canvas.height - 14);
  ctx.fillStyle = "#7bdff2";
  ctx.fillText(`Floor ${state.floor}`, 122, canvas.height - 14);
  ctx.fillStyle = COLORS.accent;
  ctx.fillText(`Lv ${state.level}`, 222, canvas.height - 14);
  ctx.fillStyle = CLIMATES[state.climate].accent;
  ctx.fillText(CLIMATES[state.climate].label, 302, canvas.height - 14);

  if (isPlayerHidden() && !state.gameOver) {
    ctx.fillStyle = "#7ae582";
    ctx.font = 'bold 16px "Courier New", monospace';
    const hiddenText = "● HIDDEN";
    ctx.fillText(hiddenText, canvas.width - ctx.measureText(hiddenText).width - 18, canvas.height - 14);
  }

  // ── CRT 扫描线 ──
  drawScanlines();

  // ── 坠落动画 ──
  if (state.descending) {
    const age = Math.min(1, (time - state.descentStartedAt) / DESCENT_DURATION);
    // 暗幕
    ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + age * 0.55})`;
    ctx.fillRect(-4, -4, canvas.width + 8, canvas.height + 8);
    // 坠落漩涡
    const pcx = BOARD_PADDING + state.player.x * CELL_SIZE + 22;
    const pcy = BOARD_PADDING + state.player.y * CELL_SIZE + 22;
    const vortexR = 18 + age * 140;
    const vortex = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, vortexR);
    vortex.addColorStop(0, "rgba(5, 8, 12, 0.95)");
    vortex.addColorStop(0.6, "rgba(10, 18, 28, 0.7)");
    vortex.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = vortex;
    ctx.fillRect(pcx - vortexR, pcy - vortexR, vortexR * 2, vortexR * 2);
    // 漩涡边缘光环
    ctx.strokeStyle = `rgba(123, 223, 242, ${(1 - age) * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pcx, pcy, vortexR * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    // 坠落碎片粒子
    for (let i = 0; i < 8; i += 1) {
      const a = (time * 0.003 + i * 0.785) % (Math.PI * 2);
      const r = vortexR * (0.3 + (1 - age) * 0.5) + Math.sin(time * 0.01 + i) * 6;
      const fx = pcx + Math.cos(a) * r;
      const fy = pcy + Math.sin(a) * r;
      ctx.fillStyle = `rgba(255, 209, 102, ${(1 - age) * 0.6})`;
      ctx.fillRect(fx - 2, fy - 2, 4, 4);
    }
    // 文字
    ctx.fillStyle = `rgba(255, 209, 102, ${1 - age * 0.7})`;
    ctx.font = 'bold 28px "Courier New", monospace';
    const descText = `坠入第 ${state.floor + 1} 层`;
    const descW = ctx.measureText(descText).width;
    ctx.fillText(descText, (canvas.width - descW) / 2, 334);
  }

  // ── 游戏结束 ──
  if (state.gameOver) {
    const fadeAlpha = Math.min(0.82, 0.82);
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
    ctx.fillRect(-4, -4, canvas.width + 8, canvas.height + 8);
    // 红色边框脉冲
    const redPulse = 0.15 + getPulse(time, 120, 0.08);
    ctx.strokeStyle = `rgba(255, 107, 107, ${redPulse})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 220, canvas.width - 40, 200);
    // 标题
    ctx.fillStyle = "#ff6b6b";
    ctx.font = 'bold 38px "Courier New", monospace';
    const overText = "冒险终结";
    ctx.fillText(overText, (canvas.width - ctx.measureText(overText).width) / 2, 275);
    // 分割线
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(60, 290, canvas.width - 120, 1);
    // 统计数据
    ctx.font = '16px "Courier New", monospace';
    ctx.fillStyle = "#9eb0c7";
    const stats = [
      `得分  ${state.score}`,
      `楼层  ${state.floor}`,
      `等级  ${state.level}`,
      `击败  ${state.killCount}`,
      `回合  ${state.turn}`,
    ];
    const statsY = 318;
    const statsPerRow = 3;
    const colW = (canvas.width - 80) / statsPerRow;
    stats.forEach((s, i) => {
      const row = Math.floor(i / statsPerRow);
      const col = i % statsPerRow;
      ctx.fillStyle = col === 0 && row === 0 ? COLORS.accent : "#9eb0c7";
      ctx.fillText(s, 60 + col * colW, statsY + row * 28);
    });
    // 重试提示
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = '13px "Courier New", monospace';
    const retryText = "按 [重新开始] 再次挑战地牢";
    ctx.fillText(retryText, (canvas.width - ctx.measureText(retryText).width) / 2, 400);
  } else if (state.awaitingUpgrade) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    ctx.fillRect(-4, -4, canvas.width + 8, canvas.height + 8);
    // 金色升级横幅
    ctx.fillStyle = "rgba(255, 209, 102, 0.12)";
    ctx.fillRect(0, 12, canvas.width, 40);
    ctx.strokeStyle = "rgba(255, 209, 102, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 12, canvas.width, 40);
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 22px "Courier New", monospace';
    const upgradeText = "▲ 选择一项强化 ▲";
    ctx.fillText(upgradeText, (canvas.width - ctx.measureText(upgradeText).width) / 2, 40);
  } else if (state.floor % 5 === 0 && state.enemies.some((enemy) => enemy.kind === "boss")) {
    // Boss 楼层角标
    const bossPulse = 0.7 + getPulse(time, 100, 0.25);
    ctx.fillStyle = `rgba(255, 125, 166, ${bossPulse})`;
    ctx.font = 'bold 18px "Courier New", monospace';
    const bossText = "◆ 守护者楼层 ◆";
    ctx.fillText(bossText, canvas.width - ctx.measureText(bossText).width - 14, 30);
  }

  ctx.restore(); // 结束屏幕抖动变换
}

function render() {
  updateUi();
  if (gameMode === "playing") {
    saveCurrentProfile();
  }
}

function animationLoop(time) {
  drawBoard(time);
  requestAnimationFrame(animationLoop);
}

function restartGame() {
  if (!currentProfileName) {
    openMenu();
    return;
  }

  unlockAudio();
  state = createInitialState();
  setupFloorState(state);
  spawnEnemiesForFloor(state, 1);
  render();
}

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = (event.clientX - rect.left) * scaleX;
  const cy = (event.clientY - rect.top) * scaleY;
  state.mouseGridX = Math.floor((cx - BOARD_PADDING) / CELL_SIZE);
  state.mouseGridY = Math.floor((cy - BOARD_PADDING) / CELL_SIZE);
});

canvas.addEventListener("mouseleave", () => {
  state.mouseGridX = -1;
  state.mouseGridY = -1;
});

canvas.addEventListener("click", (event) => {
  if (isGameplayLocked()) {
    return;
  }

  unlockAudio();

  if (state.awaitingUpgrade || state.gameOver || state.descending) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;
  const gridX = Math.floor((canvasX - BOARD_PADDING) / CELL_SIZE);
  const gridY = Math.floor((canvasY - BOARD_PADDING) / CELL_SIZE);

  if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) {
    return;
  }

  const enemy = getEnemyAt(gridX, gridY);
  if (enemy) {
    performPlayerAttack(enemy);
  }
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (gameMode === "menu") {
    if (key === "escape") {
      event.preventDefault();
      if (currentProfileName) {
        gameMode = "playing";
        syncMenuState();
        render();
      }
      return;
    }

    if (key === "enter") {
      event.preventDefault();
      const name = getProfileNameFromInput() || "冒险者";
      createNewProfile(name, true);
    }
    return;
  }

  if (key === "escape") {
    event.preventDefault();
    openMenu();
    return;
  }

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " "].includes(key)) {
    event.preventDefault();
  }

  unlockAudio();
  if (key === "arrowup" || key === "w") movePlayer(0, -1);
  if (key === "arrowdown" || key === "s") movePlayer(0, 1);
  if (key === "arrowleft" || key === "a") movePlayer(-1, 0);
  if (key === "arrowright" || key === "d") movePlayer(1, 0);
  if (key === " ") waitTurn();
});

ui.audioButton.addEventListener("click", unlockAudio);
ui.restartButton.addEventListener("click", restartGame);
if (ui.menuButton) {
  ui.menuButton.addEventListener("click", () => {
    if (gameMode === "menu") {
      renderSaveList();
      return;
    }
    openMenu();
  });
}

if (ui.newProfileButton) {
  ui.newProfileButton.addEventListener("click", () => {
    const name = getProfileNameFromInput();
    if (!name) {
      ui.profileNameInput?.focus();
      return;
    }

    const existing = safeReadStorage(getStorageKey(name));
    if (existing && !window.confirm(`档案“${name}”已存在，是否覆盖并开始新游戏？`)) {
      return;
    }

    createNewProfile(name, true);
  });
}

if (ui.refreshSavesButton) {
  ui.refreshSavesButton.addEventListener("click", renderSaveList);
}

if (ui.profileNameInput) {
  ui.profileNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      ui.newProfileButton?.click();
    }
  });
}

window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

// ══════════════════════════════════════
// 移动端触控支持
// ══════════════════════════════════════

// ── 轻震动反馈（支持 Vibration API 的设备）──
function haptic(ms = 14) {
  if (navigator.vibrate) {
    navigator.vibrate(ms);
  }
}

// ── 画布滑动 & 点击攻击 ──────────────────────────────
let touchStartX = 0;
let touchStartY = 0;
let touchDrifted = false;
const SWIPE_THRESHOLD = 30; // px，触发移动的最小位移

canvas.addEventListener("touchstart", (e) => {
  unlockAudio();
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchDrifted = false;
}, { passive: true });

// touchmove：位移超过阈值时标记为"滑动中"并阻止页面滚动
canvas.addEventListener("touchmove", (e) => {
  const dx = Math.abs(e.touches[0].clientX - touchStartX);
  const dy = Math.abs(e.touches[0].clientY - touchStartY);
  if (dx > 8 || dy > 8) {
    touchDrifted = true;
    e.preventDefault(); // 阻止滚动
  }
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // 阻止后续触发 synthetic click（避免与下面的 click 监听器重复处理）
  e.preventDefault();

  if (!touchDrifted || (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD)) {
    // ── 点击（tap）：尝试攻击相邻敌人 ──
    if (state.awaitingUpgrade || state.gameOver || state.descending) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (touch.clientX - rect.left) * scaleX;
    const cy = (touch.clientY - rect.top) * scaleY;
    const gx = Math.floor((cx - BOARD_PADDING) / CELL_SIZE);
    const gy = Math.floor((cy - BOARD_PADDING) / CELL_SIZE);
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
      const enemy = getEnemyAt(gx, gy);
      if (enemy) {
        haptic(18);
        performPlayerAttack(enemy);
      }
    }
    return;
  }

  // ── 滑动（swipe）：按主轴方向移动 ──
  if (absDx > absDy) {
    haptic();
    movePlayer(dx > 0 ? 1 : -1, 0);
  } else {
    haptic();
    movePlayer(0, dy > 0 ? 1 : -1);
  }
}, { passive: false });

// ── 虚拟 D-pad 按钮 ────────────────────────────────────
function bindDpadBtn(id, action) {
  const btn = document.getElementById(id);
  if (!btn) {
    return;
  }

  // touchstart：立即响应，无 300ms 延迟
  btn.addEventListener("touchstart", (e) => {
    e.preventDefault(); // 阻止 click 延迟
    unlockAudio();
    haptic();
    action();
  }, { passive: false });

  // 同时保留 click 支持（桌面调试用）
  btn.addEventListener("click", () => {
    unlockAudio();
    action();
  });
}

bindDpadBtn("dpadUp",    () => movePlayer(0, -1));
bindDpadBtn("dpadDown",  () => movePlayer(0,  1));
bindDpadBtn("dpadLeft",  () => movePlayer(-1, 0));
bindDpadBtn("dpadRight", () => movePlayer(1,  0));
bindDpadBtn("dpadWait",  () => waitTurn());

// ── 长按方向键：持续移动 ────────────────────────────────
// 手指按住某方向键时每 200ms 重复触发一次
const HOLD_DELAY = 320;   // 首次触发后的延迟
const HOLD_REPEAT = 180;  // 之后每次重复间隔
let holdTimer = null;

function startHold(action) {
  stopHold();
  holdTimer = window.setTimeout(() => {
    holdTimer = window.setInterval(() => {
      haptic(8);
      action();
    }, HOLD_REPEAT);
  }, HOLD_DELAY);
}

function stopHold() {
  if (holdTimer !== null) {
    window.clearTimeout(holdTimer);
    window.clearInterval(holdTimer);
    holdTimer = null;
  }
}

["dpadUp", "dpadDown", "dpadLeft", "dpadRight"].forEach((id) => {
  const btn = document.getElementById(id);
  if (!btn) {
    return;
  }

  const actionMap = {
    dpadUp:    () => movePlayer(0, -1),
    dpadDown:  () => movePlayer(0,  1),
    dpadLeft:  () => movePlayer(-1, 0),
    dpadRight: () => movePlayer(1,  0),
  };

  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startHold(actionMap[id]);
  }, { passive: false });

  btn.addEventListener("touchend",    stopHold, { passive: true });
  btn.addEventListener("touchcancel", stopHold, { passive: true });
});

updateAudioButton();
syncMenuState();
renderSaveList();
render();
ui.profileNameInput?.focus();
requestAnimationFrame(animationLoop);
