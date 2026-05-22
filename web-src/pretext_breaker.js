import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext";

var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d", { alpha: false });
var DPR = 1, W = 0, H = 0;
var state = "title";
var score = 0, best = 0, lives = 3, level = 1, combo = 1;
var paddle, ball, bricks = [], particles = [], stars = [], textCache = {};
var last = 0, shake = 0, isDraggingBall = false, lineStates = [], textHitboxOffset = 2, ballSpeedMultiplier = 1.0;

var FONT = "14px monospace";
var TITLE_FONT = "700 30px monospace";
var SMALL_FONT = "12px monospace";
var WORDS = [
  "PRETEXT", "LAYOUT", "REFLOW", "CANVAS", "GLYPH", "SHAPE", "WIDTH",
  "KERN", "CACHE", "LINES", "TOKENS", "FLOW", "ARCADE", "TEXT"
];
var PROSE = (
  "PRETEXT  BREAKER  turns  text  into  terrain.  Every  frame,  the  prose  field  is  measured,  split,  and  reflowed  " +
  "around  moving  obstacles.  The  ball  cuts  a  path  through  language.  The  paddle  bends  paragraphs.  Bricks  are  " +
  "not  sprites;  they  are  words  waiting  to  be  broken.  This  is  the  trick:  no  boring  rectangle  of  text,  no  static  " +
  "wallpaper,  just  layout  reacting  like  a  game  system.  "
);

function pretextPrepare(text, font) {
  var key = font + "|" + text;
  if (textCache[key]) return textCache[key];
  var prepared = prepareWithSegments(String(text), font);
  textCache[key] = prepared;
  return prepared;
}

function pretextLayout(prepared, maxWidth, lineHeight) {
  return layoutWithLines(prepared, maxWidth, lineHeight);
}

function ltrim(value) { return String(value).replace(/^\s+/, ""); }
function rtrim(value) { return String(value).replace(/\s+$/, ""); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

function resize() {
  DPR = window.devicePixelRatio || 1;
  W = Math.max(320, Math.floor(window.innerWidth));
  H = Math.max(480, Math.floor(window.innerHeight));
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  buildStars();
  resetRound(false);
}

function buildStars() {
  stars = [];
  for (var i = 0; i < 54; i++) stars.push({ x: rand(0, W), y: rand(0, H), a: rand(0.15, 0.75), s: rand(0.4, 1.4) });
}

function resetRound(full) {
  if (full) {
    score = 0; lives = 3; level = 1; combo = 1;
  }
  paddle = { x: W / 2 - 54, y: H - 72, w: 108, h: 16, target: W / 2 };
  ball = { x: W / 2, y: H - 110, vx: 1.8 + level * 0.1, vy: -2.4 - level * 0.08, r: 8, trail: [] };
  createBricks();
}

function createBricks() {
  bricks = [];
  var cols = W < 420 ? 5 : 6;
  var rows = 5;
  var gap = 8;
  var margin = 18;
  var bw = (W - margin * 2 - gap * (cols - 1)) / cols;
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      bricks.push({
        x: margin + c * (bw + gap),
        y: 92 + r * 31,
        w: bw,
        h: 22,
        alive: true,
        word: WORDS[(r * cols + c + level) % WORDS.length],
        hue: (178 + r * 31 + c * 8) % 360
      });
    }
  }
}

function serve() {
  ball.x = paddle.x + paddle.w / 2;
  ball.y = paddle.y - 22;
  ball.vx = (Math.random() > 0.5 ? 1 : -1) * (1.8 + level * 0.1);
  ball.vy = -2.4 - level * 0.08;
  combo = 1;
}

function obstaclesForText() {
  var list = [
    { kind: "circle", cx: ball.x, cy: ball.y, r: ball.r + textHitboxOffset }
  ];
  for (var i = 0; i < bricks.length; i++) {
    var b = bricks[i];
    if (b.alive) list.push({ x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 });
  }
  return list;
}

function blockedSegments(y, lineHeight, obstacles) {
  var segs = [];
  for (var i = 0; i < obstacles.length; i++) {
    var o = obstacles[i];
    if (o.kind === "circle") {
      var centerY = y + lineHeight / 2;
      var dy = Math.abs(centerY - o.cy);
      if (dy < o.r) {
        var half = Math.sqrt(o.r * o.r - dy * dy);
        segs.push({ x1: o.cx - half, x2: o.cx + half });
      }
    } else if (y + lineHeight > o.y && y < o.y + o.h) {
      segs.push({ x1: o.x, x2: o.x + o.w });
    }
  }
  segs.sort(function(a, b) { return a.x1 - b.x1; });
  return segs;
}

