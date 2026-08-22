"use strict";

/* ============================== Setup ============================== */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const el = {
  hpFill: document.getElementById("hp-fill"),
  bossHud: document.getElementById("boss-hud"),
  bossName: document.getElementById("boss-name"),
  bossFill: document.getElementById("boss-fill"),
  score: document.getElementById("score"),
  wave: document.getElementById("wave"),
  weaponName: document.getElementById("weapon-name"),
  weaponLvl: document.getElementById("weapon-lvl"),
  startScreen: document.getElementById("start-screen"),
  pauseScreen: document.getElementById("pause-screen"),
  gameoverScreen: document.getElementById("gameover-screen"),
  winScreen: document.getElementById("win-screen"),
  finalScore: document.getElementById("final-score"),
  winScore: document.getElementById("win-score"),
  startBtn: document.getElementById("start-btn"),
  resumeBtn: document.getElementById("resume-btn"),
  restartBtn: document.getElementById("restart-btn"),
  nextLevelBtn: document.getElementById("next-level-btn"),
};

/** @type {"start"|"playing"|"paused"|"gameover"|"win"} */
let state = "start";

/* ============================== Helpers ============================== */

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function flash(text, color = "#4dd0ff", duration = 1600) {
  banners.push({ text, color, life: duration, maxLife: duration });
}

/* ============================== World state ============================== */

let player = null;
let bullets = [];
let enemyBullets = [];
let enemies = [];
let powerups = [];
let particles = [];
let boss = null;
let stars = [];
let banners = [];
let wave = 1;
let score = 0;
let spawnTimer = 0;
let enemiesToSpawn = 0;
let enemiesAlive = 0;
let enemiesDefeated = 0;
let enemiesRequired = 0;
let waveTransitioning = false;
let lastBossKey = null;
let nextEnemyId = 1;
let keys = {};

function initStars() {
  stars = [];
  for (let i = 0; i < 120; i++) {
    stars.push({
      x: rand(0, W),
      y: rand(0, H),
      speed: rand(20, 120),
      size: rand(0.6, 2.2),
    });
  }
}

function newPlayer() {
  return {
    x: W / 2 - 18,
    y: H - 90,
    w: 36,
    h: 42,
    speed: 320,
    hp: 100,
    maxHp: 100,
    weapons: {
      cannon: { owned: true, level: 1 },
      laser: { owned: false, level: 0 },
      missile: { owned: false, level: 0 },
    },
    activeWeapon: "cannon",
    fireCooldown: 0,
    shieldTimer: 0,
    rapidTimer: 0,
    invulnTimer: 1200, // brief spawn invulnerability
  };
}

function resetGame() {
  player = newPlayer();
  bullets = [];
  enemyBullets = [];
  enemies = [];
  powerups = [];
  particles = [];
  banners = [];
  boss = null;
  lastBossKey = null;
  wave = 1;
  score = 0;
  startWave();
  initStars();
}

function isBossWave(w) {
  return w % 5 === 0;
}

function startWave() {
  enemiesRequired = 6 + wave * 3;
  enemiesToSpawn = enemiesRequired;
  enemiesAlive = 0;
  enemiesDefeated = 0;
  spawnTimer = 0;
  waveTransitioning = false;
  boss = null;
  enemyBullets = [];
  el.bossHud.hidden = true;
  flash(
    isBossWave(wave) ? `ВОЛНА ${wave} — БОСС!` : `ВОЛНА ${wave}`,
    isBossWave(wave) ? "#ff3b5c" : "#4dd0ff"
  );
}

function advanceToNextWave() {
  wave++;
  player.hp = clamp(player.hp + 10, 0, player.maxHp);
  bullets = [];
  enemyBullets = [];
  enemies = [];
  startWave();
}

/* ============================== Enemies ============================== */

const ENEMY_TYPES = {
  drone: { w: 30, h: 26, hp: 20, speed: 90, score: 10, color: "#ff6b6b", shoots: false },
  shooter: { w: 34, h: 30, hp: 35, speed: 60, score: 15, color: "#ffb347", shoots: true },
  zigzag: { w: 28, h: 24, hp: 25, speed: 140, score: 20, color: "#c084fc", shoots: false },
};

