/*
  Sprites (put in the same folder as index.html):
  - resources/GF.png  (main player)
  - resources/BF.png  (companion that spawns after 9 loot)
  - resources/background.png (optional)

  Controls:
  A/Left = move left
  D/Right = move right
  Space = jump

  Start screen:
  - Uses #startOverlay in your HTML (blur overlay).
  - Press Space to start the game.
*/

(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    document.body.innerHTML =
      "<div style='color:white;padding:20px;font-family:system-ui'>Canvas 2D context not available.</div>";
    throw new Error("Canvas 2D context not available.");
  }

  // ===== START OVERLAY CONTROL =====
  const overlayEl = document.getElementById("startOverlay");
  let gameStarted = false;

  // ===== DISPLAY =====
  let dpr = 1;
  let W = 0, H = 0;

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Reset the world on resize (your original behavior)
    resetWorld();
  }
  window.addEventListener("resize", resize);

  // ===== INPUT =====
  const keys = new Set();
  window.addEventListener(
    "keydown",
    (e) => {
      if (["ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();

      // ✅ Press Space to start
      if (!gameStarted && e.code === "Space") {
        gameStarted = true;
        if (overlayEl) overlayEl.classList.add("hidden");
        keys.add(e.code);
        return;
      }

      // Block gameplay input until started
      if (!gameStarted) return;

      keys.add(e.code);
    },
    { passive: false }
  );
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  const leftHeld = () => keys.has("KeyA") || keys.has("ArrowLeft");
  const rightHeld = () => keys.has("KeyD") || keys.has("ArrowRight");
  const jumpHeld = () => keys.has("Space");

  // ===== TWEAKS =====
  const GRAVITY = 2200;
  const MOVE_ACC = 4200;
  const MAX_SPEED = 420;
  const FRICTION = 0.86;
  const JUMP_VEL = 900;
  const BOX_HITS_REQUIRED = 3;

  // ===== COMPANION SETTINGS =====
  const COMPANION_TRIGGER_LOOT = 9;
  const COMPANION_SPEED = 260;
  const COMPANION_JUMP = 900;

  // Rescue tuning (keeps BF from being left behind)
  const COMPANION_STUCK_TIME = 1.2;   // seconds before rescue
  const COMPANION_RESCUE_DIST = 450;  // horizontal distance threshold

  // ===== DIALOGUE SETTINGS =====
  const COMPANION_CLOSE_DIST = 90;    // how close BF must be to GF (x distance)
  const COMPANION_CLOSE_TIME = 3;     // seconds close before speaking
  const DIALOGUE_DURATION = 1;        // seconds dialogue stays visible
  const COMPANION_LINE = "Happy 2nd monthsary, babi. Here’s to many more days with you!";

  // speech bubble sizing
  const BUBBLE_MAX_W = 220;
  const BUBBLE_PAD_X = 10;
  const BUBBLE_OFFSET_Y = 18; // how far above head
  const BUBBLE_TAIL_W = 14;
  const BUBBLE_TAIL_H = 10;

  // Player visual size (sprite draw height)
  const PLAYER_DRAW_HEIGHT = 60;

  // Hitbox size (collision)
  const PLAYER_HIT_W = 50;
  const PLAYER_HIT_H = 60;

  // ===== HELPERS =====
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const aabbOverlap = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function resolveAABB(mover, solid, prev) {
    if (!aabbOverlap(mover, solid)) return null;

    const fromTop = prev.y + mover.h <= solid.y;
    const fromBottom = prev.y >= solid.y + solid.h;
    const fromLeft = prev.x + mover.w <= solid.x;
    const fromRight = prev.x >= solid.x + solid.w;

    if (fromTop) {
      mover.y = solid.y - mover.h;
      mover.vy = 0;
      mover.onGround = true;
      return "top";
    }
    if (fromBottom) {
      mover.y = solid.y + solid.h;
      mover.vy = 0;
      return "bottom";
    }
    if (fromLeft) {
      mover.x = solid.x - mover.w;
      mover.vx = 0;
      return "left";
    }
    if (fromRight) {
      mover.x = solid.x + solid.w;
      mover.vx = 0;
      return "right";
    }

    // fallback push-out
    const ox1 = mover.x + mover.w - solid.x;
    const ox2 = solid.x + solid.w - mover.x;
    const oy1 = mover.y + mover.h - solid.y;
    const oy2 = solid.y + solid.h - mover.y;
    const minX = Math.min(ox1, ox2);
    const minY = Math.min(oy1, oy2);

    if (minX < minY) {
      mover.x += ox1 < ox2 ? -ox1 : ox2;
      mover.vx = 0;
      return ox1 < ox2 ? "left" : "right";
    } else {
      mover.y += oy1 < oy2 ? -oy1 : oy2;
      mover.vy = 0;
      if (oy1 < oy2) mover.onGround = true;
      return oy1 < oy2 ? "top" : "bottom";
    }
  }

  // ===== Background Image =====
  const bgImg = new Image();
  let bgReady = false;
  bgImg.onload = () => (bgReady = true);
  bgImg.onerror = () => (bgReady = false);
  bgImg.src = "resources/background.png";

  // ===== Sprites =====
  const gfImg = new Image();
  let gfReady = false;
  gfImg.onload = () => (gfReady = true);
  gfImg.onerror = () => (gfReady = false);
  gfImg.src = "resources/GF.png";

  const bfImg = new Image();
  let bfReady = false;
  bfImg.onload = () => (bfReady = true);
  bfImg.onerror = () => (bfReady = false);
  bfImg.src = "resources/BF.png";

  // ===== HUD =====
  const scoreEl = document.getElementById("score");
  const lootEl = document.getElementById("loot");
  const boxesEl = document.getElementById("boxes");

  // ===== STATE =====
  const state = { score: 0, loot: 0 };

  const player = {
    x: 120,
    y: 0,
    w: PLAYER_HIT_W,
    h: PLAYER_HIT_H,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    jumpLock: false,
  };

  const solids = [];
  const boxes = [];
  const lootItems = [];
  let companion = null;
  let companionStuckT = 0;

  // dialogue state
  let companionCloseT = 0;
  let dialogueT = 0;
  let dialogueActive = false;

  function groundRect() {
    const gh = 110;
    return { x: -99999, y: H - gh, w: 199999, h: gh };
  }

  function resetWorld() {
    solids.length = 0;
    boxes.length = 0;
    lootItems.length = 0;

    const g = groundRect();
    solids.push(g);

    // Platforms
    solids.push({ x: 140,  y: g.y - 270, w: 140, h: 26 });
    solids.push({ x: 340,  y: g.y - 130, w: 140, h: 26 });
    solids.push({ x: 580,  y: g.y - 240, w: 180, h: 26 });
    solids.push({ x: 880,  y: g.y - 360, w: 140, h: 26 });
    solids.push({ x: 1100, y: g.y - 120, w: 140, h: 26 });

    // Mystery boxes (exactly 3)
    boxes.push({ id: 0, x: 185,  y: g.y - 420, w: 52, h: 52, hitsLeft: BOX_HITS_REQUIRED, bounceT: 0 });
    boxes.push({ id: 1, x: 920,  y: g.y - 540, w: 52, h: 52, hitsLeft: BOX_HITS_REQUIRED, bounceT: 0 });
    boxes.push({ id: 2, x: 1140, y: g.y - 310, w: 52, h: 52, hitsLeft: BOX_HITS_REQUIRED, bounceT: 0 });

    // Reset player
    player.w = PLAYER_HIT_W;
    player.h = PLAYER_HIT_H;
    player.x = 120;
    player.y = g.y - player.h;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.jumpLock = false;

    // Reset companion + dialogue
    companion = null;
    companionStuckT = 0;
    companionCloseT = 0;
    dialogueT = 0;
    dialogueActive = false;

    state.score = 0;
    state.loot = 0;
    updateHUD();
  }

  function updateHUD() {
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (lootEl) lootEl.textContent = String(state.loot);
    if (boxesEl) boxesEl.textContent = boxes.map((b) => b.hitsLeft).join(", ");
  }

  function spawnLootFromBox(box) {
    lootItems.push({
      x: box.x + box.w / 2 - 10,
      y: box.y - 6,
      w: 20,
      h: 20,
      vx: Math.random() * 120 - 60,
      vy: -520,
      collectable: false,
      collected: false,
      spawnT: 0,
    });
  }

  function spawnCompanion() {
    companion = {
      x: Math.random() * (W - PLAYER_HIT_W),
      y: -200,
      w: PLAYER_HIT_W,
      h: PLAYER_HIT_H,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
    };
    companionStuckT = 0;
    companionCloseT = 0;
    dialogueT = 0;
    dialogueActive = false;
  }

  // ===== LOOP =====
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    // ✅ Don't simulate until Space is pressed
    if (!gameStarted) {
      draw();
      requestAnimationFrame(tick);
      return;
    }

    step(dt);
    draw();
    requestAnimationFrame(tick);
  }

  function step(dt) {
    const prev = { x: player.x, y: player.y };
    player.onGround = false;

    // Player movement
    if (leftHeld()) {
      player.vx -= MOVE_ACC * dt;
      player.facing = -1;
    }
    if (rightHeld()) {
      player.vx += MOVE_ACC * dt;
      player.facing = 1;
    }
    player.vx = clamp(player.vx, -MAX_SPEED, MAX_SPEED);

    if (!jumpHeld()) player.jumpLock = false;

    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 10, W - player.w - 10);

    for (const s of solids) resolveAABB(player, s, prev);

    if (player.onGround) {
      player.vx *= FRICTION;
      if (Math.abs(player.vx) < 8) player.vx = 0;

      if (jumpHeld() && !player.jumpLock) {
        player.vy = -JUMP_VEL;
        player.onGround = false;
        player.jumpLock = true;
      }
    }

    // Boxes
    for (const box of boxes) {
      const side = resolveAABB(player, box, prev);
      if (side === "bottom" && prev.y > player.y && player.vy <= 0) {
        box.bounceT = 0.14;
        if (box.hitsLeft > 0) {
          box.hitsLeft -= 1;
          spawnLootFromBox(box);
          state.score += 10;
        }
      }
      box.bounceT = Math.max(0, box.bounceT - dt);
    }

    // Loot
    for (const it of lootItems) {
      if (it.collected) continue;

      it.spawnT += dt;
      it.vy += GRAVITY * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.x = clamp(it.x, 0, W - it.w);

      // land on solids
      const prevIt = { x: it.x - it.vx * dt, y: it.y - it.vy * dt };
      let landed = false;
      for (const s of solids) {
        if (!aabbOverlap(it, s)) continue;
        const fromTop = prevIt.y + it.h <= s.y;
        if (fromTop) {
          it.y = s.y - it.h;
          it.vy = 0;
          landed = true;
          break;
        }
      }

      if (landed && it.spawnT > 0.18) it.collectable = true;

      if (it.collectable && aabbOverlap(player, it)) {
        it.collected = true;
        state.loot += 1;
        state.score += 25;

        if (state.loot >= COMPANION_TRIGGER_LOOT && !companion) {
          spawnCompanion();
        }
      }
    }

    // cleanup
    for (let i = lootItems.length - 1; i >= 0; i--) {
      if (lootItems[i].collected) lootItems.splice(i, 1);
    }

    // ===== COMPANION UPDATE (FIXED) =====
    if (companion) {
      const prevC = { x: companion.x, y: companion.y };

      // gravity
      companion.vy += GRAVITY * dt;

      // follow horizontally
      const dx = player.x - companion.x;
      if (Math.abs(dx) > 50) {
        companion.vx = Math.sign(dx) * COMPANION_SPEED;
        companion.facing = Math.sign(dx) || 1;
      } else {
        companion.vx = 0;
      }

      // move
      companion.x += companion.vx * dt;
      companion.y += companion.vy * dt;
      companion.x = clamp(companion.x, 10, W - companion.w - 10);

      // collide (sets onGround)
      companion.onGround = false;
      for (const s of solids) {
        resolveAABB(companion, s, prevC);
      }

      // climb logic AFTER collision
      const playerCenterX = player.x + player.w / 2;
      const companionCenterX = companion.x + companion.w / 2;
      const horizontalDist = Math.abs(playerCenterX - companionCenterX);

      const playerFeet = player.y + player.h;
      const companionFeet = companion.y + companion.h;
      const heightDiff = companionFeet - playerFeet; // positive => player is higher

      // jump up when player is above
      if (companion.onGround && heightDiff > 25 && horizontalDist < 320) {
        companion.vy = -COMPANION_JUMP * 1.2;
        companion.onGround = false;
      }

      // stronger emergency jump
      if (companion.onGround && heightDiff > 160) {
        companion.vy = -COMPANION_JUMP * 1.35;
        companion.onGround = false;
      }

      // rescue if far + much higher for a while
      const distToPlayer = Math.abs(playerCenterX - companionCenterX);
      if (heightDiff > 180 && distToPlayer > COMPANION_RESCUE_DIST) {
        companionStuckT += dt;
      } else {
        companionStuckT = 0;
      }

      if (companionStuckT > COMPANION_STUCK_TIME) {
        companion.x = clamp(player.x - player.facing * 80, 10, W - companion.w - 10);
        companion.y = player.y - 120;
        companion.vx = 0;
        companion.vy = 0;
        companion.onGround = false;
        companionStuckT = 0;
      }
    }

    // ===== COMPANION DIALOGUE TRIGGER =====
    if (companion && !dialogueActive) {
      const px = player.x + player.w / 2;
      const cx = companion.x + companion.w / 2;

      const close = Math.abs(px - cx) <= COMPANION_CLOSE_DIST;

      // don't count while BF is still falling fast
      const bothSettled = Math.abs(player.vy) < 5 && Math.abs(companion.vy) < 5;

      if (close && bothSettled) {
        companionCloseT += dt;
        if (companionCloseT >= COMPANION_CLOSE_TIME) {
          dialogueActive = true;
          dialogueT = DIALOGUE_DURATION;
        }
      } else {
        companionCloseT = 0;
      }
    }

    // dialogue countdown
    if (dialogueActive) {
      dialogueT -= dt;
      if (dialogueT <= 0) {
        dialogueActive = false;
        dialogueT = 0;
      }
    }

    updateHUD();
  }

  // ===== DRAW =====
  function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);

    if (bgReady) {
      ctx.drawImage(bgImg, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#141a38";
      ctx.fillRect(0, 0, W, H);
    }

    // subtle scan lines
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let i = 0; i < 18; i++) ctx.fillRect(0, i * (H / 18), W, 1);

    for (const s of solids) drawPlatform(s);
    for (const b of boxes) {
      const bounce = b.bounceT > 0 ? Math.sin((b.bounceT / 0.14) * Math.PI) * 8 : 0;
      drawBox(b, -bounce);
    }
    for (const it of lootItems) drawLoot(it);

    drawCharacter(player, gfImg, gfReady);
    if (companion) drawCharacter(companion, bfImg, bfReady);

    // Speech bubble near BF's head
    if (dialogueActive && companion) {
      drawSpeechBubble(companion, COMPANION_LINE);
    }
  }

  function drawPlatform(r) {
    const isGround = r.h >= 90;
    if (isGround) {
      ctx.fillStyle = "#2bbf6a";
      ctx.fillRect(0, r.y, W, 10);
      ctx.fillStyle = "#1f2b3f";
      ctx.fillRect(0, r.y + 10, W, r.h - 10);
    } else {
      ctx.fillStyle = "#2a335f";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "rgba(255,255,255,.16)";
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.fillRect(r.x, r.y, r.w, 4);
    }
  }

  function drawBox(b, yOff) {
    const x = b.x, y = b.y + yOff;
    const empty = b.hitsLeft <= 0;

    ctx.fillStyle = empty ? "#4e5567" : "#c98a3a";
    ctx.fillRect(x, y, b.w, b.h);

    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, b.w - 3, b.h - 3);

    if (!empty) {
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fillRect(x + b.w * 0.46, y + b.h * 0.20, b.w * 0.12, b.h * 0.36);
      ctx.fillRect(x + b.w * 0.40, y + b.h * 0.20, b.w * 0.12, b.h * 0.10);
      ctx.fillRect(x + b.w * 0.52, y + b.h * 0.46, b.w * 0.12, b.h * 0.10);
      ctx.fillRect(x + b.w * 0.46, y + b.h * 0.65, b.w * 0.12, b.h * 0.10);
    } else {
      ctx.fillStyle = "rgba(255,255,255,.20)";
      ctx.fillRect(x + 10, y + 18, b.w - 20, 8);
      ctx.fillRect(x + 10, y + 32, b.w - 20, 8);
    }

    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(x, y + b.h - 10, b.w, 10);
    ctx.fillStyle = empty ? "rgba(255,255,255,.25)" : "#ffd36b";
    const pct = empty ? 0 : b.hitsLeft / BOX_HITS_REQUIRED;
    ctx.fillRect(x, y + b.h - 10, b.w * pct, 10);
  }

  function drawLoot(it) {
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;

    if (it.collectable) {
      ctx.fillStyle = "rgba(0,0,0,.20)";
      ctx.beginPath();
      ctx.ellipse(cx, it.y + it.h + 6, it.w * 0.45, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = it.collectable ? "#6fe7ff" : "#ffd36b";
    ctx.beginPath();
    ctx.moveTo(cx, cy - it.h / 2);
    ctx.lineTo(cx + it.w / 2, cy);
    ctx.lineTo(cx, cy + it.h / 2);
    ctx.lineTo(cx - it.w / 2, cy);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,.30)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawCharacter(p, img, ready) {
    // shadow based on hitbox
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath();
    ctx.ellipse(p.x + p.w / 2, p.y + p.h + 6, p.w * 0.45, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (ready) {
      const imgW = Math.max(1, img.naturalWidth || img.width || 1);
      const imgH = Math.max(1, img.naturalHeight || img.height || 1);

      const drawH = PLAYER_DRAW_HEIGHT;
      const drawW = drawH * (imgW / imgH);

      const drawX = p.x + (p.w - drawW) / 2;
      const drawY = p.y + (p.h - drawH);

      ctx.save();
      ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
      ctx.scale(p.facing || 1, 1);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } else {
      // fallback rectangle
      ctx.fillStyle = "#ff5a7a";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3);
    }
  }

  // Retro pixel speech bubble near an entity's head (with a tail)
  // ✅ Auto-wraps text into multiple lines AND grows bubble height to fit
  function drawSpeechBubble(entity, text) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    const font = "14px monospace";
    ctx.font = font;

    const maxTextW = BUBBLE_MAX_W - BUBBLE_PAD_X * 2;

    function wrapLines(str) {
      const words = String(str).split(/\s+/).filter(Boolean);
      const lines = [];
      let line = "";

      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width <= maxTextW) {
          line = test;
        } else {
          if (line) lines.push(line);

          // hard split very long word
          if (ctx.measureText(w).width > maxTextW) {
            let chunk = "";
            for (const ch of w) {
              const t = chunk + ch;
              if (ctx.measureText(t).width <= maxTextW) chunk = t;
              else {
                if (chunk) lines.push(chunk);
                chunk = ch;
              }
            }
            line = chunk;
          } else {
            line = w;
          }
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [""];
    }

    const lines = wrapLines(text);

    const lineH = 18;
    const topPad = 10;
    const bottomPad = 10;

    let maxLineW = 0;
    for (const ln of lines) maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
    const w = clamp(maxLineW + BUBBLE_PAD_X * 2, 120, BUBBLE_MAX_W);
    const h = topPad + lines.length * lineH + bottomPad;

    const headX = entity.x + entity.w / 2;
    const headY = entity.y;

    let bx = headX - w / 2;
    let by = headY - h - BUBBLE_OFFSET_Y;

    bx = clamp(bx, 8, W - w - 8);
    by = clamp(by, 8, H - h - 8);

    const tailBaseX = clamp(headX, bx + 18, bx + w - 18);
    const tailBaseY = by + h;

    ctx.fillStyle = "rgba(255, 245, 220, 0.95)";
    ctx.fillRect(bx, by, w, h);

    ctx.beginPath();
    ctx.moveTo(tailBaseX - BUBBLE_TAIL_W / 2, tailBaseY - 1);
    ctx.lineTo(tailBaseX + BUBBLE_TAIL_W / 2, tailBaseY - 1);
    ctx.lineTo(tailBaseX, tailBaseY + BUBBLE_TAIL_H);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, w - 2, h - 2);

    ctx.beginPath();
    ctx.moveTo(tailBaseX - BUBBLE_TAIL_W / 2, tailBaseY - 1);
    ctx.lineTo(tailBaseX + BUBBLE_TAIL_W / 2, tailBaseY - 1);
    ctx.lineTo(tailBaseX, tailBaseY + BUBBLE_TAIL_H);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.font = font;

    const startY = by + topPad + 14;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + BUBBLE_PAD_X, startY + i * lineH);
    }

    ctx.restore();
  }

  // START
  resize();
  requestAnimationFrame(tick);
})();
