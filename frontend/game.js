"use strict";

/* ============================== Setup ============================== */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const el = {
  hpFill: document.getElementById("hp-fill"),
  bossHud: document.getElementById("boss-hud"),
  bossFill: document.getElementById("boss-fill"),
  score: document.getElementById("score"),
  wave: document.getElementById("wave"),
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
let bossWarned = false;
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
    weaponLevel: 1,
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
  wave = 1;
  score = 0;
  startWave();
  initStars();
}

function startWave() {
  enemiesRequired = 6 + wave * 3;
  enemiesToSpawn = enemiesRequired;
  enemiesAlive = 0;
  enemiesDefeated = 0;
  spawnTimer = 0;
  bossWarned = false;
  boss = null;
  enemyBullets = [];
  el.bossHud.hidden = true;
  flash(`ВОЛНА ${wave}`, "#4dd0ff");
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

    // bullet collision
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (aabb(b, e)) {
        e.hp -= b.dmg;
        bullets.splice(j, 1);
        spawnExplosion(b.x, b.y, "#4dd0ff", 4);
        if (e.hp <= 0) {
          score += e.scoreValue;
          spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.color, 22);
          maybeDropPowerup(e.x + e.w / 2, e.y + e.h / 2);
          enemies.splice(i, 1);
          enemiesAlive--;
          enemiesDefeated++;
        }
        break;
      }
    }
  }
}

/* ============================== Boss ============================== */

function spawnBoss() {
  const hp = 900 + (wave - 1) * 500;
  boss = {
    x: W / 2 - 70,
    y: -160,
    w: 140,
    h: 100,
    hp,
    maxHp: hp,
    speed: 90,
    dir: 1,
    entering: true,
    attackTimer: 1200,
    pattern: 0,
    dmg: 22,
  };
  el.bossHud.hidden = false;
  flash("БОСС!", "#ff3b5c", 2000);
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
  if (boss.attackTimer <= 0) {
    bossAttack();
    boss.pattern = (boss.pattern + 1) % 2;
    boss.attackTimer = boss.pattern === 0 ? 1500 : 2200;
  }

  // bullet collisions
  for (let j = bullets.length - 1; j >= 0; j--) {
    const b = bullets[j];
    if (aabb(b, boss)) {
      boss.hp -= b.dmg;
      bullets.splice(j, 1);
      spawnExplosion(b.x, b.y, "#4dd0ff", 4);
      if (boss.hp <= 0) {
        score += 500 * wave;
        spawnExplosion(boss.x + boss.w / 2, boss.y + boss.h / 2, "#ff3b5c", 60);
        boss = null;
        winWave();
        return;
      }
    }
  }

  if (player.invulnTimer <= 0 && aabb(boss, player)) {
    damagePlayer(1); // constant contact chip damage, handled via timer below
  }
}

function bossAttack() {
  if (!boss) return;
  const cx = boss.x + boss.w / 2;
  const cy = boss.y + boss.h;

  if (boss.pattern === 0) {
    // fan spread
    const count = 7;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI / 2) + (i - (count - 1) / 2) * 0.22;
      enemyBullets.push({
        x: cx - 4,
        y: cy,
        vx: Math.cos(angle) * 240,
        vy: Math.sin(angle) * 240,
        w: 8,
        h: 8,
        dmg: 12,
        color: "#ff3b5c",
      });
    }
  } else {
    // aimed triple burst
    const dx = player.x + player.w / 2 - cx;
    const dy = player.y + player.h / 2 - cy;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (!boss || state !== "playing") return;
        enemyBullets.push({
          x: cx - 4,
          y: cy,
          vx: (dx / len) * 320,
          vy: (dy / len) * 320,
          w: 8,
          h: 8,
          dmg: 14,
          color: "#ff8a5c",
        });
      }, i * 160);
    }
  }
}

function winWave() {
  state = "win";
  el.winScore.textContent = score;
  el.winScreen.hidden = false;
}

/* ============================== Bullets ============================== */

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.y += b.vy * (dt / 1000);
    if (b.y < -20) bullets.splice(i, 1);
  }
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
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
  { type: "weapon", color: "#4dd0ff", label: "W" },
  { type: "heal", color: "#34d399", label: "+" },
  { type: "shield", color: "#facc15", label: "S" },
  { type: "rapid", color: "#f472b6", label: "R" },
];

function maybeDropPowerup(x, y) {
  if (Math.random() > 0.22) return;
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
  if (type === "weapon") {
    player.weaponLevel = clamp(player.weaponLevel + 1, 1, 3);
    flash("ОРУЖИЕ УЛУЧШЕНО", "#4dd0ff", 1200);
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
    const baseRate = [420, 260, 170][player.weaponLevel - 1];
    player.fireCooldown = player.rapidTimer > 0 ? baseRate * 0.5 : baseRate;
  }
}

function shoot() {
  const cx = player.x + player.w / 2;
  const top = player.y;
  const dmg = 10 + player.weaponLevel * 2;
  if (player.weaponLevel === 1) {
    bullets.push(mkBullet(cx - 2, top, 0, dmg));
  } else if (player.weaponLevel === 2) {
    bullets.push(mkBullet(cx - 10, top, 0, dmg));
    bullets.push(mkBullet(cx + 6, top, 0, dmg));
  } else {
    bullets.push(mkBullet(cx - 2, top, 0, dmg));
    bullets.push(mkBullet(cx - 14, top, -60, dmg));
    bullets.push(mkBullet(cx + 10, top, 60, dmg));
  }
}

function mkBullet(x, y, vx, dmg) {
  return { x, y, w: 4, h: 12, vx, vy: -560, dmg };
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
  drawShip(player.x, player.y, player.w, player.h, "#4dd0ff", "#4dd0ff");
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
  ctx.save();
  ctx.shadowColor = "#ff3b5c";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#5b1030";
  ctx.beginPath();
  ctx.moveTo(boss.x + boss.w / 2, boss.y + boss.h);
  ctx.lineTo(boss.x + boss.w, boss.y + boss.h * 0.2);
  ctx.lineTo(boss.x + boss.w * 0.7, boss.y);
  ctx.lineTo(boss.x + boss.w * 0.3, boss.y);
  ctx.lineTo(boss.x, boss.y + boss.h * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ff3b5c";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawBullets() {
  ctx.fillStyle = "#4dd0ff";
  for (const b of bullets) {
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  for (const b of enemyBullets) {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.w / 2, 0, Math.PI * 2);
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
    const alpha = clamp(b.life / 300, 0, 1) * clamp((b.maxLife - (b.maxLife - b.life)) / b.maxLife + 0.3, 0, 1);
    ctx.globalAlpha = clamp(b.life / b.maxLife + 0.2, 0, 1);
    ctx.fillStyle = b.color;
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 16;
    ctx.fillText(b.text, W / 2, offsetY);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    offsetY += 40;
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
  el.weaponLvl.textContent = player.weaponLevel;
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

    if (!boss && enemiesToSpawn <= 0 && enemiesAlive <= 0 && !bossWarned) {
      bossWarned = true;
      setTimeout(() => {
        if (state === "playing") spawnBoss();
      }, 1200);
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
  wave++;
  player.hp = clamp(player.hp + 25, 0, player.maxHp);
  bullets = [];
  enemyBullets = [];
  enemies = [];
  powerups = [];
  startWave();
  state = "playing";
});

/* ============================== Boot ============================== */

initStars();
requestAnimationFrame(loop);