function spawnEnemy() {
  const typeKeys = Object.keys(ENEMY_TYPES);
  const key = typeKeys[Math.floor(rand(0, typeKeys.length))];
  const def = ENEMY_TYPES[key];
  const hpScale = 1 + (wave - 1) * 0.25;
  enemies.push({
    id: nextEnemyId++,
    type: key,
    x: rand(20, W - 20 - def.w),
    y: -def.h - rand(0, 200),
    w: def.w,
    h: def.h,
    hp: def.hp * hpScale,
    maxHp: def.hp * hpScale,
    speed: def.speed,
    color: def.color,
    scoreValue: def.score,
    shoots: def.shoots,
    shootCooldown: rand(800, 1800),
    t: rand(0, Math.PI * 2),
  });
  enemiesAlive++;
}

function spawnMinion(x, y, scoreValue) {
  const def = ENEMY_TYPES.drone;
  enemies.push({
    id: nextEnemyId++,
    type: "drone",
    x: clamp(x, 10, W - 10 - def.w),
    y,
    w: def.w,
    h: def.h,
    hp: def.hp * 0.7,
    maxHp: def.hp * 0.7,
    speed: def.speed * 1.15,
    color: def.color,
    scoreValue,
    shoots: false,
    shootCooldown: 9999,
    t: 0,
  });
  enemiesAlive++;
}

function updateEnemies(dt) {
  if (enemiesToSpawn > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy();
      enemiesToSpawn--;
      spawnTimer = rand(500, 950);
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.t += dt / 1000;
    e.y += e.speed * (dt / 1000);
    if (e.type === "zigzag") e.x += Math.sin(e.t * 4) * 160 * (dt / 1000);
    e.x = clamp(e.x, 4, W - e.w - 4);

    if (e.shoots) {
      e.shootCooldown -= dt;
      if (e.shootCooldown <= 0 && e.y > 0) {
        const dx = player.x + player.w / 2 - (e.x + e.w / 2);
        const dy = player.y + player.h / 2 - (e.y + e.h / 2);
        const len = Math.hypot(dx, dy) || 1;
        enemyBullets.push({
          x: e.x + e.w / 2 - 3,
          y: e.y + e.h,
          vx: (dx / len) * 260,
          vy: (dy / len) * 260,
          w: 6,
          h: 6,
          dmg: 10,
          color: "#ffb347",
        });
        e.shootCooldown = rand(1400, 2400);
      }
    }

    if (e.y > H + 40) {
      enemies.splice(i, 1);
      enemiesAlive--;
      continue;
    }

    // player collision
    if (player.invulnTimer <= 0 && aabb(e, player)) {
      damagePlayer(18);
      spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.color, 14);
      enemies.splice(i, 1);
      enemiesAlive--;
      continue;
    }

    // bullet collisions
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (b.hitIds && b.hitIds.includes(e.id)) continue;
      if (aabb(b, e)) {
        e.hp -= b.dmg;
        spawnExplosion(b.x, b.y, b.color || "#4dd0ff", b.splash ? 12 : 4);
        if (b.splash) dealSplashDamage(b.x, b.y, b.splash, b.dmg * 0.5, e.id, true);

        if (b.pierceLeft !== undefined) {
          b.hitIds.push(e.id);
          b.pierceLeft -= 1;
          if (b.pierceLeft <= 0) bullets.splice(j, 1);
        } else {
          bullets.splice(j, 1);
        }
        break;
      }
    }

    if (e.hp <= 0) {
      score += e.scoreValue;
      spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.color, 22);
      maybeDropPowerup(e.x + e.w / 2, e.y + e.h / 2);
      enemies.splice(i, 1);
      enemiesAlive--;
      enemiesDefeated++;
    }
  }
}

/* ============================== Weapons ============================== */

