const BOARD_SIZE = 8;
const GAP_TILE = "gap";
const HOLE_TILE = "hole";
const GAME_DURATION_MS = 3 * 60 * 1000;
const HOLE_START_MATCH_COUNT = 3;
const MAX_HOLES = 5;
const LEVELS = [
  { target: 1100, moves: 20 },
  { target: 1800, moves: 19 },
  { target: 2600, moves: 18 },
  { target: 3400, moves: 17 },
  { target: 4300, moves: 16 },
];

const LEVEL_LAYOUTS = [
  [
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
  ],
  [
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
  ],
  [
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
  ],
  [
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
  ],
  [
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
  ],
];

const TILE_TYPES = [
  { id: "chocolate", icon: "🍫" },
  { id: "bunny", icon: "🐰" },
  { id: "painted", icon: "🥚" },
  { id: "carrot", icon: "🥕" },
  { id: "basket", icon: "🧺" },
];

const POINTS_PER_TILE = 60;

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("scoreValue");
const movesEl = document.getElementById("movesValue");
const levelEl = document.getElementById("levelValue");
const targetEl = document.getElementById("targetValue");
const restartBtn = document.getElementById("restartBtn");
const overlayEl = document.getElementById("overlay");
const modalTitleEl = document.getElementById("modalTitle");
const modalMessageEl = document.getElementById("modalMessage");
const primaryModalBtn = document.getElementById("primaryModalBtn");
const secondaryModalBtn = document.getElementById("secondaryModalBtn");
const timerBarEl = document.getElementById("timerBar");

let board = [];
let score = 0;
let movesLeft = 0;
let levelIndex = 0;
let selectedTile = null;
let interactionLocked = false;
let audioCtx = null;
let audioEnabled = false;
let touchStart = null;
let timeLeftMs = GAME_DURATION_MS;
let timerIntervalId = null;
let matchClearCount = 0;
let holesSpawned = 0;
let totalLevelsCompleted = 0;

function randomTile() {
  return TILE_TYPES[Math.floor(Math.random() * TILE_TYPES.length)].id;
}

function getTileById(id) {
  return TILE_TYPES.find((t) => t.id === id);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function isInsideBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function isMatchableTile(value) {
  return value !== null && value !== GAP_TILE && value !== HOLE_TILE;
}

function isPlayableCell(row, col) {
  return isInsideBoard(row, col) && isMatchableTile(board[row][col]);
}

function isGapInLayout(row, col) {
  const layout = LEVEL_LAYOUTS[levelIndex % LEVEL_LAYOUTS.length];
  return layout[row][col] === "0";
}

function getLevelConfig(index = levelIndex) {
  if (index < LEVELS.length) {
    return LEVELS[index];
  }
  const lastBase = LEVELS[LEVELS.length - 1];
  const extraLevels = index - (LEVELS.length - 1);
  return {
    target: lastBase.target + extraLevels * 900,
    moves: Math.max(10, lastBase.moves - Math.floor(extraLevels / 2)),
  };
}

function initBoard() {
  board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (isGapInLayout(row, col)) {
        board[row][col] = GAP_TILE;
        continue;
      }
      let tile;
      do {
        tile = randomTile();
      } while (
        (col >= 2 && board[row][col - 1] === tile && board[row][col - 2] === tile) ||
        (row >= 2 && board[row - 1][col] === tile && board[row - 2][col] === tile)
      );
      board[row][col] = tile;
    }
  }

  // Ensure the player has at least one legal move from the start.
  while (!hasValidMoves()) {
    shuffleBoard();
  }

  renderBoard();
}

function renderBoard() {
  boardEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const typeId = board[row][col];
      if (typeId === GAP_TILE) {
        const gapEl = document.createElement("div");
        gapEl.className = "gap";
        gapEl.setAttribute("aria-hidden", "true");
        fragment.appendChild(gapEl);
        continue;
      }
      if (typeId === HOLE_TILE) {
        const holeEl = document.createElement("div");
        holeEl.className = "hole";
        holeEl.textContent = "🕳️";
        holeEl.setAttribute("aria-hidden", "true");
        fragment.appendChild(holeEl);
        continue;
      }
      const tileDef = getTileById(typeId);
      const tileEl = document.createElement("button");
      tileEl.type = "button";
      tileEl.className = `tile ${typeId}`;
      tileEl.textContent = tileDef ? tileDef.icon : "";
      tileEl.dataset.row = String(row);
      tileEl.dataset.col = String(col);
      tileEl.setAttribute("aria-label", typeId || "empty tile");

      if (selectedTile && selectedTile.row === row && selectedTile.col === col) {
        tileEl.classList.add("selected");
      }

      fragment.appendChild(tileEl);
    }
  }

  boardEl.appendChild(fragment);
}

