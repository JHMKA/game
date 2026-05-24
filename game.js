const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

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
  mist: {
    label: "薄雾",
    floorA: "#18222a",
    floorB: "#0f171d",
    accent: "#d7ebf5",
    glow: "rgba(222, 240, 250, 0.2)",
    overlay: "rgba(210, 230, 245, 0.1)",
  },
  damp: {
    label: "潮湿",
    floorA: "#11262a",
    floorB: "#0c1a1f",
    accent: "#66d8dd",
    glow: "rgba(88, 214, 222, 0.18)",
    overlay: "rgba(72, 193, 203, 0.08)",
  },
  frost: {
    label: "结冰",
    floorA: "#1b2337",
    floorB: "#101628",
    accent: "#c4ecff",
    glow: "rgba(185, 231, 255, 0.22)",
    overlay: "rgba(168, 220, 255, 0.12)",
  },
};

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
      pushMessage(state, "你的扳手更顺手了，攻击力上升。");
    },
  },
  {
    id: "maxHpBoost",
    title: "加固制服",
    description: "最大生命 +3，并恢复 3 点生命。",
    apply: (state) => {
      state.player.maxHp += 3;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 3);
      pushMessage(state, "制服补强完成，你更能扛了。");
    },
  },
  {
    id: "armorBoost",
    title: "防爆护片",
    description: "护甲 +1。",
    apply: (state) => {
      state.player.armor += 1;
      pushMessage(state, "一层护片卡入装备槽。");
    },
  },
  {
    id: "pulse",
    title: "脉冲扫荡",
    description: "获得脉冲技能：每 5 回合自动对周围敌人造成 2 点伤害。",
    apply: (state) => {
      state.player.pulse = true;
      pushMessage(state, "值班室电网升级，脉冲开始充能。");
    },
  },
  {
    id: "vampire",
    title: "回收模块",
    description: "每击败一个敌人回复 1 点生命。",
    apply: (state) => {
      state.player.lifeSteal = true;
      pushMessage(state, "你学会从战场残骸里回收能量。");
    },
  },
  {
    id: "dash",
    title: "短程冲刺",
    description: "直线移动时可冲两格，若第二格有敌人则直接打击。",
    apply: (state) => {
      state.player.dash = true;
      pushMessage(state, "脚底推进器上线，移动更灵活。");
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
    messages: ["夜班开始。保持走位，别让故障体包围你。"],
    upgradeChoices: [],
    walls: [...walls, ...innerWalls],
    bushes: createBushes(blockedTiles, 20),
    relics: [{ x: 7, y: 7, value: 2 }],
    player: {
      x: 7,
      y: 10,
      facing: 1,
      hp: 10,
      maxHp: 10,
      attack: 2,
      armor: 0,
      combo: 0,
      pulse: false,
      lifeSteal: false,
      dash: false,
    },
    enemies: [],
    attackEffects: [],
  };
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
  currentState.enemies = [];
  currentState.bushes = createBushes(getBaseBlockedTiles(), 18 + (currentState.floor % 4));
}

function createBoss(floor) {
  const hp = 18 + floor * 2;
  return {
    kind: "boss",
    x: 7,
    y: 3,
    hp,
    maxHp: hp,
    attack: 4 + Math.floor(floor / 3),
    cooldown: 0,
    score: 35,
  };
}

function spawnEnemiesForFloor(currentState, floor = currentState.floor) {
  if (floor % 5 === 0) {
    currentState.bushes = currentState.bushes.filter((bush) => Math.abs(bush.x - 7) + Math.abs(bush.y - 3) > 2);
    currentState.enemies.push(createBoss(floor));
    return;
  }

  const spawnCount = Math.min(2 + Math.floor((floor - 1) / 2), 6);
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
  const roll = Math.random();

  if (floor >= 9 && roll > 0.72) {
    const hp = 8 + Math.floor(floor / 4);
    return {
      kind: "brute",
      x,
      y,
      hp,
      maxHp: hp,
      attack: 3 + Math.floor(floor / 8),
      score: 8,
    };
  }

  if (floor >= 4 && roll > 0.4) {
    const hp = 4 + Math.floor(floor / 5);
    return {
      kind: "shooter",
      x,
      y,
      hp,
      maxHp: hp,
      attack: 2 + Math.floor(floor / 7),
      cooldown: 0,
      score: 5,
    };
  }

  const hp = 3 + Math.floor(floor / 6);
  return {
    kind: "slime",
    x,
    y,
    hp,
    maxHp: hp,
    attack: 1 + Math.floor(floor / 8),
    score: 3,
  };
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
    state.xpToNext = state.level;
    state.pendingLevelUps += 1;
    playSound("levelUp");
    pushMessage(state, `升到 ${state.level} 级，可选择一项强化。`);
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
  pushMessage(state, `第 ${state.floor} 层已清空，你坠入更深处的值班井。`);

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
      pushMessage(state, `第 ${state.floor} 层被 ${CLIMATES[state.climate].label} 笼罩，Boss 出现了。`);
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
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + relic.value);
  state.relics = state.relics.filter((item) => item !== relic);
  pushMessage(state, `回收到稳定核心，恢复 ${relic.value} 点生命。`);
}

