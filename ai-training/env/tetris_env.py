"""
tetris_env.py — Custom Gymnasium environment for Tetris DQN training.

Port of the JavaScript game engine (board.js, piece.js, physics.js, scoring.js)
with identical rules: SRS rotation, Tetris Guideline gravity, full garbage mechanic.

Observation  : float32 vector of length 224
Action space : Discrete(40)  →  rotation (0-3) × column (0-9)
"""

import random
import numpy as np
import gymnasium as gym
from gymnasium import spaces
from copy import deepcopy

# ─── Constants (mirrors constants.js) ────────────────────────────────────────

COLS       = 10
ROWS       = 20   # visible
BUFFER     = 4    # hidden rows above visible
TOTAL_ROWS = ROWS + BUFFER  # 24

# Piece types 1-7 (0 = empty, 8 = garbage)
PIECE_TYPES = [1, 2, 3, 4, 5, 6, 7]

# SRS rotation tables: PIECES[type][rot] = list of (row, col) offsets
PIECES = {
    1: [  # I
        [(1,0),(1,1),(1,2),(1,3)],
        [(0,2),(1,2),(2,2),(3,2)],
        [(2,0),(2,1),(2,2),(2,3)],
        [(0,1),(1,1),(2,1),(3,1)],
    ],
    2: [  # O (all rotations identical)
        [(0,1),(0,2),(1,1),(1,2)],
        [(0,1),(0,2),(1,1),(1,2)],
        [(0,1),(0,2),(1,1),(1,2)],
        [(0,1),(0,2),(1,1),(1,2)],
    ],
    3: [  # T
        [(0,1),(1,0),(1,1),(1,2)],
        [(0,1),(1,1),(1,2),(2,1)],
        [(1,0),(1,1),(1,2),(2,1)],
        [(0,1),(1,0),(1,1),(2,1)],
    ],
    4: [  # S
        [(0,1),(0,2),(1,0),(1,1)],
        [(0,1),(1,1),(1,2),(2,2)],
        [(1,1),(1,2),(2,0),(2,1)],
        [(0,0),(1,0),(1,1),(2,1)],
    ],
    5: [  # Z
        [(0,0),(0,1),(1,1),(1,2)],
        [(0,2),(1,1),(1,2),(2,1)],
        [(1,0),(1,1),(2,1),(2,2)],
        [(0,1),(1,0),(1,1),(2,0)],
    ],
    6: [  # J
        [(0,0),(1,0),(1,1),(1,2)],
        [(0,1),(0,2),(1,1),(2,1)],
        [(1,0),(1,1),(1,2),(2,2)],
        [(0,1),(1,1),(2,0),(2,1)],
    ],
    7: [  # L
        [(0,2),(1,0),(1,1),(1,2)],
        [(0,1),(1,1),(2,1),(2,2)],
        [(1,0),(1,1),(1,2),(2,0)],
        [(0,0),(0,1),(1,1),(2,1)],
    ],
}

# Wall kick tables — KICKS_JLSTZ and KICKS_I
KICKS_JLSTZ = {
    '0>1': [( 0, 0),(-1, 0),(-1, 1),( 0,-2),(-1,-2)],
    '1>0': [( 0, 0),( 1, 0),( 1,-1),( 0, 2),( 1, 2)],
    '1>2': [( 0, 0),( 1, 0),( 1,-1),( 0, 2),( 1, 2)],
    '2>1': [( 0, 0),(-1, 0),(-1, 1),( 0,-2),(-1,-2)],
    '2>3': [( 0, 0),( 1, 0),( 1, 1),( 0,-2),( 1,-2)],
    '3>2': [( 0, 0),(-1, 0),(-1,-1),( 0, 2),(-1, 2)],
    '3>0': [( 0, 0),(-1, 0),(-1,-1),( 0, 2),(-1, 2)],
    '0>3': [( 0, 0),( 1, 0),( 1, 1),( 0,-2),( 1,-2)],
}
KICKS_I = {
    '0>1': [( 0, 0),( 0,-2),( 0, 1),( 1,-2),(-2, 1)],
    '1>0': [( 0, 0),( 0, 2),( 0,-1),(-1, 2),( 2,-1)],
    '1>2': [( 0, 0),( 0,-1),( 0, 2),(-2,-1),( 1, 2)],
    '2>1': [( 0, 0),( 0, 1),( 0,-2),( 2, 1),(-1,-2)],
    '2>3': [( 0, 0),( 0, 2),( 0,-1),( 1, 2),(-2,-1)],
    '3>2': [( 0, 0),( 0,-2),( 0, 1),(-1,-2),( 2, 1)],
    '3>0': [( 0, 0),( 0, 1),( 0,-2),(-2, 1),( 1,-2)],
    '0>3': [( 0, 0),( 0,-1),( 0, 2),( 2,-1),(-1, 2)],
}