const WEAPON_DEFS = {
  cannon: {
    name: "Пушка",
    color: "#4dd0ff",
    fireRate: [420, 300, 200],
    dmg: [12, 16, 20],
  },
  laser: {
    name: "Лазер",
    color: "#ff5df2",
    fireRate: [150, 110, 80],
    dmg: [7, 9, 12],
    pierce: [2, 4, 6],
  },
  missile: {
    name: "Ракеты",
    color: "#ffb347",
    fireRate: [750, 580, 440],
    dmg: [30, 42, 56],
    count: [1, 2, 3],
    splash: [42, 55, 68],
  },
};

function mkCannonBullet(x, y, vx, dmg) {
  return { x, y, w: 4, h: 12, vx, vy: -560, dmg, color: "#4dd0ff" };
}

function mkLaserBullet(x, y, dmg, pierce) {
  return {
    x, y, w: 3, h: 22, vx: 0, vy: -820, dmg,
    color: "#ff5df2", pierceLeft: pierce, hitIds: [],
  };
}

function mkMissile(x, y, dmg, splash) {
  return {
    x, y, w: 8, h: 14, vx: rand(-20, 20), vy: -260, dmg,
    color: "#ffb347", splash, homing: true, turnRate: 3.2,
  };
}

function shoot() {
  const cx = player.x + player.w / 2;
  const top = player.y;
  const w = player.activeWeapon;
  const lvl = player.weapons[w].level;

  if (w === "cannon") {
    const dmg = WEAPON_DEFS.cannon.dmg[lvl - 1];
    if (lvl === 1) {
      bullets.push(mkCannonBullet(cx - 2, top, 0, dmg));
    } else if (lvl === 2) {
      bullets.push(mkCannonBullet(cx - 10, top, 0, dmg));
      bullets.push(mkCannonBullet(cx + 6, top, 0, dmg));
    } else {
      bullets.push(mkCannonBullet(cx - 2, top, 0, dmg));
      bullets.push(mkCannonBullet(cx - 14, top, -60, dmg));
      bullets.push(mkCannonBullet(cx + 10, top, 60, dmg));
    }
  } else if (w === "laser") {
    const dmg = WEAPON_DEFS.laser.dmg[lvl - 1];
    const pierce = WEAPON_DEFS.laser.pierce[lvl - 1];
    bullets.push(mkLaserBullet(cx - 1.5, top, dmg, pierce));
    if (lvl >= 3) {
      bullets.push(mkLaserBullet(cx - 15, top, dmg, pierce));
      bullets.push(mkLaserBullet(cx + 12, top, dmg, pierce));
    }
  } else if (w === "missile") {
    const dmg = WEAPON_DEFS.missile.dmg[lvl - 1];
    const splash = WEAPON_DEFS.missile.splash[lvl - 1];
    const count = WEAPON_DEFS.missile.count[lvl - 1];
    for (let i = 0; i < count; i++) {
      bullets.push(mkMissile(cx - 4 + rand(-8, 8), top, dmg, splash));
    }
  }
}

function switchWeapon(numKey) {
  const map = { 1: "cannon", 2: "laser", 3: "missile" };
  const key = map[numKey];
  if (!key) return;
  const wp = player.weapons[key];
  if (!wp.owned) {
    flash("ОРУЖИЕ НЕ НАЙДЕНО", "#8792b8", 700);
    return;
  }
  if (player.activeWeapon === key) return;
  player.activeWeapon = key;
  player.fireCooldown = Math.min(player.fireCooldown, 120);
  flash(WEAPON_DEFS[key].name.toUpperCase(), WEAPON_DEFS[key].color, 800);
}

/* ============================== Bosses ============================== */

function fanSpreadAttack(b) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h;
  const count = 7;
  for (let i = 0; i < count; i++) {
    const angle = Math.PI / 2 + (i - (count - 1) / 2) * 0.22;
    enemyBullets.push({
      x: cx - 4, y: cy,
      vx: Math.cos(angle) * 240, vy: Math.sin(angle) * 240,
      w: 8, h: 8, dmg: 12, color: b.color,
    });
  }
}

function aimedBurstAttack(b) {
  const thisBoss = b;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h;
  const dx = player.x + player.w / 2 - cx;
  const dy = player.y + player.h / 2 - cy;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      if (boss !== thisBoss || state !== "playing") return;
      enemyBullets.push({
        x: cx - 4, y: cy,
        vx: (dx / len) * 320, vy: (dy / len) * 320,
        w: 8, h: 8, dmg: 14, color: "#ff8a5c",
      });
    }, i * 160);
  }
}