function attackEnemy(enemy, bonusDamage = 0) {
  const damage = state.player.attack + bonusDamage;
  enemy.hp -= damage;
  playSound(enemy.kind === "boss" ? "bossHit" : "attack");
  state.attackEffects.push(
    createAttackEffect(state.player.x, state.player.y, enemy.x, enemy.y, "player")
  );

  if (enemy.hp <= 0) {
    state.killCount += 1;
    state.player.combo += 1;
    awardXp(1);
    state.score += 10 + enemy.score + state.player.combo * 2;
    state.enemies = state.enemies.filter((entry) => entry !== enemy);
    playSound("kill");
    pushMessage(state, `击败 ${enemyLabel(enemy.kind)}，连斩来到 ${state.player.combo}。`);

    if (state.player.lifeSteal) {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
    }

    if (Math.random() > 0.8 && state.relics.length < 3) {
      state.relics.push({ x: enemy.x, y: enemy.y, value: 2 });
    }

    return;
  }

  pushMessage(state, `你对 ${enemyLabel(enemy.kind)} 造成 ${damage} 点伤害。`);
}

function performPlayerAttack(enemy) {
  if (state.awaitingUpgrade || state.gameOver || state.descending) {
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
  if (kind === "slime") return "故障团";
  if (kind === "shooter") return "哨戒眼";
  if (kind === "boss") return "井底监工";
  return "重压机";
}

function movePlayer(dx, dy) {
  if (state.awaitingUpgrade || state.gameOver || state.descending) {
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
    pushMessage(state, "你拨开草丛潜伏下来，敌人暂时失去你的踪迹。");
  } else if (wasHidden && !hiddenNow) {
    pushMessage(state, "你离开草丛，重新暴露在视野中。");
  } else if (hiddenNow) {
    pushMessage(state, "你贴着草丛移动，仍然保持隐藏。");
  } else {
    pushMessage(state, "你在值班室里挪动位置，重新拉开距离。");
  }
  endTurn();
}

function waitTurn() {
  if (state.awaitingUpgrade || state.gameOver || state.descending) {
    return;
  }

  playSound("wait");
  pushMessage(
    state,
    isPlayerHidden() ? "你屏住呼吸藏在草丛里，等待敌人错身而过。" : "你原地观察敌人的动向。"
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

    if (enemy.kind === "shooter" && seesPlayer && distance <= 4 && enemy.cooldown === 0) {
      state.attackEffects.push(createAttackEffect(enemy.x, enemy.y, state.player.x, state.player.y, "enemy"));
      damagePlayer(enemy.attack, `${enemyLabel(enemy.kind)} 发射脉冲光束。`);
      enemy.cooldown = 2;
      continue;
    }

    if (enemy.kind === "shooter" && enemy.cooldown > 0) {
      enemy.cooldown -= 1;
    }

    if (enemy.kind === "boss" && enemy.cooldown > 0) {
      enemy.cooldown -= 1;
    }

    if (enemy.kind === "boss" && seesPlayer && distance <= 3 && enemy.cooldown === 0) {
      state.attackEffects.push(createAttackEffect(enemy.x, enemy.y, state.player.x, state.player.y, "enemy"));
      damagePlayer(enemy.attack + 1, `${enemyLabel(enemy.kind)} 挥出重锤震击。`);
      enemy.cooldown = 2;
      continue;
    }

    const nextOptions = seesPlayer
      ? [
          { x: enemy.x + dx, y: enemy.y },
          { x: enemy.x, y: enemy.y + dy },
        ].sort(() => Math.random() - 0.5)
      : [
          { x: enemy.x + 1, y: enemy.y },
          { x: enemy.x - 1, y: enemy.y },
          { x: enemy.x, y: enemy.y + 1 },
          { x: enemy.x, y: enemy.y - 1 },
        ].sort(() => Math.random() - 0.5);

    let moved = false;
    for (const option of nextOptions) {
      const collidesWithPlayer = option.x === state.player.x && option.y === state.player.y;
      if (
        !collidesWithPlayer &&
        !isWall(option.x, option.y) &&
        !getEnemyAt(option.x, option.y) &&
        !isRelicAt(option.x, option.y)
      ) {
        enemy.x = option.x;
        enemy.y = option.y;
        moved = true;
        break;
      }
    }

  }
}

function damagePlayer(amount, reason) {
  const actual = Math.max(1, amount - state.player.armor);
  state.player.hp -= actual;
  state.player.combo = 0;
  playSound("hit");
  pushMessage(state, `${reason} 你失去 ${actual} 点生命。`);

  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    pushMessage(state, "值班结束。按右上角按钮可以重新开局。");
  }
}

