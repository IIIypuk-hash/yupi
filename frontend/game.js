"use strict";

/* ============================== Setup ============================== */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const el = {
  hpFill: document.getElementById("hp-fill"),
  ultFill: document.getElementById("ult-fill"),
  ultBarWrap: document.getElementById("ult-bar-wrap"),
  ultLabel: document.getElementById("ult-label"),
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
let mines = [];
let enemies = [];
let powerups = [];
let particles = [];
let shockwaves = [];
let lightningArcs = [];
let beamEffects = [];
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

let shakeTime = 0;
let shakeTotal = 0;
let shakeMag = 0;

function triggerScreenShake(mag, durationMs) {
  if (durationMs >= shakeTime || mag > shakeMag) {
    shakeMag = Math.max(shakeMag, mag);
    shakeTime = durationMs;
    shakeTotal = durationMs;
  }
}

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
      lightning: { owned: false, level: 0 },
      mines: { owned: false, level: 0 },
    },
    activeWeapon: "cannon",
    fireCooldown: 0,
    shieldTimer: 0,
    rapidTimer: 0,
    invulnTimer: 1200, // brief spawn invulnerability
    ultimateCharge: 0,
    ultimateReadyFlashed: false,
  };
}

function resetGame() {
  player = newPlayer();
  bullets = [];
  enemyBullets = [];
  mines = [];
  enemies = [];
  powerups = [];
  particles = [];
  shockwaves = [];
  lightningArcs = [];
  beamEffects = [];
  banners = [];
  boss = null;
  lastBossKey = null;
  wave = 1;
  score = 0;
  shakeTime = 0;
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

/* ============================== Damage helpers ============================== */

function damageEnemy(e, dmg) {
  let d = dmg;
  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, d);
    e.shield -= absorbed;
    d -= absorbed;
    e.shieldRegenCooldown = 3000;
  }
  if (d > 0) e.hp -= d;
  e.hitFlash = 100;
}

function damageBoss(dmg) {
  if (!boss) return;
  boss.hp -= dmg;
  boss.hitFlash = 100;
}

/* ============================== Enemies ============================== */