function drawReactiveProse() {
  var lineHeight = 24;
  var prepared = pretextPrepare(PROSE + PROSE + PROSE + PROSE, FONT);
  var layout = pretextLayout(prepared, W - 28, lineHeight);
  var obstacles = obstaclesForText();
  ctx.font = FONT;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(130, 255, 220, 0.22)";
  var proseBottom = Math.max(260, paddle.y - 60);

  var lineIndex = 0;
  for (var y = 52; y < proseBottom; y += lineHeight) {
    var lineText = layout.lines[lineIndex % layout.lines.length].text;
    var blocked = blockedSegments(y, lineHeight, obstacles);

    if (!lineStates[lineIndex]) {
      lineStates[lineIndex] = { gapX1: 14, gapX2: 14, splitIndex: 0, active: false };
    }
    var state = lineStates[lineIndex];

    if (blocked.length > 0) {
      var mainGap = blocked[0];
      for (var i = 1; i < blocked.length; i++) {
        if ((blocked[i].x2 - blocked[i].x1) > (mainGap.x2 - mainGap.x1)) mainGap = blocked[i];
      }

      var gapCenter = (mainGap.x1 + mainGap.x2) / 2;
      var splitIndex = 0;
      for (var i = 0; i < lineText.length; i++) {
        if (ctx.measureText(lineText.substring(0, i)).width > (gapCenter - 14)) {
          splitIndex = i;
          break;
        }
        splitIndex = i;
      }

      // If this is a new split, initialize positions to the split point
      // instead of the screen edges to prevent "flying in"
      var anchorX = 14 + ctx.measureText(lineText.substring(0, splitIndex)).width;
      if (!state.active) {
        state.gapX1 = anchorX;
        state.gapX2 = anchorX;
      }

      state.active = true;
      state.splitIndex = splitIndex;
      // Smooth parting: interpolate towards target gap positions (0.2 factor)
      state.gapX1 += (mainGap.x1 - 5 - state.gapX1) * 0.2;
      state.gapX2 += (mainGap.x2 + 5 - state.gapX2) * 0.2;
    } else {
      state.active = false;
      var anchorX = 14 + ctx.measureText(lineText.substring(0, state.splitIndex)).width;
      // Slower return to center (0.06 factor)
      state.gapX1 += (anchorX - state.gapX1) * 0.06;
      state.gapX2 += (anchorX - state.gapX2) * 0.06;
    }

    if (state.active || Math.abs(state.gapX1 - state.gapX2) > 0.5) {
      var leftPart = lineText.substring(0, state.splitIndex);
      var rightPart = lineText.substring(state.splitIndex);
      ctx.textAlign = "right";
      ctx.fillText(leftPart, state.gapX1, y);
      ctx.textAlign = "left";
      ctx.fillText(rightPart, state.gapX2, y);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(lineText, 14, y);
    }
    lineIndex++;
  }
}

function availableRuns(y, lineHeight, obstacles) {
  var blocked = blockedSegments(y, lineHeight, obstacles);
  var runs = [];
  var cursor = 14;
  for (var i = 0; i < blocked.length; i++) {
    var seg = blocked[i];
    var left = clamp(seg.x1, 14, W - 14);
    var right = clamp(seg.x2, 14, W - 14);
    if (left - cursor > 10) runs.push({ x1: cursor, x2: left });
    cursor = Math.max(cursor, right);
  }
  if (W - 14 - cursor > 10) runs.push({ x1: cursor, x2: W - 14 });
  return runs;
}


function update(dt) {
  if (state !== "playing") return;
  paddle.x += (paddle.target - paddle.x - paddle.w / 2) * 0.22;
  paddle.x = clamp(paddle.x, 12, W - paddle.w - 12);

  if (!isDraggingBall) {
    ball.x += ball.vx * ballSpeedMultiplier * dt;
    ball.y += ball.vy * ballSpeedMultiplier * dt;
  }

  ball.trail.push({ x: ball.x, y: ball.y, r: ball.r, a: 0.6 });
  if (ball.trail.length > 9) ball.trail.shift();
  if (ball.x < ball.r + 8 || ball.x > W - ball.r - 8) ball.vx *= -1;
  if (ball.y < ball.r + 48) ball.vy *= -1;
  if (ball.y > H + 26) {
    lives--;
    shake = 10;
    if (lives <= 0) { state = "over"; best = Math.max(best, score); }
    else serve();
  }
  var hitPaddle = ball.x > paddle.x && ball.x < paddle.x + paddle.w && ball.y + ball.r > paddle.y && ball.y - ball.r < paddle.y + paddle.h;
  if (hitPaddle && ball.vy > 0) {
    var offset = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    ball.vx = offset * (3.0 + level * 0.12);
    ball.vy = -Math.abs(ball.vy) - 0.05;
    burst(ball.x, paddle.y, "#eaffff", 8);
  }
  for (var i = 0; i < bricks.length; i++) {
    var b = bricks[i];
    if (!b.alive) continue;
    var hit = ball.x > b.x && ball.x < b.x + b.w && ball.y - ball.r < b.y + b.h && ball.y + ball.r > b.y;
    if (hit) {
      b.alive = false;
      ball.vy *= -1;
      score += 25 * combo;
      combo = Math.min(8, combo + 1);
      shake = 5;
      burst(b.x + b.w / 2, b.y + b.h / 2, "hsl(" + b.hue + ", 95%, 66%)", 18);
      if (allCleared()) {
        level++;
        createBricks();
        serve();
      }
      break;
    }
  }
  for (var p = particles.length - 1; p >= 0; p--) {
    var part = particles[p];
    part.x += part.vx * dt; part.y += part.vy * dt; part.vy += 0.04 * dt; part.life -= 0.025 * dt;
    if (part.life <= 0) particles.splice(p, 1);
  }
  if (shake > 0) shake -= dt;
}