function prepareUpgradeChoices() {
  const pool = [...upgradePool].sort(() => Math.random() - 0.5);
  state.awaitingUpgrade = true;
  state.upgradeChoices = pool.slice(0, 3);
  pushMessage(state, `等级提升，选择一项维护升级。`);
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
  if (state.awaitingUpgrade || state.descending) {
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

const SPRITES = {
  hero: {
    pattern: [
      ".....ooo......",
      "....oaaao.....",
      "...obcccbo....",
      "..obcdddcbo...",
      "..oceeddeco...",
      "..ofgghhgfo...",
      "..ofijjjkfo.ss",
      "..oljjmmjlo.ss",
      "..onjjmmjno.s.",
      "..oopqqqpo....",
      "..orq..qro....",
      ".ost....tso...",
      ".ou......uo...",
    ],
    palette: {
      o: "#0d1620",
      a: "#7be0ff",
      b: "#23558a",
      c: "#5ab6ff",
      d: "#c8f1ff",
      e: "#ffe59a",
      f: "#3c78d8",
      g: "#8bc0ff",
      h: "#edf7ff",
      i: "#203859",
      j: "#2e5eab",
      k: "#93c9ff",
      l: "#ffcf71",
      m: "#ffc14a",
      n: "#ff9b54",
      p: "#386bc4",
      q: "#264878",
      r: "#f5dd9f",
      s: "#b8c4d9",
      t: "#4b80d8",
      u: "#87d7ff",
    },
  },
  slime: {
    pattern: [
      "..............",
      "...oooooooo...",
      "..oaaaaaaaao..",
      ".oaabbbbbbaao.",
      ".oabccddccbao.",
      ".oacefggfecao.",
      ".oacffhhffcao.",
      ".oaiiiiiiiiao.",
      "..oajjjjjjao..",
      "...okk..kko...",
      "....o....o....",
      "..............",
      "..............",
    ],
    palette: {
      o: "#2f111a",
      a: "#ff758d",
      b: "#ff9aad",
      c: "#ffc2ce",
      d: "#fffaf8",
      e: "#1d1215",
      f: "#ffe3ea",
      g: "#221b1d",
      h: "#ff6da7",
      i: "#d7386b",
      j: "#a11d4f",
      k: "#8a153f",
    },
  },
  shooter: {
    pattern: [
      "......oo......",
      "...oooaaooo...",
      "..oabbbbbbao..",
      ".oacdddeddcao.",
      ".obdfggggfdao.",
      ".obdhijjihdao.",
      ".obdhikkihdao.",
      ".obdhijjihdao.",
      ".obdfggggfdao.",
      ".oacdddeddcao.",
      "..oabbbbbbao..",
      "...oollloo....",
      "....m....m....",
    ],
    palette: {
      o: "#25170a",
      a: "#f59e0b",
      b: "#ffd27c",
      c: "#7c3f00",
      d: "#fff8df",
      e: "#b45309",
      f: "#fff3c9",
      g: "#f4c96d",
      h: "#8b1e15",
      i: "#20090a",
      j: "#ff7b54",
      k: "#5a0f0f",
      l: "#d9b764",
      m: "#ffda85",
    },
  },
  brute: {
    pattern: [
      "...o......o...",
      "..oa......ao..",
      "..oboooooo bo..",
      ".ocbddddddbco.",
      ".ocdeffffedco.",
      ".ocfghhhhgico.",
      ".ocfhjkkjhico.",
      ".ocfhlmmlhico.",
      ".ocnhloolhnco.",
      "..opppqqpppo..",
      "..or..ss..ro..",
      ".ott......tto.",
      "..............",
    ],
    palette: {
      o: "#180f25",
      a: "#d9c2ff",
      b: "#7e46cf",
      c: "#26163a",
      d: "#a855f7",
      e: "#eadcff",
      f: "#6f2bd6",
      g: "#f3b4ff",
      h: "#1b1220",
      i: "#6b21d8",
      j: "#ff9ab7",
      k: "#3c1325",
      l: "#7b35b6",
      m: "#a86cff",
      n: "#4b1d88",
      p: "#d8c0ff",
      q: "#8f5bd4",
      r: "#b38cf7",
      s: "#5e2ca5",
      t: "#512292",
    },
  },
  boss: {
    pattern: [
      "...oo....oo...",
      "..oaa....aao..",
      ".oabboooobbao.",
      ".ocddeeeeddco.",
      ".ocdffggffdco.",
      ".ochfiijifhco.",
      ".ochfikkifhco.",
      ".oclfmmmmflco.",
      ".oclfnnnnflco.",
      "..opqqqqqqpo..",
      "..orr....rro..",
      ".oss......sso.",
      ".ott......tto.",
      "..............",
    ],
    palette: {
      o: "#18090f",
      a: "#ffb8d6",
      b: "#7d0f35",
      c: "#2d0b17",
      d: "#c1124f",
      e: "#ff7da6",
      f: "#5c0c28",
      g: "#ffd0de",
      h: "#450b1e",
      i: "#fff1f6",
      j: "#1c0f12",
      k: "#ff668f",
      l: "#7e143a",
      m: "#db2f67",
      n: "#8b1038",
      p: "#f5bdd1",
      q: "#d23268",
      r: "#76224a",
      s: "#5b1230",
      t: "#42101e",
    },
  },
  relic: {
    pattern: [
      "....a...",
      "...aba..",
      "..abcba.",
      "..abdb..",
      ".abddba.",
      "..abdb..",
      "..accca.",
      "...aea..",
      "...aea..",
      "..ffff..",
    ],
    palette: {
      a: "#c2fff2",
      b: "#7ae582",
      c: "#3bbf79",
      d: "#effff6",
      e: "#2f8f56",
      f: "#234336",
    },
  },
};

SPRITES.brute.pattern = SPRITES.brute.pattern.map((line) => line.replace(/ /g, "."));

function drawFloorTile(x, y, time) {
  const { px, py } = cellToPixel(x, y);
  const shimmer = ((x * 17 + y * 11 + Math.floor(time / 220)) % 9) / 28;
  const climate = CLIMATES[state.climate];
  ctx.fillStyle = (x + y) % 2 === 0 ? climate.floorA : climate.floorB;
  ctx.fillRect(px, py, CELL_SIZE - 4, CELL_SIZE - 4);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.02 + shimmer * 0.03})`;
  ctx.fillRect(px + 4, py + 4, CELL_SIZE - 12, 6);
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fillRect(px + 4, py + CELL_SIZE - 14, CELL_SIZE - 12, 6);

  if (state.climate === "mist") {
    ctx.fillStyle = `rgba(219, 235, 245, ${0.02 + shimmer * 0.03})`;
    ctx.fillRect(px + 10, py + 18, 10, 3);
  } else if (state.climate === "damp") {
    ctx.fillStyle = `rgba(102, 216, 221, ${0.05 + shimmer * 0.05})`;
    ctx.fillRect(px + 24, py + 26, 8, 4);
    ctx.fillRect(px + 14, py + 30, 4, 2);
  } else if (state.climate === "frost") {
    ctx.strokeStyle = `rgba(196, 236, 255, ${0.08 + shimmer * 0.06})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 12, py + 14);
    ctx.lineTo(px + 16, py + 18);
    ctx.lineTo(px + 22, py + 12);
    ctx.stroke();
  }
}