const ENEMY_TYPES = {
  drone: { w: 30, h: 26, hp: 20, speed: 90, score: 10, color: "#ff6b6b", shoots: false },
  shooter: { w: 34, h: 30, hp: 35, speed: 60, score: 15, color: "#ffb347", shoots: true },
  zigzag: { w: 28, h: 24, hp: 25, speed: 140, score: 20, color: "#c084fc", shoots: false },
  shielded: { w: 34, h: 30, hp: 18, speed: 70, score: 24, color: "#60a5fa", shoots: false, shieldMax: 32 },
  kamikaze: { w: 26, h: 22, hp: 14, speed: 110, score: 18, color: "#f97316", shoots: false, contactDamage: 30 },
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
    contactDamage: def.contactDamage || 18,
    shield: def.shieldMax || 0,
    shieldMax: def.shieldMax || 0,
    shieldRegenCooldown: 0,
    diving: false,
    vx: 0,
    vy: 0,
    hitFlash: 0,
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
    contactDamage: 18,
    shield: 0,
    shieldMax: 0,
    shieldRegenCooldown: 0,
    diving: false,
    vx: 0,
    vy: 0,
    hitFlash: 0,
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
    if (e.hitFlash > 0) e.hitFlash -= dt;

    if (e.shieldMax) {
      if (e.shieldRegenCooldown > 0) e.shieldRegenCooldown -= dt;
      else if (e.shield < e.shieldMax) {
        e.shield = Math.min(e.shieldMax, e.shield + (e.shieldMax / 4) * (dt / 1000));
      }
    }

    if (e.type === "zigzag") {
      e.y += e.speed * (dt / 1000);
      e.x += Math.sin(e.t * 4) * 160 * (dt / 1000);
    } else if (e.type === "kamikaze") {
      if (!e.diving && e.y > 40) {
        e.diving = true;
        const dx = player.x + player.w / 2 - (e.x + e.w / 2);
        const dy = Math.max(200, player.y - e.y);
        const len = Math.hypot(dx, dy) || 1;
        const diveSpeed = e.speed * 1.7;
        e.vx = (dx / len) * diveSpeed;
        e.vy = (dy / len) * diveSpeed;
      }
      if (e.diving) {
        e.x += e.vx * (dt / 1000);
        e.y += e.vy * (dt / 1000);
      } else {
        e.y += e.speed * (dt / 1000);
      }
    } else {
      e.y += e.speed * (dt / 1000);
    }
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
      damagePlayer(e.contactDamage);
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
        damageEnemy(e, b.dmg);
        spawnExplosion(b.x, b.y, b.color || "#4dd0ff", b.splash ? 12 : 4);
        if (b.splash) {
          dealSplashDamage(b.x, b.y, b.splash, b.dmg * 0.5, e.id, true);
          spawnShockwave(b.x, b.y, b.splash, "#ffb347");
        }

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
  lightning: {
    name: "Молния",
    color: "#facc15",
    fireRate: [380, 280, 190],
    dmg: [10, 13, 17],
    jumps: [2, 3, 5],
    range: 230,
  },
  mines: {
    name: "Мины",
    color: "#34d399",
    fireRate: [900, 700, 520],
    dmg: [26, 34, 44],
    radius: [55, 68, 80],
    armTime: [280, 260, 240],
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

function fireLightning(dmg, maxJumps, range) {
  let cx = player.x + player.w / 2;
  let cy = player.y;
  const hitIds = new Set();
  for (let j = 0; j < maxJumps; j++) {
    let best = null;
    let bestD = Infinity;
    let bestIsBoss = false;
    for (const e of enemies) {
      if (hitIds.has(e.id)) continue;
      const d = (e.x + e.w / 2 - cx) ** 2 + (e.y + e.h / 2 - cy) ** 2;
      if (d < range * range && d < bestD) {
        bestD = d;
        best = e;
        bestIsBoss = false;
      }
    }
    if (boss && !hitIds.has("boss")) {
      const d = (boss.x + boss.w / 2 - cx) ** 2 + (boss.y + boss.h / 2 - cy) ** 2;
      if (d < range * range && d < bestD) {
        bestD = d;
        best = boss;
        bestIsBoss = true;
      }
    }
    if (!best) break;
    const tx = bestIsBoss ? boss.x + boss.w / 2 : best.x + best.w / 2;
    const ty = bestIsBoss ? boss.y + boss.h / 2 : best.y + best.h / 2;
    lightningArcs.push({ x1: cx, y1: cy, x2: tx, y2: ty, life: 180, maxLife: 180 });
    if (bestIsBoss) {
      damageBoss(dmg);
      hitIds.add("boss");
    } else {
      damageEnemy(best, dmg);
      hitIds.add(best.id);
      spawnExplosion(tx, ty, "#facc15", 6);
    }
    cx = tx;
    cy = ty;
  }
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
  } else if (w === "lightning") {
    const def = WEAPON_DEFS.lightning;
    fireLightning(def.dmg[lvl - 1], def.jumps[lvl - 1], def.range);
  } else if (w === "mines") {
    const def = WEAPON_DEFS.mines;
    mines.push({
      x: cx - 9,
      y: player.y + player.h - 6,
      w: 18,
      h: 18,
      armed: false,
      armTimer: def.armTime[lvl - 1],
      radius: def.radius[lvl - 1],
      dmg: def.dmg[lvl - 1],
      life: 6000,
    });
  }
}

function switchWeapon(numKey) {
  const map = { 1: "cannon", 2: "laser", 3: "missile", 4: "lightning", 5: "mines" };
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

/* ============================== Mines ============================== */

function updateMines(dt) {
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.life -= dt;
    if (!m.armed) {
      m.armTimer -= dt;
      if (m.armTimer <= 0) m.armed = true;
    }
    if (m.life <= 0) {
      mines.splice(i, 1);
      continue;
    }
    if (m.armed) {
      const mcx = m.x + m.w / 2;
      const mcy = m.y + m.h / 2;
      let triggered = false;
      for (const e of enemies) {
        const dx = e.x + e.w / 2 - mcx;
        const dy = e.y + e.h / 2 - mcy;
        if (dx * dx + dy * dy <= m.radius * m.radius) {
          triggered = true;
          break;
        }
      }
      if (!triggered && boss) {
        const dx = boss.x + boss.w / 2 - mcx;
        const dy = boss.y + boss.h / 2 - mcy;
        if (dx * dx + dy * dy <= m.radius * m.radius) triggered = true;
      }
      if (triggered) {
        dealSplashDamage(mcx, mcy, m.radius, m.dmg, null, true);
        spawnShockwave(mcx, mcy, m.radius, "#34d399");
        spawnExplosion(mcx, mcy, "#34d399", 26);
        triggerScreenShake(7, 240);
        mines.splice(i, 1);
      }
    }
  }
}

function drawMines() {
  for (const m of mines) {
    const cx = m.x + m.w / 2;
    const cy = m.y + m.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (m.armed) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
      ctx.globalAlpha = 0.5 + pulse * 0.4;
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, m.radius * (0.15 + pulse * 0.05), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = m.armed ? "#34d399" : "#1e6b4f";
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }
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

// ---- Ultimate (telegraphed, heavy) attacks ----

function dreadnoughtUltimate(b) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h;
  const count = 16;
  for (let i = 0; i < count; i++) {
    const angle = Math.PI / 2 + (i - (count - 1) / 2) * 0.13;
    enemyBullets.push({
      x: cx - 4, y: cy,
      vx: Math.cos(angle) * 260, vy: Math.sin(angle) * 260,
      w: 9, h: 9, dmg: 15, color: b.color,
    });
  }
  const thisBoss = b;
  const dx0 = player.x + player.w / 2 - cx;
  const dy0 = player.y + player.h / 2 - cy;
  const len0 = Math.hypot(dx0, dy0) || 1;
  for (let i = 0; i < 4; i++) {
    setTimeout(() => {
      if (boss !== thisBoss || state !== "playing") return;
      enemyBullets.push({
        x: cx - 4, y: cy,
        vx: (dx0 / len0) * 340, vy: (dy0 / len0) * 340,
        w: 9, h: 9, dmg: 17, color: "#ff8a5c",
      });
    }, i * 140);
  }
}

function hiveUltimate(b) {
  for (let i = 0; i < 5; i++) spawnMinion(b.x + rand(10, b.w - 40), b.y + b.h, 10);
  laserSweepAttack(b);
}

function cruiserUltimate(b) {
  ringBurstAttack(b);
  const thisBoss = b;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h;
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      if (boss !== thisBoss || state !== "playing") return;
      const dx = player.x + player.w / 2 - cx;
      const dy = player.y + player.h / 2 - cy;
      const angle = Math.atan2(dy, dx) + (i - 2.5) * 0.22;
      enemyBullets.push({
        x: cx - 4, y: cy,
        vx: Math.cos(angle) * 170, vy: Math.sin(angle) * 170,
        w: 8, h: 8, dmg: 17, color: "#ffb347",
        homing: true, turnRate: 2.6,
      });
    }, i * 130);
  }
}