function allCleared() {
  for (var i = 0; i < bricks.length; i++) if (bricks[i].alive) return false;
  return true;
}

function burst(x, y, color, count) {
  for (var i = 0; i < count; i++) {
    particles.push({ x: x, y: y, vx: rand(-2.3, 2.3), vy: rand(-2.5, 1.3), life: rand(0.45, 1), color: color, text: WORDS[Math.floor(rand(0, WORDS.length))].charAt(0) });
  }
}

function draw() {
  ctx.save();
  var sx = shake > 0 ? rand(-shake, shake) * 0.35 : 0;
  var sy = shake > 0 ? rand(-shake, shake) * 0.35 : 0;
  ctx.translate(sx, sy);
  drawBackground();
  drawReactiveProse();
  drawBricks();
  drawPaddle();
  drawBall();
  drawParticles();
  drawHud();
  if (state === "title") drawOverlay("PRETEXT BREAKER", "Tap to launch the text field", "Drag to move. Break word-bricks.");
  if (state === "over") drawOverlay("GAME OVER", "Tap to restart", "Best " + best + "  Score " + score);
  ctx.restore();
}

function drawBackground() {
  var g = ctx.createRadialGradient(W * 0.5, H * 0.12, 20, W * 0.5, H * 0.4, H * 0.75);
  g.addColorStop(0, "#102a34");
  g.addColorStop(0.62, "#071017");
  g.addColorStop(1, "#020305");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    ctx.globalAlpha = s.a;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  var hudY = paddle.y - 45;
  ctx.textBaseline = "alphabetic";
  ctx.font = SMALL_FONT;

  // Draw border lines
  ctx.strokeStyle = "rgba(141, 247, 255, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hudY - 25);
  ctx.lineTo(W, hudY - 25);
  ctx.moveTo(0, hudY + 42); // Increased height to fit two rows of controls
  ctx.lineTo(W, hudY + 42);
  ctx.stroke();

  ctx.fillStyle = "rgba(141, 247, 255, 0.08)";
  ctx.fillRect(0, hudY - 25, W, 67);

  ctx.fillStyle = "#effff9";
  ctx.textAlign = "left";
  ctx.fillText("SCORE " + score, 20, hudY);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f7ff6b";
  ctx.fillText("LEVEL " + level + "  x" + combo, W / 2, hudY);
  ctx.textAlign = "right";
  ctx.fillStyle = "#8df7ff";
  ctx.fillText("LIVES " + lives, W - 20, hudY);

  // Debug controls row 1: Hitbox
  var ctrlY1 = hudY + 14;
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(141, 247, 255, 0.7)";
  ctx.fillText("TEXT HITBOX: " + (ball ? (ball.r + textHitboxOffset).toFixed(0) : "0"), 20, ctrlY1);
  ctx.font = "12px monospace";
  ctx.fillStyle = "#f7ff6b";
  ctx.textAlign = "center";
  ctx.fillText("[-]", 130, ctrlY1);
  ctx.fillText("[+]", 165, ctrlY1);

  // Debug controls row 2: Ball Speed
  var ctrlY2 = hudY + 32;
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(141, 247, 255, 0.7)";
  ctx.fillText("BALL SPEED:  " + ballSpeedMultiplier.toFixed(1) + "x", 20, ctrlY2);
  ctx.font = "12px monospace";
  ctx.fillStyle = "#f7ff6b";
  ctx.textAlign = "center";
  ctx.fillText("[-]", 130, ctrlY2);
  ctx.fillText("[+]", 165, ctrlY2);
}