function ringBurstAttack(b) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const count = 14;
  for (let i = 0; i < count; i++) {
    const angle = ((Math.PI * 2) / count) * i;
    enemyBullets.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * 180, vy: Math.sin(angle) * 180,
      w: 8, h: 8, dmg: 10, color: b.color,
    });
  }
}

function missileVolleyAttack(b) {
  const thisBoss = b;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h;
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      if (boss !== thisBoss || state !== "playing") return;
      const dx = player.x + player.w / 2 - cx;
      const dy = player.y + player.h / 2 - cy;
      const angle = Math.atan2(dy, dx) + (i - 1) * 0.3;
      enemyBullets.push({
        x: cx - 4, y: cy,
        vx: Math.cos(angle) * 170, vy: Math.sin(angle) * 170,
        w: 8, h: 8, dmg: 16, color: "#ffb347",
        homing: true, turnRate: 2.4,
      });
    }, i * 180);
  }
}

function spawnDronesAttack(b) {
  for (let i = 0; i < 2; i++) {
    spawnMinion(b.x + rand(10, b.w - 40), b.y + b.h, 8);
  }
}

function laserSweepAttack(b) {
  const y = b.y + b.h;
  const startX = 40;
  const endX = W - 40;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    setTimeout(() => {
      if (state !== "playing") return;
      const x = startX + (endX - startX) * (i / (steps - 1));
      enemyBullets.push({
        x, y, vx: 0, vy: 300, w: 10, h: 10, dmg: 14, color: "#c084fc",
      });
    }, i * 120);
  }
}

const BOSS_TYPES = [
  {
    key: "dreadnought",
    name: "ДРЕДНОУТ",
    color: "#ff3b5c",
    fill: "#5b1030",
    w: 140,
    h: 100,
    baseHp: 900,
    hpPerTier: 450,
    speed: 90,
    patterns: [fanSpreadAttack, aimedBurstAttack],
    cooldowns: [1500, 2200],
    draw(ctx2, b) {
      ctx2.beginPath();
      ctx2.moveTo(b.x + b.w / 2, b.y + b.h);
      ctx2.lineTo(b.x + b.w, b.y + b.h * 0.2);
      ctx2.lineTo(b.x + b.w * 0.7, b.y);
      ctx2.lineTo(b.x + b.w * 0.3, b.y);
      ctx2.lineTo(b.x, b.y + b.h * 0.2);
      ctx2.closePath();
      ctx2.fill();
      ctx2.stroke();
    },
  },
  {
    key: "hive",
    name: "УЛЕЙ",
    color: "#a463ff",
    fill: "#2e1a4d",
    w: 160,
    h: 90,
    baseHp: 1050,
    hpPerTier: 500,
    speed: 70,
    patterns: [spawnDronesAttack, laserSweepAttack],
    cooldowns: [2600, 1800],
    draw(ctx2, b) {
      ctx2.beginPath();
      ctx2.moveTo(b.x + b.w * 0.5, b.y);
      ctx2.lineTo(b.x + b.w * 0.9, b.y + b.h * 0.25);
      ctx2.lineTo(b.x + b.w * 0.9, b.y + b.h * 0.75);
      ctx2.lineTo(b.x + b.w * 0.5, b.y + b.h);
      ctx2.lineTo(b.x + b.w * 0.1, b.y + b.h * 0.75);
      ctx2.lineTo(b.x + b.w * 0.1, b.y + b.h * 0.25);
      ctx2.closePath();
      ctx2.fill();
      ctx2.stroke();
    },
  },
  {
    key: "cruiser",
    name: "КРЕЙСЕР",
    color: "#ffb347",
    fill: "#4a2f10",
    w: 170,
    h: 80,
    baseHp: 1100,
    hpPerTier: 520,
    speed: 100,
    patterns: [ringBurstAttack, missileVolleyAttack],
    cooldowns: [2400, 2000],
    draw(ctx2, b) {
      ctx2.beginPath();
      ctx2.moveTo(b.x + b.w * 0.5, b.y + b.h);
      ctx2.lineTo(b.x + b.w, b.y + b.h * 0.55);
      ctx2.lineTo(b.x + b.w * 0.75, b.y);
      ctx2.lineTo(b.x + b.w * 0.25, b.y);
      ctx2.lineTo(b.x, b.y + b.h * 0.55);
      ctx2.closePath();
      ctx2.fill();
      ctx2.stroke();
    },
  },
];