function setTile(row, col, value) {
  board[row][col] = value;
}

function swapInBoard(a, b) {
  if (!isPlayableCell(a.row, a.col) || !isPlayableCell(b.row, b.col)) return;
  const temp = board[a.row][a.col];
  board[a.row][a.col] = board[b.row][b.col];
  board[b.row][b.col] = temp;
}

function checkMatches() {
  const groups = [];

  // Horizontal scans
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    let runStart = 0;
    while (runStart < BOARD_SIZE) {
      const tile = board[row][runStart];
      if (!isMatchableTile(tile)) {
        runStart += 1;
        continue;
      }
      let runEnd = runStart + 1;
      while (runEnd < BOARD_SIZE && isMatchableTile(board[row][runEnd]) && board[row][runEnd] === tile) {
        runEnd += 1;
      }
      const runLength = runEnd - runStart;
      if (runLength >= 3) {
        const cells = [];
        for (let c = runStart; c < runEnd; c += 1) {
          cells.push({ row, col: c });
        }
        groups.push(cells);
      }
      runStart = runEnd;
    }
  }

  // Vertical scans
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let runStart = 0;
    while (runStart < BOARD_SIZE) {
      const tile = board[runStart][col];
      if (!isMatchableTile(tile)) {
        runStart += 1;
        continue;
      }
      let runEnd = runStart + 1;
      while (runEnd < BOARD_SIZE && isMatchableTile(board[runEnd][col]) && board[runEnd][col] === tile) {
        runEnd += 1;
      }
      const runLength = runEnd - runStart;
      if (runLength >= 3) {
        const cells = [];
        for (let r = runStart; r < runEnd; r += 1) {
          cells.push({ row: r, col });
        }
        groups.push(cells);
      }
      runStart = runEnd;
    }
  }

  return groups;
}

function clearMatches(matchGroups, cascadeDepth = 0) {
  const unique = new Set();
  matchGroups.forEach((group) => {
    group.forEach(({ row, col }) => unique.add(`${row},${col}`));
  });

  unique.forEach((key) => {
    const [row, col] = key.split(",").map(Number);
    setTile(row, col, null);
  });

  const tilesCleared = unique.size;
  const comboBonus = cascadeDepth * 25 * tilesCleared;
  const points = tilesCleared * POINTS_PER_TILE + comboBonus;
  updateScore(points);
  playEggCrack();
}

function spawnHole() {
  if (holesSpawned >= MAX_HOLES) return;
  const candidates = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (isMatchableTile(board[row][col])) {
        candidates.push({ row, col });
      }
    }
  }
  if (candidates.length === 0) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  board[pick.row][pick.col] = HOLE_TILE;
  holesSpawned += 1;
}

function applyGravity() {
  const dropDistances = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let row = BOARD_SIZE - 1;
    while (row >= 0) {
      if (board[row][col] === GAP_TILE || board[row][col] === HOLE_TILE) {
        row -= 1;
        continue;
      }
      const segmentEnd = row;
      while (row >= 0 && board[row][col] !== GAP_TILE && board[row][col] !== HOLE_TILE) {
        row -= 1;
      }
      const segmentStart = row + 1;
      let writeRow = segmentEnd;
      for (let r = segmentEnd; r >= segmentStart; r -= 1) {
        const tile = board[r][col];
        if (tile === null) continue;
        board[writeRow][col] = tile;
        dropDistances[writeRow][col] = writeRow - r;
        if (writeRow !== r) {
          board[r][col] = null;
        }
        writeRow -= 1;
      }
      for (let r = writeRow; r >= segmentStart; r -= 1) {
        board[r][col] = null;
      }
    }
  }

  return dropDistances;
}