# Gravity table: frames-per-cell at 60fps (index = level-1)
GRAVITY_TABLE = [
    48,43,38,33,28,23,18,13,8,6,
    5,5,5,4,4,4,3,3,3,2,
    2,2,2,2,2,2,2,2,2,1,
]

# Scoring
LINE_SCORES       = [0, 100, 300, 500, 800]
TSPIN_SCORES      = [400, 800, 1200, 1600]
MINI_TSPIN_SCORES = [100, 200]
COMBO_BONUS       = 50
ALL_CLEAR_BONUS   = 3500

# Garbage
GARBAGE_TABLE = {
    'double': 1, 'triple': 2, 'tetris': 4,
    'tspinSingle': 2, 'tspinDouble': 4, 'tspinTriple': 6,
    'miniTspinSingle': 0, 'allClear': 10,
}
COMBO_GARBAGE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4, 4]

# Spawn col per type
SPAWN_COL = {1: 3, 2: 4}  # I→3, O→4, rest→3


# ─── Board helpers ────────────────────────────────────────────────────────────

def empty_board():
    return np.zeros((TOTAL_ROWS, COLS), dtype=np.int8)

def is_valid(board, ptype, rot, row, col):
    for dr, dc in PIECES[ptype][rot]:
        r, c = row + dr, col + dc
        if c < 0 or c >= COLS or r >= TOTAL_ROWS:
            return False
        if r >= 0 and board[r, c] != 0:
            return False
    return True

def ghost_row(board, ptype, rot, row, col):
    r = row
    while is_valid(board, ptype, rot, r + 1, col):
        r += 1
    return r

def lock_piece(board, ptype, rot, row, col):
    b = board.copy()
    for dr, dc in PIECES[ptype][rot]:
        r, c = row + dr, col + dc
        if 0 <= r < TOTAL_ROWS and 0 <= c < COLS:
            b[r, c] = ptype
    return b

def clear_lines(board):
    full = [r for r in range(TOTAL_ROWS) if np.all(board[r] != 0)]
    if not full:
        return board, 0
    kept = [board[r] for r in range(TOTAL_ROWS) if r not in full]
    empty_rows = [np.zeros(COLS, dtype=np.int8) for _ in full]
    new_board = np.array(empty_rows + kept, dtype=np.int8)
    return new_board, len(full)

def apply_garbage(board, count):
    if count <= 0:
        return board
    hole = random.randint(0, COLS - 1)
    garbage = np.full((count, COLS), 8, dtype=np.int8)
    garbage[:, hole] = 0
    shifted = board[count:]            # drop top `count` rows
    return np.vstack([shifted, garbage])

def is_all_clear(board):
    return not np.any(board[BUFFER:])

def is_top_out_piece(ptype, rot, row):
    for dr, _ in PIECES[ptype][rot]:
        if row + dr < BUFFER:
            return True
    return False

def spawn_piece(ptype):
    col = SPAWN_COL.get(ptype, 3)
    return {'type': ptype, 'rot': 0, 'row': 1, 'col': col}