function prepareSentinelUltimate() {
  const variants = ["columns", "sweepDown", "doubleSweep"];
  const variant = variants[Math.floor(rand(0, variants.length))];
  if (variant === "columns") {
    const xs = [];
    for (let i = 0; i < 3; i++) xs.push(rand(70, W - 70));
    return { variant, xs };
  }
  return { variant };
}

function sentinelUltimate(b, data) {
  const d = data || prepareSentinelUltimate();
  if (d.variant === "columns") {
    for (const x of d.xs) {
      enemyBullets.push({ x: x - 9, y: 0, w: 18, h: H, vx: 0, vy: 0, dmg: 26, color: "#38bdf8", ttl: 550 });
    }
  } else if (d.variant === "sweepDown") {
    enemyBullets.push({ x: 0, y: -30, w: W, h: 28, vx: 0, vy: 260, dmg: 22, color: "#38bdf8" });
  } else if (d.variant === "doubleSweep") {
    enemyBullets.push({ x: 0, y: -30, w: W, h: 26, vx: 0, vy: 240, dmg: 20, color: "#38bdf8" });
    enemyBullets.push({ x: 0, y: H + 30, w: W, h: 26, vx: 0, vy: -240, dmg: 20, color: "#38bdf8" });
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
    baseHp: 950,
    hpPerTier: 480,
    speed: 90,
    patterns: [fanSpreadAttack, aimedBurstAttack, dreadnoughtUltimate],
    cooldowns: [1500, 2200, 5000],
    ultimateName: "ОРБИТАЛЬНЫЙ УДАР",
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
      ctx2.beginPath();
      ctx2.arc(b.x + b.w / 2, b.y + b.h * 0.55, 10, 0, Math.PI * 2);
      ctx2.fillStyle = "#ffdfe6";
      ctx2.fill();
    },
  },
  {
    key: "hive",
    name: "УЛЕЙ",
    color: "#a463ff",
    fill: "#2e1a4d",
    w: 160,
    h: 90,
    baseHp: 1100,
    hpPerTier: 540,
    speed: 70,
    patterns: [spawnDronesAttack, laserSweepAttack, hiveUltimate],
    cooldowns: [2600, 1800, 5200],
    ultimateName: "ПРОБУЖДЕНИЕ РОЯ",
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
      for (const off of [-0.22, 0, 0.22]) {
        ctx2.beginPath();
        ctx2.arc(b.x + b.w * (0.5 + off), b.y + b.h * 0.5, 7, 0, Math.PI * 2);
        ctx2.fillStyle = "#ecdcff";
        ctx2.fill();
      }
    },
  },
  {
    key: "cruiser",
    name: "КРЕЙСЕР",
    color: "#ffb347",
    fill: "#4a2f10",
    w: 170,
    h: 80,
    baseHp: 1150,
    hpPerTier: 560,
    speed: 100,
    patterns: [ringBurstAttack, missileVolleyAttack, cruiserUltimate],
    cooldowns: [2400, 2000, 5400],
    ultimateName: "РАКЕТНЫЙ ШКВАЛ",
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
      ctx2.fillStyle = "#fff3df";
      ctx2.fillRect(b.x + b.w * 0.42, b.y + b.h * 0.35, b.w * 0.16, b.h * 0.35);
    },
  },
  {
    key: "sentinel",
    name: "СТРАЖ",
    color: "#38bdf8",
    fill: "#0c2f42",
    w: 150,
    h: 112,
    baseHp: 1250,
    hpPerTier: 600,
    speed: 80,
    patterns: [aimedBurstAttack, ringBurstAttack, sentinelUltimate],
    cooldowns: [1800, 2200, 6000],
    ultimateName: "ПРОБОЙ РЕАЛЬНОСТИ",
    ultimateTelegraphMs: 1300,
    prepareUltimate: prepareSentinelUltimate,
    draw(ctx2, b) {
      ctx2.beginPath();
      ctx2.moveTo(b.x + b.w * 0.5, b.y);
      ctx2.lineTo(b.x + b.w * 0.85, b.y + b.h * 0.35);
      ctx2.lineTo(b.x + b.w * 0.7, b.y + b.h);
      ctx2.lineTo(b.x + b.w * 0.3, b.y + b.h);
      ctx2.lineTo(b.x + b.w * 0.15, b.y + b.h * 0.35);
      ctx2.closePath();
      ctx2.fill();
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.arc(b.x + b.w / 2, b.y + b.h * 0.4, 12, 0, Math.PI * 2);
      ctx2.fillStyle = "#d6f3ff";
      ctx2.fill();
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
    telegraph: null,
    hitFlash: 0,
  };
  el.bossHud.hidden = false;
  el.bossName.textContent = def.name;
  flash(`БОСС: ${def.name}`, def.color, 2200);
}