function drawClimateOverlay(time) {
  const climate = CLIMATES[state.climate];

  if (state.climate === "mist") {
    for (let layer = 0; layer < 3; layer += 1) {
      for (let i = 0; i < 4; i += 1) {
        const x = ((time * (0.012 + layer * 0.004) + i * 190 + layer * 70) % (canvas.width + 260)) - 130;
        const y = 70 + layer * 150 + i * 24 + Math.sin(time / (800 + layer * 200) + i) * 18;
        ctx.fillStyle = layer === 0 ? "rgba(223, 237, 245, 0.08)" : layer === 1 ? climate.overlay : "rgba(196, 218, 230, 0.06)";
        ctx.beginPath();
        ctx.ellipse(x, y, 110 + layer * 28, 28 + layer * 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const mistGlow = ctx.createRadialGradient(336, 250, 40, 336, 250, 280);
    mistGlow.addColorStop(0, "rgba(230, 242, 250, 0.1)");
    mistGlow.addColorStop(1, "rgba(10, 16, 22, 0)");
    ctx.fillStyle = mistGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state.climate === "damp") {
    for (let i = 0; i < 12; i += 1) {
      const px = 18 + ((i * 59 + time * 0.03) % (canvas.width - 36));
      const py = 26 + ((i * 73 + time * 0.055) % (canvas.height - 52));
      ctx.fillStyle = "rgba(120, 222, 228, 0.16)";
      ctx.fillRect(px, py, 2, 10);
      ctx.beginPath();
      ctx.arc(px + 1, py + 11, 4 + ((i % 3) * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 5; i += 1) {
      const x = 80 + i * 120 + Math.sin(time / 850 + i) * 20;
      const y = 110 + i * 90;
      ctx.strokeStyle = "rgba(110, 220, 230, 0.11)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 30 + i * 3, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (state.climate === "frost") {
    for (let i = 0; i < 22; i += 1) {
      const x = (i * 37 + time * 0.01) % canvas.width;
      const y = (i * 57 + time * 0.018) % canvas.height;
      const sparkle = 0.06 + ((Math.sin(time / 240 + i) + 1) * 0.05);
      ctx.strokeStyle = `rgba(195, 236, 255, ${sparkle})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
    }
    const edgeGlow = ctx.createLinearGradient(0, 0, canvas.width, 0);
    edgeGlow.addColorStop(0, "rgba(184, 230, 255, 0.14)");
    edgeGlow.addColorStop(0.15, "rgba(184, 230, 255, 0)");
    edgeGlow.addColorStop(0.85, "rgba(184, 230, 255, 0)");
    edgeGlow.addColorStop(1, "rgba(184, 230, 255, 0.14)");
    ctx.fillStyle = edgeGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = climate.overlay;
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
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(px, py, CELL_SIZE - 4, CELL_SIZE - 4);
  ctx.fillStyle = COLORS.wallEdge;
  ctx.fillRect(px, py, CELL_SIZE - 4, 8);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(px + 5, py + 12, CELL_SIZE - 18, 4);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(px + 8, py + 22, CELL_SIZE - 22, 12);
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
  drawShadow(px + 22, py + 34, 12, 5, 0.18);
  drawSpritePattern(SPRITES.relic.pattern, SPRITES.relic.palette, px + 11, py + 7 + bob, {
    scale: 3,
  });
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
  const faceRight = state.player.x >= enemy.x;
  const bobBase =
    enemy.kind === "slime" ? 210 : enemy.kind === "shooter" ? 300 : enemy.kind === "boss" ? 180 : 240;
  const bob = getPulse(time + enemy.x * 90 + enemy.y * 35, bobBase, enemy.kind === "shooter" ? 3 : 2);
  const shadowWidth = enemy.kind === "boss" ? 18 : enemy.kind === "brute" ? 16 : 13;
  if (hidden) {
    return;
  }

  drawShadow(px + 22, py + 36, shadowWidth, 6, 0.22);

  if (enemy.kind === "shooter" || enemy.kind === "boss") {
    ctx.strokeStyle = "rgba(245, 158, 11, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px + 22, py + 20 + bob, enemy.kind === "boss" ? 18 + getPulse(time, 120, 1.5) : 15 + getPulse(time, 120, 1.2), 0, Math.PI * 2);
    ctx.stroke();
  }

  drawSpritePattern(
    SPRITES[enemy.kind].pattern,
    SPRITES[enemy.kind].palette,
    px + 6,
    py + 4 + bob,
    { scale: 3, mirror: !faceRight }
  );

  if (enemy.kind === "brute" || enemy.kind === "boss") {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(px + 8, py + 3 + bob, enemy.kind === "boss" ? 26 : 22, 3);
  }
  drawHealthBar(
    px + (enemy.kind === "boss" ? 4 : 7),
    py - 2,
    enemy.kind === "boss" ? 36 : 30,
    enemy.hp,
    enemy.maxHp ?? enemy.hp,
    enemy.kind === "boss" ? "#ff7da6" : enemy.kind === "brute" ? "#d8c2ff" : "#ffd166"
  );
}

function drawHero(time) {
  const { px, py } = cellToPixel(state.player.x, state.player.y);
  const hidden = isPlayerHidden();
  const bob = getPulse(time + state.turn * 80, 240, 1.5);
  const aura = 11 + getPulse(time, 180, 1.5);
  drawShadow(px + 22, py + 37, 14, 6, 0.2);
  ctx.strokeStyle = "rgba(88, 166, 255, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px + 21, py + 21 + bob, aura, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  if (hidden) {
    ctx.globalAlpha = 0.72;
  }
  drawSpritePattern(SPRITES.hero.pattern, SPRITES.hero.palette, px + 5, py + 5 + bob, {
    scale: 3,
    mirror: state.player.facing < 0,
  });
  ctx.restore();

  if (state.player.pulse) {
    ctx.strokeStyle = "rgba(123, 223, 242, 0.35)";
    ctx.beginPath();
    ctx.arc(px + 22, py + 20 + bob, 17 + getPulse(time, 110, 2.5), 0, Math.PI * 2);
    ctx.stroke();
  }
  drawHealthBar(px + 7, py - 2, 30, state.player.hp, state.player.maxHp, "#7bdff2");
}

function drawBoard(time = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#091017";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      drawFloorTile(x, y, time);
    }
  }

  state.walls.forEach((wall) => {
    drawWallTile(wall.x, wall.y);
  });

  state.bushes.forEach((bush) => {
    drawBushPatch(bush, time, false);
  });

  state.relics.forEach((relic) => {
    drawRelic(relic, time);
  });

  drawClimateOverlay(time);

  state.enemies.forEach((enemy) => {
    drawEnemy(enemy, time);
  });

  drawHero(time);
  drawAttackEffects(time);

  state.bushes.forEach((bush) => {
    const occupantHere =
      (state.player.x === bush.x && state.player.y === bush.y) ||
      state.enemies.some((enemy) => enemy.x === bush.x && enemy.y === bush.y);
    drawBushPatch(bush, time + 80, occupantHere);
  });

  ctx.fillStyle = COLORS.text;
  ctx.font = '16px "Courier New", monospace';
  ctx.fillText(`Turn ${state.turn}`, 20, canvas.height - 18);
  ctx.fillText(`Floor ${state.floor}`, 120, canvas.height - 18);
  ctx.fillText(`Lv ${state.level}`, 220, canvas.height - 18);
  ctx.fillText(CLIMATES[state.climate].label, 300, canvas.height - 18);

  if (isPlayerHidden() && !state.gameOver) {
    ctx.fillStyle = "rgba(122, 229, 130, 0.92)";
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillText("HIDDEN IN GRASS", 500, canvas.height - 18);
  }

  if (state.descending) {
    const age = Math.min(1, (time - state.descentStartedAt) / DESCENT_DURATION);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.25 + age * 0.45})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#05080c";
    ctx.beginPath();
    ctx.arc(
      BOARD_PADDING + state.player.x * CELL_SIZE + 22,
      BOARD_PADDING + state.player.y * CELL_SIZE + 22,
      20 + age * 120,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.fillStyle = `rgba(255, 209, 102, ${1 - age * 0.6})`;
    ctx.font = 'bold 30px "Courier New", monospace';
    ctx.fillText(`DESCENDING TO F${state.floor + 1}`, 126, 334);
  }

  if (state.gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 34px "Courier New", monospace';
    ctx.fillText("SHIFT OVER", 210, 300);
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText(`Final Score: ${state.score}`, 240, 340);
  } else if (state.awaitingUpgrade) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.fillText("CHOOSE AN UPGRADE", 140, 44);
  } else if (state.floor % 5 === 0 && state.enemies.some((enemy) => enemy.kind === "boss")) {
    ctx.fillStyle = "rgba(255, 125, 166, 0.92)";
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText("BOSS FLOOR", 520, 32);
  }
}

function render() {
  updateUi();
}

function animationLoop(time) {
  drawBoard(time);
  requestAnimationFrame(animationLoop);
}

function restartGame() {
  unlockAudio();
  state = createInitialState();
  setupFloorState(state);
  spawnEnemiesForFloor(state, 1);
  render();
}

canvas.addEventListener("click", (event) => {
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
restartGame();
requestAnimationFrame(animationLoop);