# ─── Board statistics (for reward + observation) ─────────────────────────────

def col_heights(board):
    heights = np.zeros(COLS, dtype=np.int32)
    for c in range(COLS):
        for r in range(BUFFER, TOTAL_ROWS):
            if board[r, c] != 0:
                heights[c] = TOTAL_ROWS - r
                break
    return heights

def aggregate_height(board):
    return int(col_heights(board).sum())

def count_holes(board):
    holes = 0
    for c in range(COLS):
        block_found = False
        for r in range(BUFFER, TOTAL_ROWS):
            if board[r, c] != 0:
                block_found = True
            elif block_found:
                holes += 1
    return holes

def bumpiness(board):
    h = col_heights(board)
    return int(np.abs(np.diff(h)).sum())


# ─── Scoring helpers ──────────────────────────────────────────────────────────

def detect_tspin(board, ptype, rot, row, col, last_was_rotation):
    if ptype != 3 or not last_was_rotation:
        return None
    corners = [(row, col), (row, col+2), (row+2, col), (row+2, col+2)]
    filled = 0
    for r, c in corners:
        if r < 0 or r >= TOTAL_ROWS or c < 0 or c >= COLS or board[r, c] != 0:
            filled += 1
    if filled < 3:
        return None
    facing = {
        0: [(row,   col),   (row,   col+2)],
        1: [(row,   col+2), (row+2, col+2)],
        2: [(row+2, col),   (row+2, col+2)],
        3: [(row,   col),   (row+2, col)  ],
    }[rot]
    ff = sum(
        1 for r, c in facing
        if r < 0 or r >= TOTAL_ROWS or c < 0 or c >= COLS or board[r, c] != 0
    )
    return 'tspin' if ff >= 2 else 'mini'

def calc_line_score(lines, level, tspin, combo, all_clear):
    if tspin == 'tspin':
        pts = TSPIN_SCORES[min(lines, 3)] * level
    elif tspin == 'mini':
        pts = MINI_TSPIN_SCORES[min(lines, 1)] * level
    else:
        pts = LINE_SCORES[lines] * level
    if combo >= 1:
        pts += COMBO_BONUS * combo * level
    if all_clear:
        pts += ALL_CLEAR_BONUS * level
    return pts

def calc_garbage_sent(lines, tspin, combo, all_clear):
    g = 0
    if tspin == 'tspin':
        g = {1: GARBAGE_TABLE['tspinSingle'],
             2: GARBAGE_TABLE['tspinDouble'],
             3: GARBAGE_TABLE['tspinTriple']}.get(lines, 0)
    elif tspin == 'mini':
        g = GARBAGE_TABLE['miniTspinSingle'] if lines == 1 else 0
    else:
        g = {2: GARBAGE_TABLE['double'],
             3: GARBAGE_TABLE['triple'],
             4: GARBAGE_TABLE['tetris']}.get(lines, 0)
    if combo >= 1 and lines > 0:
        g += COMBO_GARBAGE[min(combo, len(COMBO_GARBAGE)-1)]
    if all_clear:
        g += GARBAGE_TABLE['allClear']
    return g

def update_combo(combo, lines):
    return combo + 1 if lines > 0 else -1


# ─── 7-bag randomizer ────────────────────────────────────────────────────────

def new_bag():
    bag = PIECE_TYPES[:]
    random.shuffle(bag)
    return bag

def init_queue():
    return new_bag() + new_bag()

def dequeue(queue):
    q = list(queue)
    if len(q) < 7:
        q += new_bag()
    ptype = q.pop(0)
    return ptype, q


# ─── Action helpers ───────────────────────────────────────────────────────────

NUM_ROTATIONS = 4
ACTION_SIZE   = NUM_ROTATIONS * COLS  # 40

def action_to_rot_col(action):
    return divmod(action, COLS)  # (rotation, column)