function drawBricks() {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 13px monospace";
  for (var i = 0; i < bricks.length; i++) {
    var b = bricks[i];
    if (!b.alive) continue;
    var color = "hsl(" + b.hue + ", 95%, 62%)";
    ctx.shadowBlur = 16;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    roundRect(b.x, b.y, b.w, b.h, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#061014";
    ctx.fillText(b.word, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
}

function drawPaddle() {
  var y = paddle.y + paddle.h / 2;
  var g = ctx.createLinearGradient(paddle.x, y, paddle.x + paddle.w, y);
  g.addColorStop(0, "#8df7ff"); g.addColorStop(0.48, "#ffffff"); g.addColorStop(1, "#f7ff6b");
  ctx.lineCap = "round";
  ctx.shadowBlur = 18; ctx.shadowColor = "#8df7ff";
  ctx.strokeStyle = g;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(paddle.x + 8, y);
  ctx.lineTo(paddle.x + paddle.w - 8, y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.moveTo(paddle.x + 14, y - 1);
  ctx.lineTo(paddle.x + paddle.w - 14, y - 1);
  ctx.stroke();
}

function drawBall() {
  for (var i = 0; i < ball.trail.length; i++) {
    var t = ball.trail[i];
    ctx.globalAlpha = i / ball.trail.length * 0.35;
    ctx.fillStyle = "#8df7ff";
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r + i * 0.25, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 22; ctx.shadowColor = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawParticles() {
  ctx.font = "700 13px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawOverlay(title, action, sub) {
  ctx.fillStyle = "rgba(2, 4, 7, 0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = TITLE_FONT;
  ctx.shadowBlur = 24; ctx.shadowColor = "#8df7ff";
  ctx.fillStyle = "#f7ff6b";
  ctx.fillText(title, W / 2, H * 0.42);
  ctx.shadowBlur = 0;
  ctx.font = "16px monospace";
  ctx.fillStyle = "#e8fff8";
  ctx.fillText(action, W / 2, H * 0.42 + 38);
  ctx.font = SMALL_FONT;
  ctx.fillStyle = "#8aa2a8";
  ctx.fillText(sub, W / 2, H * 0.42 + 62);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function pointerX(event) {
  if (event.touches && event.touches.length) return event.touches[0].clientX;
  return event.clientX;
}

function pointerY(event) {
  if (event.touches && event.touches.length) return event.touches[0].clientY;
  return event.clientY;
}

function handleInput(event) {
  var x = pointerX(event);
  var y = pointerY(event);

  var hudY = paddle.y - 45;

  // Hitbox controls detection (Row 1)
  var ctrlY1 = hudY + 14;
  if (y > ctrlY1 - 15 && y < ctrlY1 + 10) {
    if (x > 115 && x < 145) {
      textHitboxOffset = Math.max(-7, textHitboxOffset - 1);
      return;
    }
    if (x > 150 && x < 180) {
      textHitboxOffset += 1;
      return;
    }
  }

  // Ball Speed controls detection (Row 2)
  var ctrlY2 = hudY + 32;
  if (y > ctrlY2 - 15 && y < ctrlY2 + 10) {
    if (x > 115 && x < 145) {
      ballSpeedMultiplier = Math.max(0.1, ballSpeedMultiplier - 0.1);
      return;
    }
    if (x > 150 && x < 180) {
      ballSpeedMultiplier = Math.min(3.0, ballSpeedMultiplier + 0.1);
      return;
    }
  }

  if (ball) {
    var dx = x - ball.x;
    var dy = y - ball.y;
    if (Math.sqrt(dx*dx + dy*dy) < 40) {
      isDraggingBall = true;
      ball.vx = 0; ball.vy = 0;
      return;
    }
  }

  if (paddle) paddle.target = x;
  if (state === "title") { state = "playing"; serve(); }
  else if (state === "over") { resetRound(true); state = "playing"; serve(); }
}

function handleMove(event) {
  var x = pointerX(event);
  var y = pointerY(event);
  if (isDraggingBall && ball) {
    ball.x = x;
    ball.y = y;
  } else if (paddle) {
    paddle.target = x;
  }
}

function handleEnd() {
  isDraggingBall = false;
}

canvas.addEventListener("mousemove", handleMove);
canvas.addEventListener("mousedown", handleInput);
canvas.addEventListener("mouseup", handleEnd);
canvas.addEventListener("touchmove", function(e) { e.preventDefault(); handleMove(e); }, { passive: false });
canvas.addEventListener("touchstart", function(e) { e.preventDefault(); handleInput(e); }, { passive: false });
canvas.addEventListener("touchend", handleEnd);
window.addEventListener("resize", resize);

function frame(now) {
  var dt = Math.min(2, (now - last) / 16.666 || 1);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);