function spawnNewTiles(dropDistances) {
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let row = BOARD_SIZE - 1;
    while (row >= 0) {
      if (board[row][col] === GAP_TILE || board[row][col] === HOLE_TILE) {
        row -= 1;
        continue;
      }
      const segmentEnd = row;
      while (row >= 0 && board[row][col] !== GAP_TILE && board[row][col] !== HOLE_TILE) {
        row -= 1;
      }
      const segmentStart = row + 1;
      let nullCount = 0;
      for (let r = segmentStart; r <= segmentEnd; r += 1) {
        if (board[r][col] === null) {
          nullCount += 1;
        }
      }
      for (let offset = 0; offset < nullCount; offset += 1) {
        const spawnRow = segmentStart + offset;
        board[spawnRow][col] = randomTile();
        dropDistances[spawnRow][col] = nullCount - offset;
      }
    }
  }
}

function updateScore(points = 0) {
  score += points;
  scoreEl.textContent = String(score);
}

function updateMovesDisplay() {
  movesEl.textContent = String(movesLeft);
}

function updateLevelDisplay() {
  levelEl.textContent = String(levelIndex + 1);
  targetEl.textContent = String(getLevelConfig().target);
}

function updateTimerBar() {
  const progress = Math.max(0, Math.min(1, timeLeftMs / GAME_DURATION_MS));
  timerBarEl.style.transform = `scaleX(${progress})`;
}

function getTimerSpeedMultiplier() {
  return 2 ** Math.floor(totalLevelsCompleted / 5);
}