function pickBossType() {
  let pool = BOSS_TYPES;
  if (BOSS_TYPES.length > 1 && lastBossKey) {
    pool = BOSS_TYPES.filter((b) => b.key !== lastBossKey);
  }
  const chosen = pool[Math.floor(rand(0, pool.length))];
  lastBossKey = chosen.key;
  return chosen;
}

function spawnBoss() {
  const def = pickBossType();
  const tier = Math.ceil(wave / 5);
  const hp = def.baseHp + (tier - 1) * def.hpPerTier;
  boss = {
    defKey: def.key,
    name: def.name,
    color: def.color,
    x: W / 2 - def.w / 2,
    y: -def.h - 20,
    w: def.w,
    h: def.h,
    hp,
    maxHp: hp,
    speed: def.speed,
    dir: 1,
    entering: true,
    attackTimer: 1200,
    pattern: 0,
    patterns: def.patterns,
    cooldowns: def.cooldowns,
  };
  el.bossHud.hidden = false;
  el.bossName.textContent = def.name;
  flash(`БОСС: ${def.name}`, def.color, 2200);
}

function bossAttack() {
  if (!boss) return;
  const patternFn = boss.patterns[boss.pattern];
  patternFn(boss);
  boss.pattern = (boss.pattern + 1) % boss.patterns.length;
  boss.attackTimer = boss.cooldowns[boss.pattern];
}

function updateBoss(dt) {
  if (!boss) return;

  if (boss.entering) {
    boss.y += 60 * (dt / 1000);
    if (boss.y >= 40) {
      boss.y = 40;
      boss.entering = false;
    }
    return;
  }

  boss.x += boss.dir * boss.speed * (dt / 1000);
  if (boss.x < 20 || boss.x > W - boss.w - 20) boss.dir *= -1;

  boss.attackTimer -= dt;
  if (boss.attackTimer <= 0) bossAttack();

  // bullet collisions
  for (let j = bullets.length - 1; j >= 0; j--) {
    const b = bullets[j];
    if (aabb(b, boss)) {
      boss.hp -= b.dmg;
      spawnExplosion(b.x, b.y, b.color || "#4dd0ff", b.splash ? 14 : 4);
      if (b.splash) dealSplashDamage(b.x, b.y, b.splash, b.dmg * 0.5, null, false);
      bullets.splice(j, 1);
    }
  }

  if (player.invulnTimer <= 0 && aabb(boss, player)) {
    damagePlayer(1);
  }

  if (boss.hp <= 0) {
    const bx = boss.x + boss.w / 2;
    const by = boss.y + boss.h / 2;
    score += 500 * Math.ceil(wave / 5);
    spawnExplosion(bx, by, boss.color, 60);
    for (let i = 0; i < 2; i++) {
      const def = POWERUP_TYPES[Math.floor(rand(0, POWERUP_TYPES.length))];
      powerups.push({ x: bx + rand(-40, 40), y: by, w: 22, h: 22, vy: 70, ...def });
    }
    boss = null;
    winWave();
    return;
  }
}

function winWave() {
  state = "win";
  el.winScore.textContent = score;
  el.winScreen.hidden = false;
}

/* ============================== Bullets ============================== */