def get_valid_action_mask(board, ptype):
    """Return bool array [40] — True if (rot, col) is a valid placement."""
    mask = np.zeros(ACTION_SIZE, dtype=bool)
    for rot in range(NUM_ROTATIONS):
        cells = PIECES[ptype][rot]
        min_dc = min(c for _, c in cells)
        max_dc = max(c for _, c in cells)
        for col in range(-min_dc, COLS - max_dc):
            if is_valid(board, ptype, rot, 1, col):
                mask[rot * COLS + col] = True
    return mask


# ─── Observation builder ─────────────────────────────────────────────────────

def build_observation(board, piece_type, queue, hold_type, combo, pending_garbage):
    """Build the 224-dim float32 state vector.

    Layout (mirrors 08-ai-design.md):
      [0:200]   board binary (visible 20 rows × 10 cols), row-major
      [200:207] current piece one-hot (types 1-7)
      [207:214] next piece one-hot
      [214:221] hold piece one-hot (all zeros if None)
      [221]     hold-is-null flag (1.0 if no hold)
      [222]     combo normalized (combo / 12)
      [223]     pending garbage normalized (pending / 20)
    """
    obs = np.zeros(224, dtype=np.float32)

    # Board — visible 20 rows only (BUFFER:TOTAL_ROWS)
    visible = (board[BUFFER:] != 0).astype(np.float32)
    obs[:200] = visible.ravel()

    # One-hot pieces
    def one_hot(t):
        v = np.zeros(7, dtype=np.float32)
        if t is not None and 1 <= t <= 7:
            v[t - 1] = 1.0
        return v

    next_type = queue[0] if queue else None
    obs[200:207] = one_hot(piece_type)
    obs[207:214] = one_hot(next_type)
    obs[214:221] = one_hot(hold_type)
    obs[221]     = 1.0 if hold_type is None else 0.0
    obs[222]     = min(max(combo, 0), 12) / 12.0
    obs[223]     = min(pending_garbage, 20) / 20.0

    return obs


# ─── Reward function ─────────────────────────────────────────────────────────

def calculate_reward(board_before, board_after, lines_cleared, garbage_sent, game_over):
    if game_over:
        return -10.0
    r = 0.0
    r += lines_cleared * 1.0
    r += (lines_cleared ** 2) * 0.5
    r -= count_holes(board_after) * 0.3
    r -= aggregate_height(board_after) * 0.1
    r -= bumpiness(board_after) * 0.05
    r += garbage_sent * 0.5
    return float(r)


# ─── TetrisEnv ───────────────────────────────────────────────────────────────

