'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  recTrackCombo(cleared); // records
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  recOnGameOver(); // records
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  recOnInit(); // records
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Records ----
const REC_KEY = 'tetris.records';
const REC_MAX = 5;
const REC_NAME_KEY = 'tetris.lastName';
let recCombo = 0, recGameBestCombo = 0, recSaved = false, recQualifies = false;

function recLoad() {
  const data = { top: [], bestCombo: 0, maxLines: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(REC_KEY));
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.top)) {
        for (const e of raw.top) {
          if (e && Number.isFinite(e.score)) {
            data.top.push({
              name: String(e.name ?? '').slice(0, 12) || 'Anónimo',
              score: e.score,
              lines: Number.isFinite(e.lines) ? e.lines : 0,
              date: typeof e.date === 'string' ? e.date : '',
            });
          }
        }
        data.top.sort((a, b) => b.score - a.score);
        data.top = data.top.slice(0, REC_MAX);
      }
      if (Number.isFinite(raw.bestCombo)) data.bestCombo = raw.bestCombo;
      if (Number.isFinite(raw.maxLines)) data.maxLines = raw.maxLines;
    }
  } catch (e) { /* datos corruptos o localStorage no disponible */ }
  return data;
}

function recStore(data) {
  try { localStorage.setItem(REC_KEY, JSON.stringify(data)); } catch (e) { /* ignorar */ }
}

function recTrackCombo(cleared) {
  if (cleared > 0) {
    recCombo++;
    if (recCombo > recGameBestCombo) recGameBestCombo = recCombo;
  } else {
    recCombo = 0;
  }
}

function recQualifiesFor(data, s) {
  return s > 0 && (data.top.length < REC_MAX || s > data.top[data.top.length - 1].score);
}

function recRender(highlight) {
  const data = recLoad();
  for (const id of ['rec-list', 'rec-list-over']) {
    const ol = document.getElementById(id);
    ol.textContent = '';
    if (!data.top.length) {
      const li = document.createElement('li');
      li.className = 'rec-empty';
      li.textContent = 'Sin records';
      ol.appendChild(li);
    }
    data.top.forEach((e, i) => {
      const li = document.createElement('li');
      if (id === 'rec-list-over' && i === highlight) li.className = 'rec-new';
      const n = document.createElement('span');
      n.className = 'rec-name';
      n.textContent = e.name;
      const s = document.createElement('span');
      s.className = 'rec-score';
      s.textContent = e.score.toLocaleString();
      li.append(n, s);
      li.title = `${e.lines} líneas${e.date ? ' - ' + e.date : ''}`;
      ol.appendChild(li);
    });
  }
  for (const id of ['rec-combo', 'rec-combo-over'])
    document.getElementById(id).textContent = data.bestCombo;
  for (const id of ['rec-lines', 'rec-lines-over'])
    document.getElementById(id).textContent = data.maxLines;
}

function recOnInit() {
  recCombo = 0;
  recGameBestCombo = 0;
  recSaved = false;
  document.getElementById('rec-gameover').hidden = true;
  recRender(-1);
}

function recOnGameOver() {
  const data = recLoad();
  if (recGameBestCombo > data.bestCombo) data.bestCombo = recGameBestCombo;
  if (lines > data.maxLines) data.maxLines = lines;
  recStore(data);
  recQualifies = recQualifiesFor(data, score);
  document.getElementById('rec-form').hidden = !recQualifies;
  document.getElementById('rec-msg').textContent = recQualifies ? '¡Entras en el Top 5!' : '';
  const input = document.getElementById('rec-name');
  try { input.value = localStorage.getItem(REC_NAME_KEY) || ''; } catch (e) { input.value = ''; }
  document.getElementById('rec-gameover').hidden = false;
  recRender(-1);
  // retraso para no capturar teclas que el jugador aún esté pulsando
  if (recQualifies) setTimeout(() => { if (gameOver && !recSaved) input.focus(); }, 600);
}

function recSave() {
  if (recSaved || !recQualifies) return;
  const name = document.getElementById('rec-name').value.trim().slice(0, 12) || 'Anónimo';
  try { localStorage.setItem(REC_NAME_KEY, name); } catch (e) { /* ignorar */ }
  const data = recLoad();
  const entry = { name, score, lines, date: new Date().toISOString().slice(0, 10) };
  data.top.push(entry);
  data.top.sort((a, b) => b.score - a.score); // estable: empates quedan tras los antiguos
  data.top = data.top.slice(0, REC_MAX);
  recStore(data);
  recSaved = true;
  document.getElementById('rec-form').hidden = true;
  document.getElementById('rec-msg').textContent = '¡Record guardado!';
  recRender(data.top.indexOf(entry));
  restartBtn.focus();
}

function recReset() {
  if (!confirm('¿Borrar todos los records?')) return;
  try { localStorage.removeItem(REC_KEY); } catch (e) { /* ignorar */ }
  recRender(-1);
}

document.getElementById('rec-save').addEventListener('click', recSave);
document.getElementById('rec-name').addEventListener('keydown', e => {
  e.stopPropagation(); // evita atajos de juego (P, Space...) mientras se escribe
  if (e.key === 'Enter') recSave();
});
for (const id of ['rec-reset', 'rec-reset-over'])
  document.getElementById(id).addEventListener('click', e => { recReset(); e.currentTarget.blur(); });
// ---- Fin Records ----

init();