function startTelegraph(b) {
  const def = BOSS_TYPES.find((x) => x.key === b.defKey);
  const ms = def.ultimateTelegraphMs || 1100;
  b.telegraph = {
    timer: ms,
    total: ms,
    data: def.prepareUltimate ? def.prepareUltimate(b) : null,
  };
  flash(`⚠ ${def.ultimateName} ⚠`, b.color, ms);
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

  if (boss.hitFlash > 0) boss.hitFlash -= dt;

  boss.x += boss.dir * boss.speed * (dt / 1000);
  if (boss.x < 20 || boss.x > W - boss.w - 20) boss.dir *= -1;

  if (boss.telegraph) {
    boss.telegraph.timer -= dt;
    if (boss.telegraph.timer <= 0) {
      const fn = boss.patterns[boss.pattern];
      fn(boss, boss.telegraph.data);
      triggerScreenShake(14, 380);
      boss.telegraph = null;
      boss.pattern = (boss.pattern + 1) % boss.patterns.length;
      boss.attackTimer = boss.cooldowns[boss.pattern];
    }
  } else {
    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0) {
      if (boss.pattern === boss.patterns.length - 1) {
        startTelegraph(boss);
      } else {
        boss.patterns[boss.pattern](boss);
        boss.pattern = (boss.pattern + 1) % boss.patterns.length;
        boss.attackTimer = boss.cooldowns[boss.pattern];
      }
    }
  }

  // bullet collisions
  for (let j = bullets.length - 1; j >= 0; j--) {
    const b = bullets[j];
    if (aabb(b, boss)) {
      damageBoss(b.dmg);
      spawnExplosion(b.x, b.y, b.color || "#4dd0ff", b.splash ? 14 : 4);
      if (b.splash) {
        dealSplashDamage(b.x, b.y, b.splash, b.dmg * 0.5, null, false);
        spawnShockwave(b.x, b.y, b.splash, "#ffb347");
      }
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
    spawnShockwave(bx, by, 90, boss.color);
    triggerScreenShake(16, 500);
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
      damageEnemy(e, dmg);
      spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.color, 6);
    }
  }
  if (hitBoss && boss) {
    const dx = boss.x + boss.w / 2 - x;
    const dy = boss.y + boss.h / 2 - y;
    if (dx * dx + dy * dy <= radius * radius) damageBoss(dmg);
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
    if (b.ttl !== undefined) {
      b.ttl -= dt;
      if (player.invulnTimer <= 0 && aabb(b, player)) {
        damagePlayer(b.dmg);
        spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, b.color, 6);
      }
      if (b.ttl <= 0) enemyBullets.splice(i, 1);
      continue;
    }
    if (b.homing) applyHoming(b, dt, player.x + player.w / 2, player.y + player.h / 2);
    b.x += b.vx * (dt / 1000);
    b.y += b.vy * (dt / 1000);
    if (b.y > H + 20 || b.y < -30 || b.x < -30 || b.x > W + 30) {
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
  { type: "weapon_lightning", color: "#facc15", label: "Z" },
  { type: "weapon_mines", color: "#34d399", label: "X" },
  { type: "heal", color: "#34d399", label: "+" },
  { type: "shield", color: "#facc15", label: "S" },
  { type: "rapid", color: "#f472b6", label: "R" },
];