function nearestTarget(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    const d = (e.x + e.w / 2 - x) ** 2 + (e.y + e.h / 2 - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (boss) {
    const d = (boss.x + boss.w / 2 - x) ** 2 + (boss.y + boss.h / 2 - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = boss;
    }
  }
  return best;
}

function applyHoming(b, dt, tx, ty) {
  const desired = Math.atan2(ty - b.y, tx - b.x);
  const current = Math.atan2(b.vy, b.vx);
  let diff = desired - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = (b.turnRate || 3) * (dt / 1000);
  const turn = clamp(diff, -maxTurn, maxTurn);
  const speed = Math.hypot(b.vx, b.vy) || 200;
  const angle = current + turn;
  b.vx = Math.cos(angle) * speed;
  b.vy = Math.sin(angle) * speed;
}

function dealSplashDamage(x, y, radius, dmg, excludeEnemyId, hitBoss) {
  for (const e of enemies) {
    if (e.id === excludeEnemyId) continue;
    const dx = e.x + e.w / 2 - x;
    const dy = e.y + e.h / 2 - y;
    if (dx * dx + dy * dy <= radius * radius) {
      e.hp -= dmg;
      spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.color, 6);
    }
  }
  if (hitBoss && boss) {
    const dx = boss.x + boss.w / 2 - x;
    const dy = boss.y + boss.h / 2 - y;
    if (dx * dx + dy * dy <= radius * radius) boss.hp -= dmg;
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.homing) {
      const t = nearestTarget(b.x, b.y);
      if (t) applyHoming(b, dt, t.x + t.w / 2, t.y + t.h / 2);
    }
    b.x += b.vx * (dt / 1000);
    b.y += b.vy * (dt / 1000);
    if (b.y < -20 || b.y > H + 20 || b.x < -30 || b.x > W + 30) {
      bullets.splice(i, 1);
    }
  }
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    if (b.homing) applyHoming(b, dt, player.x + player.w / 2, player.y + player.h / 2);
    b.x += b.vx * (dt / 1000);
    b.y += b.vy * (dt / 1000);
    if (b.y > H + 20 || b.y < -20 || b.x < -20 || b.x > W + 20) {
      enemyBullets.splice(i, 1);
      continue;
    }
    if (player.invulnTimer <= 0 && aabb(b, player)) {
      damagePlayer(b.dmg);
      spawnExplosion(b.x, b.y, b.color, 6);
      enemyBullets.splice(i, 1);
    }
  }
}

/* ============================== Power-ups ============================== */

const POWERUP_TYPES = [
  { type: "weapon_cannon", color: "#4dd0ff", label: "C" },
  { type: "weapon_laser", color: "#ff5df2", label: "L" },
  { type: "weapon_missile", color: "#ffb347", label: "M" },
  { type: "heal", color: "#34d399", label: "+" },
  { type: "shield", color: "#facc15", label: "S" },
  { type: "rapid", color: "#f472b6", label: "R" },
];

function maybeDropPowerup(x, y) {
  if (Math.random() > 0.28) return;
  const def = POWERUP_TYPES[Math.floor(rand(0, POWERUP_TYPES.length))];
  powerups.push({ x, y, w: 22, h: 22, vy: 90, ...def });
}

function updatePowerups(dt) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y += p.vy * (dt / 1000);
    if (p.y > H + 20) {
      powerups.splice(i, 1);
      continue;
    }
    if (aabb(p, player)) {
      applyPowerup(p.type);
      powerups.splice(i, 1);
    }
  }
}

function applyPowerup(type) {
  if (type.startsWith("weapon_")) {
    const key = type.slice("weapon_".length);
    const wp = player.weapons[key];
    const def = WEAPON_DEFS[key];
    if (!wp.owned) {
      wp.owned = true;
      wp.level = 1;
      flash(`ПОЛУЧЕНО: ${def.name.toUpperCase()}`, def.color, 1400);
    } else if (wp.level < 3) {
      wp.level++;
      flash(`${def.name.toUpperCase()} УЛУЧШЕНО (${wp.level})`, def.color, 1200);
    } else {
      score += 50;
      flash("+50 (МАКС. УРОВЕНЬ)", def.color, 1000);
    }
  } else if (type === "heal") {
    player.hp = clamp(player.hp + 30, 0, player.maxHp);
    flash("+30 HP", "#34d399", 1000);
  } else if (type === "shield") {
    player.shieldTimer = 5000;
    flash("ЩИТ АКТИВЕН", "#facc15", 1000);
  } else if (type === "rapid") {
    player.rapidTimer = 8000;
    flash("СКОРОСТРЕЛЬНОСТЬ", "#f472b6", 1000);
  }
}

