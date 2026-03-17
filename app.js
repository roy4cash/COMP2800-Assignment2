(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  const canvas = $('#myCanvas');
  const ctx = canvas.getContext('2d');

  const btnStart = $('[data-action="start"]');
  const btnPause = $('[data-action="pause"]');
  const btnReset = $('[data-action="reset"]');
  const btnMute = $('[data-action="mute"]');
  const btnFullscreen = $('[data-action="fullscreen"]');
  const btnOpenSettings = $('[data-action="open-settings"]');

  const outScore = $('#score');
  const outLevel = $('#level');
  const outLives = $('#lives');
  const outShield = $('#shield');
  const outFps = $('#fps');
  const outTime = $('#time');

  const settingsDialog = $('#settingsDialog');
  const pauseDialog = $('#pauseDialog');

  const sfxShoot = $('#sfxShoot');
  const sfxExplosion = $('#sfxExplosion');
  const bgMusic = $('#bgMusic');

  const BASE_WIDTH = 1024;
  const BASE_HEIGHT = 768;

  const SPRITE_PATH = 'spaceArt/png/';
  const BG_PATH = 'spaceArt/background/'; // CHANGE THIS if your folder name is different

  const settings = {
    difficulty: 'normal',
    graphics: 'high',
    musicVolume: 0.6,
    sfxVolume: 0.8,
    controlScheme: 'wasd',
    muted: false
  };

  const difficultyTable = {
    easy:   { enemyRate: 1.45, enemySpeed: 75,  maxEnemies: 10, enemyFireRate: 2.4 },
    normal: { enemyRate: 1.05, enemySpeed: 100, maxEnemies: 14, enemyFireRate: 1.8 },
    hard:   { enemyRate: 0.82, enemySpeed: 135, maxEnemies: 18, enemyFireRate: 1.35 },
    insane: { enemyRate: 0.62, enemySpeed: 175, maxEnemies: 24, enemyFireRate: 1.0 }
  };

  const graphicsTable = {
    low:    { glow: false, particles: 0.55, stars: 20 },
    medium: { glow: false, particles: 0.8,  stars: 32 },
    high:   { glow: true,  particles: 1.0,  stars: 45 },
    ultra:  { glow: true,  particles: 1.2,  stars: 60 }
  };

  function img(path) {
    const i = new Image();
    i.src = path;
    return i;
  }

  const assets = {
    background: {
      color: img(BG_PATH + 'backgroundColor.png'),
      nebula: img(BG_PATH + 'nebula.png'),
      speedLine: img(BG_PATH + 'speedLine.png'),
      starBackground: img(BG_PATH + 'starBackground.png'),
      starBig: img(BG_PATH + 'starBig.png'),
      starSmall: img(BG_PATH + 'starSmall.png')
    },

    player: img(SPRITE_PATH + 'player.png'),
    playerLeft: img(SPRITE_PATH + 'playerLeft.png'),
    playerRight: img(SPRITE_PATH + 'playerRight.png'),
    playerDamaged: img(SPRITE_PATH + 'playerDamaged.png'),

    enemyShip: img(SPRITE_PATH + 'enemyShip.png'),
    enemyUFO: img(SPRITE_PATH + 'enemyUFO.png'),

    laserGreen: img(SPRITE_PATH + 'laserGreen.png'),
    laserGreenShot: img(SPRITE_PATH + 'laserGreenShot.png'),
    laserRed: img(SPRITE_PATH + 'laserRed.png'),
    laserRedShot: img(SPRITE_PATH + 'laserRedShot.png'),

    life: img(SPRITE_PATH + 'life.png'),
    meteorBig: img(SPRITE_PATH + 'meteorBig.png'),
    meteorSmall: img(SPRITE_PATH + 'meteorSmall.png'),
    shield: img(SPRITE_PATH + 'shield.png')
  };

  function createInitialState() {
    return {
      running: false,
      paused: false,
      gameOver: false,
      lastTs: 0,
      fps: 0,
      frameCount: 0,
      frameTimer: 0,
      score: 0,
      level: 1,
      lives: 3,
      shield: 100,
      timeSec: 0,
      enemySpawnTimer: 0,
      fireCooldown: 0,
      specialCooldown: 0,
      screenShake: 0,
      flashTimer: 0,
      hitTimer: 0
    };
  }

  let state = createInitialState();

  const player = {
    x: BASE_WIDTH / 2,
    y: BASE_HEIGHT - 110,
    speed: 320,
    vx: 0,
    vy: 0,
    r: 24
  };

  const bullets = [];
  const enemyBullets = [];
  const enemies = [];
  const particles = [];

  function resizeCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(BASE_WIDTH * dpr);
    canvas.height = Math.floor(BASE_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const keys = new Set();

  window.addEventListener('keydown', (e) => {
    keys.add(e.key);

    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      togglePause();
    }

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFullscreen();
    }

    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.key);
  });

  btnStart?.addEventListener('click', startGame);
  btnPause?.addEventListener('click', togglePause);
  btnReset?.addEventListener('click', () => {
    resetGame();
    render();
  });
  btnMute?.addEventListener('click', toggleMute);
  btnFullscreen?.addEventListener('click', toggleFullscreen);
  btnOpenSettings?.addEventListener('click', () => settingsDialog?.showModal());

  settingsDialog?.addEventListener('close', () => {
    if (settingsDialog.returnValue !== 'apply') return;

    settings.difficulty = $('#difficulty')?.value || settings.difficulty;
    settings.graphics = $('#graphics')?.value || settings.graphics;
    settings.musicVolume = clamp01(Number($('#musicVolume')?.value || 60) / 100);
    settings.sfxVolume = clamp01(Number($('#sfxVolume')?.value || 80) / 100);
    settings.controlScheme = $('#controlScheme')?.value || settings.controlScheme;

    applyVolumes();
  });

  pauseDialog?.addEventListener('close', () => {
    const val = pauseDialog.returnValue;
    if (val === 'resume' && state.running && !state.gameOver) {
      togglePause(false);
    } else if (val === 'restart') {
      resetGame();
      startGame();
    }
  });

  function applyVolumes() {
    const mv = settings.muted ? 0 : settings.musicVolume;
    const sv = settings.muted ? 0 : settings.sfxVolume;

    if (bgMusic) bgMusic.volume = clamp01(mv);
    if (sfxShoot) sfxShoot.volume = clamp01(sv);
    if (sfxExplosion) sfxExplosion.volume = clamp01(sv);
  }

  applyVolumes();

  function toggleMute() {
    settings.muted = !settings.muted;
    btnMute?.setAttribute('aria-pressed', String(settings.muted));
    applyVolumes();
  }

  function startGame() {
    if (state.running && !state.paused) return;
    if (state.gameOver) resetGame();

    state.running = true;
    state.paused = false;
    state.lastTs = 0;

    bgMusic?.play?.().catch(() => {});
    requestAnimationFrame(loop);
  }

  function togglePause(force = null) {
    if (!state.running || state.gameOver) return;

    const next = force === null ? !state.paused : !!force;
    state.paused = next;

    if (state.paused) {
      if (!pauseDialog?.open) pauseDialog.showModal();
    } else {
      if (pauseDialog?.open) pauseDialog.close('resume');
      state.lastTs = 0;
      requestAnimationFrame(loop);
    }
  }

  function resetGame() {
    state = createInitialState();

    bullets.length = 0;
    enemyBullets.length = 0;
    enemies.length = 0;
    particles.length = 0;

    player.x = BASE_WIDTH / 2;
    player.y = BASE_HEIGHT - 110;
    player.vx = 0;
    player.vy = 0;

    updateHUD();
  }

  async function toggleFullscreen() {
    try {
      const target = $('#play') || canvas;
      if (!document.fullscreenElement) {
        await target.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {}
  }

  function loop(ts) {
    if (!state.running || state.paused || state.gameOver) return;

    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.033, (ts - state.lastTs) / 1000);
    state.lastTs = ts;

    state.frameTimer += dt;
    state.frameCount++;
    if (state.frameTimer >= 0.5) {
      state.fps = Math.round(state.frameCount / state.frameTimer);
      state.frameTimer = 0;
      state.frameCount = 0;
    }

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

  function update(dt) {
    state.timeSec += dt;
    state.flashTimer = Math.max(0, state.flashTimer - dt);
    state.screenShake = Math.max(0, state.screenShake - dt * 18);
    state.hitTimer = Math.max(0, state.hitTimer - dt);

    const controls = getControls();

    const mx = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const my = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);

    const mag = Math.hypot(mx, my) || 1;
    player.vx = (mx / mag) * player.speed;
    player.vy = (my / mag) * player.speed;

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.x = clamp(player.x, 40, BASE_WIDTH - 40);
    player.y = clamp(player.y, 60, BASE_HEIGHT - 60);

    state.fireCooldown -= dt;
    if (controls.fire && state.fireCooldown <= 0) {
      firePlayerBullet();
      state.fireCooldown = 0.16;
    }

    state.specialCooldown -= dt;
    if (controls.special && state.specialCooldown <= 0 && state.shield >= 25) {
      activateSmartBomb();
    }

    const diff = difficultyTable[settings.difficulty] || difficultyTable.normal;
    const levelFactor = 1 + (state.level - 1) * 0.09;
    const spawnRate = Math.max(0.24, diff.enemyRate / Math.min(levelFactor, 2.5));
    const enemySpeed = diff.enemySpeed * Math.min(levelFactor, 2.2);
    const maxEnemies = Math.round(diff.maxEnemies + (state.level - 1) * 1.4);
    const enemyFireRate = Math.max(0.45, diff.enemyFireRate / Math.min(levelFactor, 2.3));

    state.enemySpawnTimer -= dt;
    if (state.enemySpawnTimer <= 0 && enemies.length < maxEnemies) {
      spawnEnemy(enemySpeed, enemyFireRate);
      state.enemySpawnTimer = spawnRate;
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y -= b.speed * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y < -40) bullets.splice(i, 1);
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.y += b.speed * dt;
      b.life -= dt;

      if (dist2(b.x, b.y, player.x, player.y) < (b.r + player.r) * (b.r + player.r)) {
        enemyBullets.splice(i, 1);
        damagePlayer(18);
        continue;
      }

      if (b.life <= 0 || b.y > BASE_HEIGHT + 40) enemyBullets.splice(i, 1);
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];

      e.y += e.speed * dt;
      e.x += Math.sin(state.timeSec * e.wobbleSpeed + e.phase) * e.wobbleAmount * dt;
      e.fireTimer -= dt;

      if (e.canShoot && e.fireTimer <= 0) {
        fireEnemyBullet(e);
        e.fireTimer = e.baseFireRate + Math.random() * 0.8;
      }

      let hit = false;
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (dist2(e.x, e.y, b.x, b.y) < (e.r + b.r) * (e.r + b.r)) {
          bullets.splice(j, 1);
          e.hp -= 1;
          spawnHitSpark(b.x, b.y);
          hit = true;

          if (e.hp <= 0) {
            destroyEnemy(i, e);
          }
          break;
        }
      }
      if (hit) continue;

      if (dist2(e.x, e.y, player.x, player.y) < (e.r + player.r) * (e.r + player.r)) {
        enemies.splice(i, 1);
        damagePlayer(e.damage);
        continue;
      }

      if (e.y > BASE_HEIGHT + 80) {
        enemies.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    state.level = 1 + Math.floor(state.timeSec / 22);

    updateHUD();
  }

  function getControls() {
    const arrowsOnly = settings.controlScheme === 'arrows';
    return {
      up: arrowsOnly ? keys.has('ArrowUp') : (keys.has('w') || keys.has('W') || keys.has('ArrowUp')),
      down: arrowsOnly ? keys.has('ArrowDown') : (keys.has('s') || keys.has('S') || keys.has('ArrowDown')),
      left: arrowsOnly ? keys.has('ArrowLeft') : (keys.has('a') || keys.has('A') || keys.has('ArrowLeft')),
      right: arrowsOnly ? keys.has('ArrowRight') : (keys.has('d') || keys.has('D') || keys.has('ArrowRight')),
      fire: keys.has(' ') || keys.has('Spacebar'),
      special: keys.has('Shift')
    };
  }

  function spawnEnemy(baseSpeed, fireRate) {
    const roll = Math.random();

    let type = 'ship';
    let sprite = assets.enemyShip;
    let size = 56;
    let hp = 1;
    let damage = 22;
    let canShoot = true;
    let scoreValue = 40;

    if (roll < 0.22) {
      type = 'ufo';
      sprite = assets.enemyUFO;
      size = 60;
      hp = 2;
      damage = 28;
      canShoot = true;
      scoreValue = 75;
    } else if (roll < 0.44) {
      type = 'meteorBig';
      sprite = assets.meteorBig;
      size = 72;
      hp = 3;
      damage = 35;
      canShoot = false;
      scoreValue = 90;
    } else if (roll < 0.62) {
      type = 'meteorSmall';
      sprite = assets.meteorSmall;
      size = 42;
      hp = 1;
      damage = 18;
      canShoot = false;
      scoreValue = 35;
    }

    enemies.push({
      type,
      sprite,
      x: 60 + Math.random() * (BASE_WIDTH - 120),
      y: -60,
      r: size * 0.32,
      size,
      speed: baseSpeed * (0.82 + Math.random() * 0.36),
      hp,
      damage,
      canShoot,
      scoreValue,
      fireTimer: 0.8 + Math.random() * 1.3,
      baseFireRate: fireRate,
      wobbleAmount: 20 + Math.random() * 30,
      wobbleSpeed: 1.1 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2
    });
  }

  function firePlayerBullet() {
    bullets.push({
      x: player.x,
      y: player.y - 30,
      speed: 540,
      life: 1.4,
      r: 8,
      kind: Math.random() > 0.5 ? 'beam' : 'shot'
    });

    spawnMuzzleFlash();
    sfxShoot?.cloneNode(true)?.play?.().catch(() => {});
  }

  function fireEnemyBullet(enemy) {
    enemyBullets.push({
      x: enemy.x,
      y: enemy.y + enemy.size * 0.2,
      speed: 270 + Math.random() * 45,
      life: 3.2,
      r: 8,
      kind: Math.random() > 0.5 ? 'beam' : 'shot'
    });
  }

  function activateSmartBomb() {
    state.specialCooldown = 6;
    state.shield = Math.max(0, state.shield - 25);
    state.screenShake = 10;
    state.flashTimer = 0.45;

    let bonus = 0;
    for (let i = enemies.length - 1; i >= 0; i--) {
      bonus += enemies[i].scoreValue;
      explode(enemies[i].x, enemies[i].y, enemies[i].type === 'meteorBig' ? 18 : 12, 'special');
      enemies.splice(i, 1);
    }

    state.score += bonus;
    explode(player.x, player.y, 28, 'special');
    sfxExplosion?.cloneNode(true)?.play?.().catch(() => {});
  }

  function destroyEnemy(index, enemy) {
    state.score += enemy.scoreValue;
    state.screenShake = enemy.type === 'meteorBig' ? 8 : 4;
    explode(enemy.x, enemy.y, enemy.type === 'meteorBig' ? 20 : 12, 'enemy');
    sfxExplosion?.cloneNode(true)?.play?.().catch(() => {});
    enemies.splice(index, 1);
  }

  function damagePlayer(amount) {
    state.shield -= amount;
    state.screenShake = 8;
    state.flashTimer = 0.2;
    state.hitTimer = 0.35;

    explode(player.x, player.y, 16, 'player');
    sfxExplosion?.cloneNode(true)?.play?.().catch(() => {});

    if (state.shield <= 0) {
      state.lives -= 1;
      state.shield = 100;

      if (state.lives <= 0) {
        endGame();
      }
    }
  }

  function explode(x, y, count, type) {
    const scale = graphicsTable[settings.graphics]?.particles ?? 1;
    const finalCount = Math.round(count * scale);

    for (let i = 0; i < finalCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 210;

      particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        s: 2 + Math.random() * 4,
        life: 0.35 + Math.random() * 0.8,
        maxLife: 1.1,
        front: Math.random() > 0.5,
        color:
          type === 'player' ? '#ff6b6b' :
          type === 'special' ? '#67e8f9' :
          '#f8fafc'
      });
    }
  }

  function spawnHitSpark(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 120;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        s: 2 + Math.random() * 2,
        life: 0.1 + Math.random() * 0.22,
        maxLife: 0.32,
        front: true,
        color: '#ffffff'
      });
    }
  }

  function spawnMuzzleFlash() {
    for (let i = 0; i < 4; i++) {
      const spread = (Math.random() - 0.5) * 20;
      particles.push({
        x: player.x + spread * 0.2,
        y: player.y - 25,
        vx: spread,
        vy: -(40 + Math.random() * 70),
        s: 2 + Math.random() * 2,
        life: 0.08 + Math.random() * 0.12,
        maxLife: 0.2,
        front: true,
        color: '#a7f3d0'
      });
    }
  }

  function endGame() {
    state.running = false;
    state.gameOver = true;

    try {
      const key = 'spaceGameScores';
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      list.push({ initials: 'YOU', score: state.score, t: Date.now() });
      list.sort((a, b) => b.score - a.score);
      const top10 = list.slice(0, 10);
      localStorage.setItem(key, JSON.stringify(top10));
      renderScores(top10);
    } catch {}

    if (!pauseDialog?.open) pauseDialog.showModal();
  }

  function renderScores(list) {
    const ol = $('#scores');
    if (!ol) return;

    ol.innerHTML = '';
    list.forEach((item) => {
      const li = document.createElement('li');
      li.dataset.initials = item.initials || 'YOU';
      li.dataset.score = String(item.score);
      li.textContent = `${li.dataset.initials} — ${item.score.toLocaleString()}`;
      ol.appendChild(li);
    });
  }

  function updateHUD() {
    outScore.textContent = String(state.score);
    outLevel.textContent = String(state.level);
    outLives.textContent = String(state.lives);
    outShield.textContent = `${Math.round(clamp(state.shield, 0, 100))}%`;
    outFps.textContent = String(state.fps);
    outTime.textContent = toMMSS(state.timeSec);
  }

  function render() {
    ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

    const shakeX = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 4 : 0;
    const shakeY = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 4 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawBackground();
    drawParticles(false);
    drawEnemies();
    drawBullets();
    drawEnemyBullets();
    drawPlayer();
    drawParticles(true);
    drawCanvasHUD();
    drawOverlay();

    ctx.restore();
  }

  function drawBackground() {
    const bg = assets.background;

    if (bg.color.complete && bg.color.naturalWidth) {
      ctx.drawImage(bg.color, 0, 0, BASE_WIDTH, BASE_HEIGHT);
    } else {
      ctx.fillStyle = '#64406f';
      ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
    }

    if (bg.starBackground.complete && bg.starBackground.naturalWidth) {
      const scrollY = (state.timeSec * 20) % BASE_HEIGHT;
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.drawImage(bg.starBackground, 0, scrollY - BASE_HEIGHT, BASE_WIDTH, BASE_HEIGHT);
      ctx.drawImage(bg.starBackground, 0, scrollY, BASE_WIDTH, BASE_HEIGHT);
      ctx.restore();
    }

    if (bg.nebula.complete && bg.nebula.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.drawImage(bg.nebula, BASE_WIDTH * 0.5 - 180, 30, 360, 220);
      ctx.restore();
    }

    if (bg.speedLine.complete && bg.speedLine.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 0.16 + Math.sin(state.timeSec * 4) * 0.05;
      for (let i = 0; i < 5; i++) {
        const y = ((state.timeSec * 180) + i * 180) % (BASE_HEIGHT + 200) - 100;
        ctx.drawImage(bg.speedLine, 170 + i * 150, y, 18, 120);
      }
      ctx.restore();
    }

    if (bg.starBig.complete && bg.starBig.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 8; i++) {
        const x = 40 + i * 120 + Math.sin(state.timeSec + i) * 8;
        const y = ((state.timeSec * (20 + i * 2)) + i * 90) % (BASE_HEIGHT + 80) - 40;
        ctx.drawImage(bg.starBig, x, y, 18, 18);
      }
      ctx.restore();
    }

    if (bg.starSmall.complete && bg.starSmall.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 18; i++) {
        const x = 20 + (i * 57) % BASE_WIDTH;
        const y = ((state.timeSec * (35 + i)) + i * 50) % (BASE_HEIGHT + 40) - 20;
        ctx.drawImage(bg.starSmall, x, y, 10, 10);
      }
      ctx.restore();
    }
  }

  function drawPlayer() {
    let sprite = assets.player;
    if (state.hitTimer > 0 || state.shield <= 25) sprite = assets.playerDamaged;
    else if (player.vx < -20) sprite = assets.playerLeft;
    else if (player.vx > 20) sprite = assets.playerRight;

    const w = 78;
    const h = 78;

    ctx.save();
    if (graphicsTable[settings.graphics]?.glow) {
      ctx.shadowColor = '#5ac8fa';
      ctx.shadowBlur = 18;
    }
    ctx.drawImage(sprite, player.x - w / 2, player.y - h / 2, w, h);

    const thrust = 8 + Math.sin(state.timeSec * 20) * 3;
    ctx.fillStyle = 'rgba(255,160,60,0.8)';
    ctx.beginPath();
    ctx.moveTo(player.x - 7, player.y + 24);
    ctx.lineTo(player.x, player.y + 24 + thrust);
    ctx.lineTo(player.x + 7, player.y + 24);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of enemies) {
      ctx.save();
      if (graphicsTable[settings.graphics]?.glow) {
        ctx.shadowColor = e.type === 'ufo' ? '#fbbf24' : '#ff6b6b';
        ctx.shadowBlur = e.type === 'meteorBig' ? 12 : 8;
      }
      ctx.drawImage(e.sprite, e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
      ctx.restore();
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      const img = b.kind === 'shot' ? assets.laserGreenShot : assets.laserGreen;
      ctx.drawImage(img, b.x - 6, b.y - 18, 12, 34);
    }
  }

  function drawEnemyBullets() {
    for (const b of enemyBullets) {
      const img = b.kind === 'shot' ? assets.laserRedShot : assets.laserRed;
      ctx.drawImage(img, b.x - 6, b.y - 8, 12, 28);
    }
  }

  function drawParticles(front) {
    for (const p of particles) {
      if (!!p.front !== !!front) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.s, p.s);
      ctx.restore();
    }
  }

  function drawCanvasHUD() {
    ctx.save();

    for (let i = 0; i < state.lives; i++) {
      ctx.drawImage(assets.life, 18 + i * 32, 18, 22, 22);
    }

    ctx.drawImage(assets.shield, BASE_WIDTH - 150, 16, 26, 26);

    ctx.fillStyle = 'rgba(10,15,35,0.7)';
    ctx.fillRect(BASE_WIDTH - 118, 20, 90, 16);

    ctx.fillStyle = state.shield > 35 ? '#5ac8fa' : '#ff6b6b';
    ctx.fillRect(BASE_WIDTH - 118, 20, 90 * clamp(state.shield / 100, 0, 1), 16);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(BASE_WIDTH - 118, 20, 90, 16);

    ctx.restore();
  }

  function drawOverlay() {
    if (!state.running && !state.gameOver) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '800 48px Orbitron, sans-serif';
      ctx.fillText('SPACE GAME', BASE_WIDTH / 2, BASE_HEIGHT / 2 - 30);

      ctx.fillStyle = '#dbeafe';
      ctx.font = '600 22px Poppins, sans-serif';
      ctx.fillText('Press Start to Begin', BASE_WIDTH / 2, BASE_HEIGHT / 2 + 18);
      ctx.restore();
    }

    if (state.gameOver) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '800 44px Orbitron, sans-serif';
      ctx.fillText('GAME OVER', BASE_WIDTH / 2, BASE_HEIGHT / 2 - 20);

      ctx.fillStyle = '#fca5a5';
      ctx.font = '600 22px Poppins, sans-serif';
      ctx.fillText(`Final Score: ${state.score}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 24);
      ctx.restore();
    }

    if (state.flashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = state.flashTimer * 0.25;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
      ctx.restore();
    }
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function clamp01(v) {
    return clamp(v, 0, 1);
  }

  function dist2(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return dx * dx + dy * dy;
  }

  function toMMSS(sec) {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  try {
    const key = 'spaceGameScores';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    renderScores(list.slice(0, 10));
  } catch {}

  updateHUD();
  render();

  window.SpaceGame = {
    start: startGame,
    pause: () => togglePause(true),
    resume: () => togglePause(false),
    reset: resetGame,
    fullscreen: toggleFullscreen,
    mute: toggleMute
  };
})();