function maybeDropPowerup(x, y) {
  if (Math.random() > 0.32) return;
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

/* ============================== Player ultimates ============================== */

const ULTIMATE_DEFS = {
  cannon: {
    name: "ОРБИТАЛЬНЫЙ ШТОРМ",
    color: "#4dd0ff",
    shake: 9,
    effect() {
      for (let i = 0; i < 22; i++) {
        setTimeout(() => {
          if (state !== "playing") return;
          bullets.push(mkCannonBullet(rand(20, W - 20), -10, rand(-30, 30), 24));
        }, i * 45);
      }
    },
  },
  laser: {
    name: "ЛУЧ СУДНОГО ДНЯ",
    color: "#ff5df2",
    shake: 11,
    effect() {
      const beamX = player.x + player.w / 2;
      const beamW = 34;
      const dmg = 70;
      for (const e of enemies) {
        if (Math.abs(e.x + e.w / 2 - beamX) < beamW / 2 + e.w / 2) {
          damageEnemy(e, dmg);
          spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, "#ff5df2", 10);
        }
      }
      if (boss && Math.abs(boss.x + boss.w / 2 - beamX) < beamW / 2 + boss.w / 2) {
        damageBoss(dmg * 1.3);
      }
      beamEffects.push({ x: beamX - beamW / 2, w: beamW, life: 420, maxLife: 420, color: "#ff5df2" });
    },
  },
  missile: {
    name: "РАКЕТНЫЙ АД",
    color: "#ffb347",
    shake: 11,
    effect() {
      const cx = player.x + player.w / 2;
      for (let i = 0; i < 9; i++) {
        setTimeout(() => {
          if (state !== "playing") return;
          bullets.push(mkMissile(cx + rand(-30, 30), player.y, 46, 72));
        }, i * 90);
      }
    },
  },
  lightning: {
    name: "ГРОЗОВОЙ РАЗРЯД",
    color: "#facc15",
    shake: 13,
    effect() {
      const dmg = 34;
      const origin = { x: player.x + player.w / 2, y: player.y };
      for (const e of enemies.slice()) {
        damageEnemy(e, dmg);
        lightningArcs.push({ x1: origin.x, y1: origin.y, x2: e.x + e.w / 2, y2: e.y + e.h / 2, life: 260, maxLife: 260 });
        spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, "#facc15", 8);
      }
      if (boss) {
        damageBoss(dmg * 1.4);
        lightningArcs.push({ x1: origin.x, y1: origin.y, x2: boss.x + boss.w / 2, y2: boss.y + boss.h / 2, life: 260, maxLife: 260 });
      }
    },
  },
  mines: {
    name: "КОВРОВОЕ ЗАМИНИРОВАНИЕ",
    color: "#34d399",
    shake: 7,
    effect() {
      for (let i = 0; i < 6; i++) {
        mines.push({
          x: (W / 6) * i + 20, y: player.y - 10, w: 18, h: 18,
          armed: true, armTimer: 0, radius: 62, dmg: 30, life: 4500,
        });
      }
    },
  },
};