function stopTimer() {
  if (timerIntervalId !== null) {
    window.clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function onTimeUp() {
  stopTimer();
  showModal({
    title: "Time's Up!",
    message: "Game over. Restart to try again.",
    primaryText: "Restart",
    secondaryText: "Close",
    onPrimary: () => {
      hideModal();
      startLevel(levelIndex);
    },
    onSecondary: hideModal,
  });
}

function startTimer() {
  stopTimer();
  updateTimerBar();
  timerIntervalId = window.setInterval(() => {
    timeLeftMs = Math.max(0, timeLeftMs - 100 * getTimerSpeedMultiplier());
    updateTimerBar();
    if (timeLeftMs <= 0) {
      onTimeUp();
    }
  }, 100);
}

function getElementForCell(row, col) {
  return boardEl.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`);
}

async function animateSwap(a, b) {
  const elA = getElementForCell(a.row, a.col);
  const elB = getElementForCell(b.row, b.col);
  if (!elA || !elB) return;

  const rectA = elA.getBoundingClientRect();
  const rectB = elB.getBoundingClientRect();
  const dx = rectB.left - rectA.left;
  const dy = rectB.top - rectA.top;

  const duration = 210;
  const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
  const animA = elA.animate(
    [
      { transform: "translate(0, 0) scale(1)" },
      { offset: 0.8, transform: `translate(${dx * 1.02}px, ${dy * 1.02}px) scale(1.02)` },
      { transform: `translate(${dx}px, ${dy}px) scale(1)` },
    ],
    { duration, easing }
  );
  const animB = elB.animate(
    [
      { transform: "translate(0, 0) scale(1)" },
      { offset: 0.8, transform: `translate(${-dx * 1.02}px, ${-dy * 1.02}px) scale(1.02)` },
      { transform: `translate(${-dx}px, ${-dy}px) scale(1)` },
    ],
    { duration, easing }
  );

  await Promise.all([animA.finished.catch(() => {}), animB.finished.catch(() => {})]);
}

async function animateClear(matchGroups) {
  const unique = new Set();
  matchGroups.forEach((group) => {
    group.forEach(({ row, col }) => unique.add(`${row},${col}`));
  });

  unique.forEach((key) => {
    const [row, col] = key.split(",").map(Number);
    const cell = getElementForCell(row, col);
    if (cell) {
      cell.classList.add("clearing");
    }
  });

  await sleep(200);
}

async function animateDrop(dropDistances) {
  let origin = null;
  let below = null;
  for (let row = 0; row < BOARD_SIZE - 1 && (!origin || !below); row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const first = getElementForCell(row, col);
      const second = getElementForCell(row + 1, col);
      if (first && second) {
        origin = first;
        below = second;
        break;
      }
    }
  }
  if (!origin || !below) return;

  const stepY = below.getBoundingClientRect().top - origin.getBoundingClientRect().top;
  const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
  const animations = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const distance = dropDistances[row][col];
      if (distance <= 0) continue;
      const tileEl = getElementForCell(row, col);
      if (!tileEl) continue;
      const duration = 180 + Math.min(distance, 5) * 28;
      const animation = tileEl.animate(
        [
          { transform: `translateY(${-stepY * distance}px)` },
          { transform: "translateY(0)" },
        ],
        { duration, easing }
      );
      animations.push(animation.finished.catch(() => {}));
    }
  }

  await Promise.all(animations);
}

function createsMatchAt(row, col) {
  const tile = board[row][col];
  if (!isMatchableTile(tile)) return false;

  let count = 1;
  let c = col - 1;
  while (c >= 0 && isMatchableTile(board[row][c]) && board[row][c] === tile) {
    count += 1;
    c -= 1;
  }
  c = col + 1;
  while (c < BOARD_SIZE && isMatchableTile(board[row][c]) && board[row][c] === tile) {
    count += 1;
    c += 1;
  }
  if (count >= 3) return true;

  count = 1;
  let r = row - 1;
  while (r >= 0 && isMatchableTile(board[r][col]) && board[r][col] === tile) {
    count += 1;
    r -= 1;
  }
  r = row + 1;
  while (r < BOARD_SIZE && isMatchableTile(board[r][col]) && board[r][col] === tile) {
    count += 1;
    r += 1;
  }
  return count >= 3;
}

function hasValidMoves() {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (!isMatchableTile(board[row][col])) continue;
      if (col + 1 < BOARD_SIZE) {
        if (isMatchableTile(board[row][col + 1])) {
          swapInBoard({ row, col }, { row, col: col + 1 });
          const valid = createsMatchAt(row, col) || createsMatchAt(row, col + 1);
          swapInBoard({ row, col }, { row, col: col + 1 });
          if (valid) return true;
        }
      }
      if (row + 1 < BOARD_SIZE) {
        if (isMatchableTile(board[row + 1][col])) {
          swapInBoard({ row, col }, { row: row + 1, col });
          const valid = createsMatchAt(row, col) || createsMatchAt(row + 1, col);
          swapInBoard({ row, col }, { row: row + 1, col });
          if (valid) return true;
        }
      }
    }
  }
  return false;
}

function shuffleBoard() {
  const flat = board.flat().filter((tile) => isMatchableTile(tile));
  for (let i = flat.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [flat[i], flat[j]] = [flat[j], flat[i]];
  }
  let idx = 0;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row][col] === GAP_TILE || board[row][col] === HOLE_TILE) continue;
      board[row][col] = flat[idx];
      idx += 1;
    }
  }
}

async function resolveBoard(initialMatches = null) {
  let cascadeDepth = 0;
  let matches = initialMatches || checkMatches();

  while (matches.length > 0) {
    matchClearCount += 1;
    await animateClear(matches);
    clearMatches(matches, cascadeDepth);
    if (matchClearCount >= HOLE_START_MATCH_COUNT) {
      spawnHole();
    }
    const dropDistances = applyGravity();
    spawnNewTiles(dropDistances);
    renderBoard();
    await animateDrop(dropDistances);
    matches = checkMatches();
    cascadeDepth += 1;
  }

  if (!hasValidMoves()) {
    // Keep shuffling until board is stable and has a legal move.
    do {
      shuffleBoard();
    } while (checkMatches().length > 0 || !hasValidMoves());
    renderBoard();
  }
}

async function swapTiles(a, b) {
  if (
    interactionLocked ||
    timeLeftMs <= 0 ||
    !isAdjacent(a, b) ||
    !isPlayableCell(a.row, a.col) ||
    !isPlayableCell(b.row, b.col)
  ) {
    return;
  }
  interactionLocked = true;
  selectedTile = null;
  renderBoard();

  await animateSwap(a, b);
  swapInBoard(a, b);
  renderBoard();

  const matches = checkMatches();
  if (matches.length === 0) {
    await sleep(30);
    await animateSwap(a, b);
    swapInBoard(a, b);
    renderBoard();
    interactionLocked = false;
    return;
  }

  movesLeft -= 1;
  updateMovesDisplay();
  playBunnyHop();
  await resolveBoard(matches);
  checkWinCondition();
  interactionLocked = false;
}

function checkWinCondition() {
  const target = getLevelConfig().target;
  if (score >= target) {
    showModal({
      title: "Level Complete!",
      message: "You found all the eggs!",
      primaryText: "Next Level",
      secondaryText: "Close",
      onPrimary: () => {
        hideModal();
        totalLevelsCompleted += 1;
        levelIndex += 1;
        startLevel(levelIndex);
      },
      onSecondary: hideModal,
    });
    return true;
  }

  if (movesLeft <= 0) {
    showModal({
      title: "Game Over",
      message: "No more moves. Try again and find those eggs!",
      primaryText: "Retry",
      secondaryText: "Close",
      onPrimary: () => {
        hideModal();
        startLevel(levelIndex);
      },
      onSecondary: hideModal,
    });
    return false;
  }

  return null;
}

function showModal({ title, message, primaryText, secondaryText, onPrimary, onSecondary }) {
  modalTitleEl.textContent = title;
  modalMessageEl.textContent = message;
  primaryModalBtn.textContent = primaryText;
  secondaryModalBtn.textContent = secondaryText;
  overlayEl.classList.remove("hidden");
  interactionLocked = true;

  primaryModalBtn.onclick = onPrimary;
  secondaryModalBtn.onclick = onSecondary;
}

function hideModal() {
  overlayEl.classList.add("hidden");
  interactionLocked = false;
}

function parseTileFromEventTarget(target) {
  const tile = target.closest(".tile");
  if (!tile) return null;
  return { row: Number(tile.dataset.row), col: Number(tile.dataset.col) };
}

function enableAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  audioEnabled = true;
}

function playBunnyHop() {
  if (!audioEnabled || !audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(620, t + 0.11);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.18);
}

function playEggCrack() {
  if (!audioEnabled || !audioCtx) return;
  const t = audioCtx.currentTime;
  const bufferSize = audioCtx.sampleRate * 0.1;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  noise.connect(filter).connect(gain).connect(audioCtx.destination);
  noise.start(t);
}

function startLevel(newLevelIndex) {
  stopTimer();
  levelIndex = newLevelIndex;
  const level = getLevelConfig(levelIndex);
  score = 0;
  movesLeft = level.moves;
  selectedTile = null;
  timeLeftMs = GAME_DURATION_MS;
  matchClearCount = 0;
  holesSpawned = 0;
  updateScore(0);
  updateMovesDisplay();
  updateLevelDisplay();
  updateTimerBar();
  initBoard();
  hideModal();
  startTimer();
}

function handleTapSelection(pos) {
  if (!isPlayableCell(pos.row, pos.col)) return;
  if (timeLeftMs <= 0) return;
  if (!selectedTile) {
    selectedTile = pos;
    renderBoard();
    return;
  }

  if (selectedTile.row === pos.row && selectedTile.col === pos.col) {
    selectedTile = null;
    renderBoard();
    return;
  }

  if (isAdjacent(selectedTile, pos)) {
    const start = selectedTile;
    selectedTile = null;
    swapTiles(start, pos);
  } else {
    selectedTile = pos;
    renderBoard();
  }
}

function bindInput() {
  boardEl.addEventListener("pointerdown", (event) => {
    const pos = parseTileFromEventTarget(event.target);
    if (!pos || interactionLocked || timeLeftMs <= 0 || !isPlayableCell(pos.row, pos.col)) return;
    enableAudio();
    touchStart = { ...pos, x: event.clientX, y: event.clientY };
  });

  boardEl.addEventListener("pointerup", (event) => {
    if (!touchStart || interactionLocked) {
      touchStart = null;
      return;
    }

    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    const swipeThreshold = 18;

    if (Math.abs(dx) > swipeThreshold || Math.abs(dy) > swipeThreshold) {
      let nextRow = touchStart.row;
      let nextCol = touchStart.col;
      if (Math.abs(dx) > Math.abs(dy)) {
        nextCol += dx > 0 ? 1 : -1;
      } else {
        nextRow += dy > 0 ? 1 : -1;
      }

      if (isInsideBoard(nextRow, nextCol)) {
        swapTiles(
          { row: touchStart.row, col: touchStart.col },
          { row: nextRow, col: nextCol }
        );
      }
    } else {
      handleTapSelection({ row: touchStart.row, col: touchStart.col });
    }

    touchStart = null;
  });

  boardEl.addEventListener("pointercancel", () => {
    touchStart = null;
  });
}

restartBtn.addEventListener("click", () => {
  startLevel(levelIndex);
});

primaryModalBtn.addEventListener("click", () => {});
secondaryModalBtn.addEventListener("click", () => {});

bindInput();
startLevel(0);