/* ============================== Player ============================== */

function damagePlayer(amount) {
  if (player.shieldTimer > 0) return;
  if (player.invulnTimer > 0) return;
  player.hp -= amount;
  player.invulnTimer = 500;
  if (player.hp <= 0) {
    player.hp = 0;
    gameOver();
  }
}

function gameOver() {
  state = "gameover";
  el.finalScore.textContent = score;
  el.gameoverScreen.hidden = false;
}

function updatePlayer(dt) {
  const s = (dt / 1000) * player.speed;
  if (keys["arrowleft"] || keys["a"]) player.x -= s;
  if (keys["arrowright"] || keys["d"]) player.x += s;
  if (keys["arrowup"] || keys["w"]) player.y -= s;
  if (keys["arrowdown"] || keys["s"]) player.y += s;
  player.x = clamp(player.x, 6, W - player.w - 6);
  player.y = clamp(player.y, 6, H - player.h - 6);

  if (player.invulnTimer > 0) player.invulnTimer -= dt;
  if (player.shieldTimer > 0) player.shieldTimer -= dt;
  if (player.rapidTimer > 0) player.rapidTimer -= dt;

  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  if (keys[" "] && player.fireCooldown <= 0) {
    shoot();
    const wdef = WEAPON_DEFS[player.activeWeapon];
    const lvl = player.weapons[player.activeWeapon].level;
    const baseRate = wdef.fireRate[lvl - 1];
    player.fireCooldown = player.rapidTimer > 0 ? baseRate * 0.5 : baseRate;
  }
}

/* ============================== Particles & background ============================== */

function spawnExplosion(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(40, 220);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(300, 700),
      maxLife: 700,
      color,
      size: rand(1.5, 3.5),
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * (dt / 1000);
    p.y += p.vy * (dt / 1000);
  }
}

function updateStars(dt) {
  for (const st of stars) {
    st.y += st.speed * (dt / 1000);
    if (st.y > H) {
      st.y = 0;
      st.x = rand(0, W);
    }
  }
}

function updateBanners(dt) {
  for (let i = banners.length - 1; i >= 0; i--) {
    banners[i].life -= dt;
    if (banners[i].life <= 0) banners.splice(i, 1);
  }
}

/* ============================== Rendering ============================== */

function drawStars() {
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  for (const st of stars) {
    ctx.globalAlpha = 0.5 + st.size / 3;
    ctx.fillRect(st.x, st.y, st.size, st.size);
  }
  ctx.globalAlpha = 1;
}