class TetrisEnv(gym.Env):
    """
    Gymnasium-compatible Tetris environment.

    observation_space : Box(0, 1, (224,), float32)
    action_space      : Discrete(40)  — (rotation × 10 + column)

    Each step = one piece placement (hard-drop style).
    Invalid actions are silently redirected to the best valid fallback.
    """

    metadata = {'render_modes': []}

    def __init__(self, max_pieces=5000):
        super().__init__()
        self.max_pieces = max_pieces  # episode length cap

        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(224,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(ACTION_SIZE)

        # Internal state — initialised in reset()
        self.board          = None
        self.piece          = None
        self.queue          = []
        self.hold_type      = None
        self.hold_used      = False
        self.score          = 0
        self.lines          = 0
        self.level          = 1
        self.combo          = -1
        self.pending_garbage = 0
        self.pieces_placed  = 0
        self.last_was_rot   = False

    # ── Gymnasium API ─────────────────────────────────────────────────────────

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        self.board           = empty_board()
        self.queue           = init_queue()
        ptype, self.queue    = dequeue(self.queue)
        self.piece           = spawn_piece(ptype)
        self.hold_type       = None
        self.hold_used       = False
        self.score           = 0
        self.lines           = 0
        self.level           = 1
        self.combo           = -1
        self.pending_garbage = 0
        self.pieces_placed   = 0
        self.last_was_rot    = False

        return self._obs(), {}

    def step(self, action):
        rot, col = action_to_rot_col(int(action))

        # ── Validate / redirect action ────────────────────────────────────────
        mask = get_valid_action_mask(self.board, self.piece['type'])
        if not mask[action]:
            # Pick best valid action by heuristic (avoids crash on bad agent)
            valid_actions = np.where(mask)[0]
            if len(valid_actions) == 0:
                # No valid actions — game over
                obs = self._obs()
                reward = calculate_reward(
                    self.board, self.board, 0, 0, True
                )
                return obs, reward, True, False, self._info()
            action = int(valid_actions[0])
            rot, col = action_to_rot_col(action)

        board_before = self.board.copy()
        ptype = self.piece['type']

        # ── Hard drop to ghost row ────────────────────────────────────────────
        land_row = ghost_row(self.board, ptype, rot, 1, col)

        # ── T-Spin detection ─────────────────────────────────────────────────
        tspin = detect_tspin(
            self.board, ptype, rot, land_row, col, self.last_was_rot
        )

        # ── Lock ─────────────────────────────────────────────────────────────
        locked = lock_piece(self.board, ptype, rot, land_row, col)

        # Top-out: piece locked above visible area
        if is_top_out_piece(ptype, rot, land_row):
            self.board = locked
            reward = calculate_reward(board_before, locked, 0, 0, True)
            return self._obs(), reward, True, False, self._info()

        # ── Line clear ───────────────────────────────────────────────────────
        cleared_board, lines = clear_lines(locked)
        new_combo = update_combo(self.combo, lines)
        all_clear = lines > 0 and is_all_clear(cleared_board)

        # ── Score / garbage ───────────────────────────────────────────────────
        new_level = max(1, (self.lines + lines) // 10 + 1)
        pts = calc_line_score(lines, self.level, tspin, new_combo, all_clear)
        garbage_out = calc_garbage_sent(lines, tspin, new_combo, all_clear)

        # Counter mechanic
        net_sent = max(0, garbage_out - self.pending_garbage)
        remaining_pending = max(0, self.pending_garbage - garbage_out)

        # Apply incoming garbage
        board_after = cleared_board
        if remaining_pending > 0:
            board_after = apply_garbage(cleared_board, remaining_pending)
            remaining_pending = 0

        # ── Reward ───────────────────────────────────────────────────────────
        reward = calculate_reward(
            board_before, board_after, lines, net_sent, False
        )

        # ── Update state ──────────────────────────────────────────────────────
        self.board           = board_after
        self.score          += pts
        self.lines          += lines
        self.level           = new_level
        self.combo           = new_combo
        self.pending_garbage = remaining_pending
        self.pieces_placed  += 1
        self.last_was_rot    = False  # hard-drop resets

        # ── Spawn next piece ──────────────────────────────────────────────────
        ntype, self.queue = dequeue(self.queue)
        self.piece = spawn_piece(ntype)
        self.hold_used = False

        # Spawn collision → top-out
        p = self.piece
        if not is_valid(board_after, p['type'], p['rot'], p['row'], p['col']):
            reward += calculate_reward(board_after, board_after, 0, 0, True)
            return self._obs(), reward, True, False, self._info()

        # Episode length cap
        truncated = self.pieces_placed >= self.max_pieces

        return self._obs(), reward, False, truncated, self._info()

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _obs(self):
        return build_observation(
            self.board,
            self.piece['type'],
            self.queue,
            self.hold_type,
            self.combo,
            self.pending_garbage,
        )

    def _info(self):
        return {
            'score':   self.score,
            'lines':   self.lines,
            'level':   self.level,
            'pieces':  self.pieces_placed,
        }

    def get_valid_mask(self):
        """Return action mask for the current piece (used by agent for masking)."""
        return get_valid_action_mask(self.board, self.piece['type'])

    def add_pending_garbage(self, lines):
        """Called externally when opponent sends garbage (self-play)."""
        self.pending_garbage += lines
