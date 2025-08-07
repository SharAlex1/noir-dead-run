(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const hud = {
    hp: document.getElementById('hp'),
    kills: document.getElementById('kills'),
    wave: document.getElementById('wave'),
    weapon: document.getElementById('weapon'),
    message: document.getElementById('message'),
  };

  const startOverlay = document.getElementById('startOverlay');
  const btnStart = document.getElementById('btnStart');

  const controls = {
    left: false, right: false, up: false, shoot: false, pause: false
  };

  // Touch buttons
  const bindHold = (id, key) => {
    const el = document.getElementById(id);
    const set = v => controls[key] = v;
    const start = e => { e.preventDefault(); set(true); };
    const end = e => { e.preventDefault(); set(false); };
    ['touchstart','mousedown'].forEach(ev => el.addEventListener(ev, start, {passive:false}));
    ['touchend','touchcancel','mouseup','mouseleave'].forEach(ev => el.addEventListener(ev, end));
  };
  bindHold('btnLeft','left');
  bindHold('btnRight','right');
  bindHold('btnJump','up');
  bindHold('btnShoot','shoot');
  document.getElementById('btnPause').addEventListener('click',()=>togglePause());

  // Keyboard
  const keymap = {
    'ArrowLeft':'left','KeyA':'left',
    'ArrowRight':'right','KeyD':'right',
    'ArrowUp':'up','KeyW':'up','Space':'up',
    'KeyJ':'shoot','KeyK':'shoot',
    'KeyP':'pause'
  };
  addEventListener('keydown',e=>{
    if(keymap[e.code]==='pause'){ togglePause(); return; }
    const k = keymap[e.code]; if(k){ controls[k]=true; e.preventDefault(); }
  });
  addEventListener('keyup',e=>{ const k = keymap[e.code]; if(k){ controls[k]=false; e.preventDefault(); } });

  // Resize
  function resize(){
    const dpr = Math.min(2, window.devicePixelRatio || 1.5);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize', resize); resize();

  // Game state
  const state = {
    running: false,
    paused: false,
    time: 0,
    score: 0,
    kills: 0,
    wave: 1,
    gravity: 1800,
    groundY: () => innerHeight - 90,
    scrollX: 0,
    entities: [],
    bullets: [],
    drops: [],
    particles: [],
    player: null,
    lastShot: 0,
    nextSpawn: 0,
    nextDrop: 3,
  };

  // Weapons
  const WEAPONS = {
    Pistol: { dmg: 20, fireRate: 4, speed: 1100, spread: 0.03, recoil: 120, knock: 80 },
    SMG: { dmg: 12, fireRate: 12, speed: 1200, spread: 0.12, recoil: 80, knock: 50 },
    Shotgun: { dmg: 10, fireRate: 1.2, speed: 1000, spread: 0.45, pellets: 6, recoil: 200, knock: 120 },
    Rifle: { dmg: 40, fireRate: 2.5, speed: 1500, spread: 0.02, recoil: 180, knock: 120 },
  };

  class Player {
    constructor(){
      this.x = 120;
      this.y = state.groundY();
      this.w = 28; this.h = 46;
      this.vx = 0; this.vy = 0;
      this.hp = 100;
      this.weapon = 'Pistol';
      this.onGround = true;
      this.facing = 1;
      this.invuln = 0;
    }
    get speed(){ return 260; }
    jump(){ if(this.onGround){ this.vy = -640; this.onGround = false; } }
    shoot(){
      const specs = WEAPONS[this.weapon];
      const now = state.time;
      const minDt = 1 / specs.fireRate;
      if(now - state.lastShot < minDt) return;
      state.lastShot = now;

      const bulletsToFire = this.weapon==='Shotgun' ? (specs.pellets||6) : 1;
      for(let i=0;i<bulletsToFire;i++){
        const spread = (Math.random()-0.5)*2*specs.spread;
        const ang = 0 + spread;
        const speed = specs.speed;
        const vx = Math.cos(ang)*speed*(this.facing);
        const vy = Math.sin(ang)*speed*0.2;
        state.bullets.push(new Bullet(this.x + this.facing*(this.w/2+8), this.y - this.h/2, vx, vy, specs.dmg));
      }
      // muzzle flash
      addParticles(this.x+this.facing*(this.w/2+12), this.y - this.h/2, this.facing, '#f00', 6);
      // kick back a bit
      this.vx -= this.facing * (WEAPONS[this.weapon].recoil/1000);
      // UI pulse
      flashMessage(this.weapon.toUpperCase());
    }
    hurt(d){
      if(this.invuln>0) return;
      this.hp -= d;
      this.invuln = 0.6;
      addParticles(this.x, this.y-this.h/2, 0, '#a00', 10);
      if(this.hp<=0){ gameOver(); }
    }
    update(dt){
      // Move
      const acc = 1600;
      if(controls.left) this.vx = Math.max(this.vx - acc*dt, -this.speed);
      if(controls.right) this.vx = Math.min(this.vx + acc*dt, this.speed);
      if(!controls.left && !controls.right){
        // friction
        this.vx *= (1 - Math.min(1, 8*dt));
      }
      if(controls.up){ this.jump(); }
      if(controls.shoot){ this.shoot(); }
      this.facing = this.vx>=-0.01 ? 1 : -1;

      // Gravity
      this.vy += state.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Ground collision
      const gy = state.groundY();
      if(this.y >= gy){
        this.y = gy;
        this.vy = 0;
        this.onGround = true;
      } else this.onGround = false;

      // Keep on screen
      this.x = Math.max(60, Math.min(this.x, state.scrollX + innerWidth*0.6));

      // invulnerability timer
      if(this.invuln>0) this.invuln -= dt;
    }
    draw(){
      // body
      const x = this.x - state.scrollX;
      const y = this.y;
      drawNoirRect(x-this.w/2, y-this.h, this.w, this.h, '#dcdcdc');
      // head
      drawNoirRect(x-10, y-this.h-12, 20, 12, '#e8e8e8');
      // eye slit
      noirLine(x-7, y-this.h-6, x+7, y-this.h-6, '#000', 2);
      // gun silhouette
      noirLine(x + this.facing*6, y-this.h*0.6, x + this.facing*22, y-this.h*0.6, '#ddd', 4);
    }
  }

  class Zombie {
    constructor(type){
      this.type = type; // 'small','normal','big'
      this.w = type==='big'? 46 : type==='small'? 24 : 32;
      this.h = type==='big'? 80 : type==='small'? 36 : 56;
      this.hp = type==='big'? 200 : type==='small'? 40 : 80;
      this.speed = type==='big'? 40 : type==='small'? 100 : 70;
      this.dmg = type==='big'? 25 : type==='small'? 8 : 12;
      this.x = state.scrollX + innerWidth + Math.random()*300 + 60;
      this.y = state.groundY();
      this.vx = -this.speed;
      this.knock = 0;
    }
    update(dt){
      // shamble
      const bias = (this.type==='small'? 1.2 : this.type==='big'? 0.7 : 1.0);
      this.vx = -this.speed * bias + (Math.random()-0.5)*10;
      this.x += this.vx * dt;
      // knockback decay
      this.knock *= (1 - Math.min(1, 6*dt));
      this.x += this.knock * dt;

      // collide with player
      const p = state.player;
      if (Math.abs((this.x)-(p.x)) < (this.w/2 + p.w/2) &&
          (p.y) >= (state.groundY()-2)) {
        if(Math.random()<0.02) p.hurt(this.dmg);
      }
    }
    hurt(d, dir){
      this.hp -= d;
      this.knock = dir * 120;
      addParticles(this.x, this.y-this.h/2, -dir, '#5f5', this.type==='big'? 10:6);
      if(this.hp<=0){
        state.kills++;
        hud.kills.textContent = state.kills;
        // maybe drop
        if(Math.random()<0.08){
          spawnDrop(this.x, this.y-this.h/2);
        }
        // death particles
        addParticles(this.x, this.y-this.h/2, 0, '#0f0', 14);
        // remove
        this.dead = true;
      }
    }
    draw(){
      const x = this.x - state.scrollX;
      const y = this.y;
      const col = this.type==='big' ? '#bdbdbd' : this.type==='small' ? '#d0d0d0' : '#c7c7c7';
      drawNoirRect(x-this.w/2, y-this.h, this.w, this.h, col);
      noirLine(x-this.w*0.2, y-this.h*0.7, x+this.w*0.2, y-this.h*0.7, '#000', 2);
    }
  }

  class Bullet {
    constructor(x,y,vx,vy,dmg){
      this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.dmg=dmg;
      this.ttl = 0.8;
      this.dir = Math.sign(vx)||1;
    }
    update(dt){
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.ttl -= dt;
      if(this.ttl<=0){ this.dead=true; }
      // collision with zombies
      for(const z of state.entities){
        if(z.dead) continue;
        const zx = z.x, zy = z.y;
        const w = z.w, h = z.h;
        const sx = zx - state.scrollX;
        // AABB overlap
        if(Math.abs(this.x - zx) < (w/2) && (this.y > zy - h && this.y < zy)){
          z.hurt(this.dmg, this.dir);
          this.dead = true;
          break;
        }
      }
    }
    draw(){
      const x = this.x - state.scrollX, y = this.y;
      noirLine(x, y, x + 10*this.dir, y, '#fff', 2);
    }
  }

  function spawnZombie(){
    const r = Math.random();
    const type = r<0.2? 'big' : r<0.55? 'small' : 'normal';
    state.entities.push(new Zombie(type));
  }

  function spawnDrop(x, y){
    // choose weapon other than player's current
    const keys = Object.keys(WEAPONS).filter(k=>k!==state.player.weapon);
    const pick = keys[(Math.random()*keys.length)|0];
    state.drops.push({x, y, w:22, h:14, weapon: pick, vy:-120, ttl:12});
  }

  function addParticles(x, y, dir, color, n){
    for(let i=0;i<n;i++){
      state.particles.push({
        x, y, vx:(Math.random()*160+40)*(dir|| (Math.random()<.5? -1:1)),
        vy:(Math.random()*-160-80), g: 900, r: Math.random()*2+1, color, ttl: 0.6 + Math.random()*0.6
      });
    }
  }

  function flashMessage(text){
    hud.message.textContent = text;
    hud.message.style.opacity = '0.9';
    hud.message.style.transition = 'none';
    requestAnimationFrame(()=>{
      hud.message.style.transition = 'opacity 1.2s ease-out';
      hud.message.style.opacity = '0.15';
    });
  }

  function drawNoirRect(x,y,w,h,color){
    ctx.fillStyle = color;
    ctx.fillRect(x,y,w,h);
    // dirty shading
    ctx.fillStyle = '#0005';
    ctx.fillRect(x,y,w, h*0.2);
    ctx.fillStyle = '#fff1';
    ctx.fillRect(x,y+h*0.8,w,h*0.2);
  }
  function noirLine(x1,y1,x2,y2,color,width){
    ctx.strokeStyle = color;
    ctx.lineWidth = width||1;
    ctx.beginPath();
    ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }

  function drawGround(){
    const gy = state.groundY();
    // background gradient
    const g = ctx.createLinearGradient(0,0,0,innerHeight);
    g.addColorStop(0,'#0a0a0a');
    g.addColorStop(1,'#111');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,innerWidth,innerHeight);
    // parallax buildings
    ctx.globalAlpha = 0.25;
    for(let layer=0; layer<3; layer++){
      const speed = 0.2 + layer*0.15;
      const baseY = innerHeight - 200 - layer*40;
      const seed = Math.floor(state.scrollX * speed * 0.02);
      for(let i=-2;i<12;i++){
        const bx = (i*180) - ((state.scrollX*speed)%180);
        const bh = 80 + ((i+seed)%5)*30;
        ctx.fillStyle = ['#161616','#121212','#0e0e0e'][layer];
        ctx.fillRect(bx, baseY-bh, 140, bh);
      }
    }
    ctx.globalAlpha = 1;
    // street
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, gy, innerWidth, innerHeight-gy);
    // lane marks
    ctx.globalAlpha = 0.25;
    for(let x=-((state.scrollX)%140); x<innerWidth; x+=140){
      ctx.fillStyle = '#ddd';
      ctx.fillRect(x, gy+20, 60, 4);
    }
    ctx.globalAlpha = 1;
    // fog
    ctx.fillStyle = '#0003';
    ctx.fillRect(0,0,innerWidth,innerHeight);
  }

  function updateDrops(dt){
    const p = state.player;
    for(const d of state.drops){
      d.vy += 900*dt;
      d.y += d.vy*dt;
      if(d.y > state.groundY()-10){ d.y = state.groundY()-10; d.vy = 0; }
      d.ttl -= dt;
      // pickup collision
      if(Math.abs((d.x)-(p.x)) < (d.w/2 + p.w/2) && Math.abs((d.y)-(p.y - p.h/2)) < 40){
        p.weapon = d.weapon;
        hud.weapon.textContent = p.weapon;
        flashMessage(d.weapon.toUpperCase());
        d.dead = true;
      }
    }
    // cull
    state.drops = state.drops.filter(d=>!d.dead && d.ttl>0);
  }

  function drawDrops(){
    for(const d of state.drops){
      const x = d.x - state.scrollX, y = d.y;
      // weapon crate
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(x-d.w/2, y-d.h/2, d.w, d.h);
      ctx.strokeStyle = '#444'; ctx.lineWidth=2;
      ctx.strokeRect(x-d.w/2, y-d.h/2, d.w, d.h);
      ctx.fillStyle = '#ddd';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.weapon, x, y-8);
    }
  }

  function spawnWave(){
    const base = 4 + state.wave*1.5;
    for(let i=0;i<base;i++){
      setTimeout(spawnZombie, 300*i + Math.random()*600);
    }
    // escalate
    state.wave++;
    hud.wave.textContent = state.wave;
    flashMessage('WAVE ' + (state.wave-1) + ' CLEARED');
  }

  function gameOver(){
    state.running=false;
    startOverlay.querySelector('h1').textContent = 'You Died';
    startOverlay.querySelector('p').innerHTML = 'Kills: <b>'+state.kills+'</b> • Wave: <b>'+(state.wave-1)+'</b>';
    startOverlay.style.display='flex';
  }

  function startGame(){
    // reset
    state.running=true;
    state.paused=false;
    state.time=0; state.kills=0; hud.kills.textContent='0';
    state.wave=1; hud.wave.textContent='1';
    state.entities.length=0; state.bullets.length=0; state.drops.length=0; state.particles.length=0;
    state.scrollX=0; state.lastShot=0; state.nextSpawn=0; state.nextDrop=3;
    state.player = new Player();
    hud.weapon.textContent = state.player.weapon;
    startOverlay.style.display='none';
    flashMessage('SURVIVE');
  }

  function togglePause(){
    if(!state.running){ return; }
    state.paused = !state.paused;
    if(state.paused){
      flashMessage('PAUSED');
    } else {
      flashMessage('RESUME');
    }
  }

  btnStart.addEventListener('click', startGame);

  // Main loop
  let last=performance.now();
  function loop(now){
    requestAnimationFrame(loop);
    const dtRaw = Math.min(0.05, (now-last)/1000);
    last = now;
    if(!state.running || state.paused) return;

    state.time += dtRaw;
    const dt = dtRaw;

    // Progress world
    state.scrollX += 120*dt;

    // Spawn logic
    state.nextSpawn -= dt;
    if(state.nextSpawn<=0){
      spawnZombie();
      const base = Math.max(0.3, 1.3 - state.wave*0.08);
      state.nextSpawn = base + Math.random()*0.6;
    }

    // Update player
    state.player.update(dt);

    // Update zombies
    for(const z of state.entities) z.update(dt);
    state.entities = state.entities.filter(z=>!z.dead && z.x > state.scrollX-80);

    // Update bullets
    for(const b of state.bullets) b.update(dt);
    state.bullets = state.bullets.filter(b=>!b.dead);

    // Drops
    updateDrops(dt);

    // Particles
    for(const p of state.particles){
      p.vy += p.g*dt; p.x += p.vx*dt; p.y += p.vy*dt; p.ttl -= dt;
    }
    state.particles = state.particles.filter(p=>p.ttl>0);

    // Drawing
    ctx.clearRect(0,0,innerWidth,innerHeight);
    drawGround();
    drawDrops();
    for(const b of state.bullets) b.draw();
    for(const z of state.entities) z.draw();
    state.player.draw();
    // particles on top
    for(const p of state.particles){
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - state.scrollX, p.y, p.r, p.r);
    }

    // HUD
    hud.hp.textContent = Math.max(0, Math.floor(state.player.hp));
  }
  requestAnimationFrame(loop);

  // Start screen remains until click
})();