function drawShip(x, y, w, h, color, glow) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(0, h / 3);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const blinking = player.invulnTimer > 0 && Math.floor(player.invulnTimer / 90) % 2 === 0;
  if (blinking) ctx.globalAlpha = 0.4;
  const weaponColor = WEAPON_DEFS[player.activeWeapon].color;
  drawShip(player.x, player.y, player.w, player.h, "#e6ecff", weaponColor);
  ctx.globalAlpha = 1;

  // engine flame
  ctx.fillStyle = "rgba(255,180,80,0.8)";
  ctx.beginPath();
  ctx.moveTo(player.x + player.w / 2 - 6, player.y + player.h - 4);
  ctx.lineTo(player.x + player.w / 2 + 6, player.y + player.h - 4);
  ctx.lineTo(player.x + player.w / 2, player.y + player.h + 12 + rand(0, 6));
  ctx.closePath();
  ctx.fill();

  if (player.shieldTimer > 0) {
    ctx.strokeStyle = "rgba(250,204,21,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x + player.w / 2, player.y + player.h / 2, 34, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEnemies() {
  for (const e of enemies) {
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    ctx.rotate(Math.PI);
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.moveTo(0, -e.h / 2);
    ctx.lineTo(e.w / 2, e.h / 2);
    ctx.lineTo(0, e.h / 3);
    ctx.lineTo(-e.w / 2, e.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // mini hp bar
    if (e.hp < e.maxHp) {
      const pct = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(e.x, e.y - 7, e.w, 4);
      ctx.fillStyle = "#34d399";
      ctx.fillRect(e.x, e.y - 7, e.w * pct, 4);
    }
  }
}

function drawBoss() {
  if (!boss) return;
  const def = BOSS_TYPES.find((b) => b.key === boss.defKey);
  if (!def) return;
  ctx.save();
  ctx.shadowColor = boss.color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = def.fill;
  ctx.strokeStyle = boss.color;
  ctx.lineWidth = 2;
  def.draw(ctx, boss);
  ctx.restore();
}

function drawBullets() {
  for (const b of bullets) {
    ctx.fillStyle = b.color || "#4dd0ff";
    if (b.pierceLeft !== undefined) {
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    } else if (b.homing) {
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
  }
  for (const b of enemyBullets) {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, (b.w || 8) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPowerups() {
  for (const p of powerups) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#05060f";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.label, 0, 1);
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBanners() {
  let offsetY = H / 2 - 60;
  for (const b of banners) {
    ctx.globalAlpha = clamp(b.life / b.maxLife + 0.2, 0, 1);
    ctx.fillStyle = b.color;
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 16;
    ctx.fillText(b.text, W / 2, offsetY);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    offsetY += 38;
  }
}

/* ============================== HUD ============================== */

function updateHud() {
  el.hpFill.style.width = `${clamp((player.hp / player.maxHp) * 100, 0, 100)}%`;
  el.hpFill.style.background =
    player.hp / player.maxHp < 0.3
      ? "linear-gradient(90deg, #ef4444, #f87171)"
      : "";
  el.score.textContent = score;
  el.wave.textContent = wave;
  el.weaponName.textContent = WEAPON_DEFS[player.activeWeapon].name;
  el.weaponLvl.textContent = player.weapons[player.activeWeapon].level;
  if (boss) {
    el.bossFill.style.width = `${clamp((boss.hp / boss.maxHp) * 100, 0, 100)}%`;
  }
}

/* ============================== Main loop ============================== */

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(50, now - lastTime);
  lastTime = now;

  updateStars(dt);

  if (state === "playing") {
    updatePlayer(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updatePowerups(dt);
    updateParticles(dt);
    updateBanners(dt);

    if (!boss && enemiesToSpawn <= 0 && enemiesAlive <= 0 && !waveTransitioning) {
      waveTransitioning = true;
      if (isBossWave(wave)) {
        flash("БОСС ПРИБЛИЖАЕТСЯ", "#ff3b5c", 1100);
        setTimeout(() => {
          if (state === "playing") spawnBoss();
        }, 1200);
      } else {
        flash(`ВОЛНА ${wave} ПРОЙДЕНА`, "#34d399", 1300);
        setTimeout(() => {
          if (state === "playing") advanceToNextWave();
        }, 1400);
      }
    }
    if (boss) updateBoss(dt);

    updateHud();
  }

  drawStars();
  drawParticles();
  drawPowerups();
  if (state === "playing" || state === "paused") {
    drawEnemies();
    drawBoss();
    drawBullets();
    drawPlayer();
  }
  drawBanners();

  requestAnimationFrame(loop);
}

/* ============================== Input ============================== */

window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === " ") e.preventDefault();
  if (e.key.toLowerCase() === "p") togglePause();
  if (state === "playing" && (e.key === "1" || e.key === "2" || e.key === "3")) {
    switchWeapon(e.key);
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

function togglePause() {
  if (state === "playing") {
    state = "paused";
    el.pauseScreen.hidden = false;
  } else if (state === "paused") {
    state = "playing";
    el.pauseScreen.hidden = true;
  }
}

/* ============================== Screen buttons ============================== */

el.startBtn.addEventListener("click", () => {
  el.startScreen.hidden = true;
  resetGame();
  state = "playing";
});

el.resumeBtn.addEventListener("click", togglePause);

el.restartBtn.addEventListener("click", () => {
  el.gameoverScreen.hidden = true;
  resetGame();
  state = "playing";
});

el.nextLevelBtn.addEventListener("click", () => {
  el.winScreen.hidden = true;
  advanceToNextWave();
  state = "playing";
});

/* ============================== Boot ============================== */

initStars();
requestAnimationFrame(loop);