function useUltimate() {
  if (!player || player.ultimateCharge < 100) return;
  player.ultimateCharge = 0;
  player.ultimateReadyFlashed = false;
  const def = ULTIMATE_DEFS[player.activeWeapon];
  flash(`★ ${def.name} ★`, def.color, 1500);
  triggerScreenShake(def.shake, 420);
  player.invulnTimer = Math.max(player.invulnTimer, 500);
  def.effect();
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

  if (player.ultimateCharge < 100) {
    player.ultimateCharge = clamp(player.ultimateCharge + dt * 0.005, 0, 100);
  }
  if (player.ultimateCharge >= 100 && !player.ultimateReadyFlashed) {
    player.ultimateReadyFlashed = true;
    flash("СУПЕРУДАР ГОТОВ — [E]", "#fde68a", 1300);
  }

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

function spawnShockwave(x, y, maxR, color) {
  shockwaves.push({ x, y, r: 4, maxR, life: 420, maxLife: 420, color });
}

function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.life -= dt;
    if (s.life <= 0) {
      shockwaves.splice(i, 1);
      continue;
    }
    const t = 1 - s.life / s.maxLife;
    s.r = 4 + (s.maxR - 4) * t;
  }
}

function drawShockwaves() {
  for (const s of shockwaves) {
    ctx.globalAlpha = clamp(s.life / s.maxLife, 0, 1) * 0.8;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function updateLightningArcs(dt) {
  for (let i = lightningArcs.length - 1; i >= 0; i--) {
    lightningArcs[i].life -= dt;
    if (lightningArcs[i].life <= 0) lightningArcs.splice(i, 1);
  }
}

function drawLightningArcs() {
  for (const a of lightningArcs) {
    ctx.globalAlpha = clamp(a.life / a.maxLife, 0, 1);
    ctx.strokeStyle = "#facc15";
    ctx.shadowColor = "#facc15";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    const segs = 5;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const mx = a.x1 + (a.x2 - a.x1) * t + rand(-10, 10);
      const my = a.y1 + (a.y2 - a.y1) * t + rand(-10, 10);
      ctx.lineTo(mx, my);
    }
    ctx.lineTo(a.x2, a.y2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function updateBeamEffects(dt) {
  for (let i = beamEffects.length - 1; i >= 0; i--) {
    beamEffects[i].life -= dt;
    if (beamEffects[i].life <= 0) beamEffects.splice(i, 1);
  }
}

function drawBeamEffects() {
  for (const b of beamEffects) {
    ctx.save();
    ctx.globalAlpha = clamp(b.life / b.maxLife, 0, 1) * 0.85;
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 24;
    ctx.fillRect(b.x, 0, b.w, H);
    ctx.restore();
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
  if (player.ultimateCharge >= 100) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 100);
    ctx.strokeStyle = `rgba(253,230,138,${0.4 + pulse * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x + player.w / 2, player.y + player.h / 2, 26 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEnemies() {
  for (const e of enemies) {
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    ctx.rotate(Math.PI);
    ctx.fillStyle = e.hitFlash > 0 ? "#ffffff" : e.color;
    ctx.beginPath();
    ctx.moveTo(0, -e.h / 2);
    ctx.lineTo(e.w / 2, e.h / 2);
    ctx.lineTo(0, e.h / 3);
    ctx.lineTo(-e.w / 2, e.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (e.shieldMax && e.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.35 * (e.shield / e.shieldMax);
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x + e.w / 2, e.y + e.h / 2, Math.max(e.w, e.h) / 2 + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

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
  const charging = !!boss.telegraph;
  const pulse = charging ? 0.5 + 0.5 * Math.sin(performance.now() / 55) : 0;
  ctx.shadowColor = charging ? "#ffffff" : boss.color;
  ctx.shadowBlur = charging ? 28 + pulse * 22 : 24;
  ctx.fillStyle = boss.hitFlash > 0 ? "#ffffff" : def.fill;
  ctx.strokeStyle = charging ? `rgba(255,255,255,${0.6 + pulse * 0.4})` : boss.color;
  ctx.lineWidth = charging ? 3 : 2;
  def.draw(ctx, boss);
  ctx.restore();
}

function drawTelegraphs() {
  if (!boss || !boss.telegraph || !boss.telegraph.data) return;
  const d = boss.telegraph.data;
  const pulse = 0.35 + 0.25 * Math.sin(performance.now() / 70);
  ctx.save();
  ctx.globalAlpha = clamp(pulse, 0.15, 0.6);
  ctx.fillStyle = "#38bdf8";
  if (d.variant === "columns") {
    for (const x of d.xs) ctx.fillRect(x - 9, 0, 18, H);
  } else if (d.variant === "sweepDown") {
    ctx.fillRect(0, 0, W, 28);
  } else if (d.variant === "doubleSweep") {
    ctx.fillRect(0, 0, W, 26);
    ctx.fillRect(0, H - 26, W, 26);
  }
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
    if (b.ttl !== undefined || b.w > 20 || b.h > 20) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 14;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.restore();
      continue;
    }
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

  el.ultFill.style.width = `${clamp(player.ultimateCharge, 0, 100)}%`;
  if (player.ultimateCharge >= 100) {
    el.ultBarWrap.classList.add("ready");
    el.ultLabel.textContent = "E!";
  } else {
    el.ultBarWrap.classList.remove("ready");
    el.ultLabel.textContent = "УЛЬТ";
  }

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

function updateShake(dt) {
  if (shakeTime > 0) {
    shakeTime -= dt;
    if (shakeTime <= 0) shakeMag = 0;
  }
}

function loop(now) {
  const dt = Math.min(50, now - lastTime);
  lastTime = now;

  updateStars(dt);
  updateShake(dt);

  if (state === "playing") {
    updatePlayer(dt);
    updateBullets(dt);
    updateMines(dt);
    updateEnemies(dt);
    updatePowerups(dt);
    updateParticles(dt);
    updateShockwaves(dt);
    updateLightningArcs(dt);
    updateBeamEffects(dt);
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

  ctx.save();
  if (shakeTime > 0 && shakeTotal > 0) {
    const amt = shakeMag * (shakeTime / shakeTotal);
    ctx.translate(rand(-amt, amt), rand(-amt, amt));
  }

  drawStars();
  drawShockwaves();
  drawParticles();
  drawPowerups();
  drawMines();
  if (state === "playing" || state === "paused") {
    drawEnemies();
    drawBoss();
    drawTelegraphs();
    drawBullets();
    drawBeamEffects();
    drawLightningArcs();
    drawPlayer();
  }
  ctx.restore();

  drawBanners();

  requestAnimationFrame(loop);
}

/* ============================== Input ============================== */

window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === " ") e.preventDefault();
  if (e.key.toLowerCase() === "p") togglePause();
  if (state === "playing" && ["1", "2", "3", "4", "5"].includes(e.key)) {
    switchWeapon(e.key);
  }
  if (state === "playing" && (e.code === "KeyE" || e.key.toLowerCase() === "e")) {
    useUltimate();
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
