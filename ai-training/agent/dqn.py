"""
dqn.py — Deep Q-Network agent for Tetris.

Architecture (mirrors 08-ai-design.md):
  Input: 224 → Dense(256) → ReLU → Dense(128) → ReLU → Dense(64) → ReLU → Output: 40

Action space: 40 = 4 rotations × 10 columns.
Invalid actions are masked with -inf before argmax so the agent never
picks an illegal placement.
"""

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F

from .replay_buffer import ReplayBuffer

# ─── Network ─────────────────────────────────────────────────────────────────

class DQNNetwork(nn.Module):
    def __init__(self, input_dim: int = 224, output_dim: int = 40):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, output_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


# ─── Agent ───────────────────────────────────────────────────────────────────

class DQNAgent:
    """
    Standard DQN with:
      - Epsilon-greedy exploration (with action masking)
      - Fixed target network (updated every `target_update_freq` episodes)
      - Uniform experience replay
    """

    def __init__(
        self,
        obs_dim:              int   = 224,
        action_dim:           int   = 40,
        lr:                   float = 1e-3,
        gamma:                float = 0.99,
        epsilon_start:        float = 1.0,
        epsilon_min:          float = 0.01,
        epsilon_decay:        float = 0.995,
        buffer_capacity:      int   = 50_000,
        batch_size:           int   = 64,
        target_update_freq:   int   = 100,   # episodes
        device:               str   = 'auto',
    ):
        self.obs_dim    = obs_dim
        self.action_dim = action_dim
        self.gamma      = gamma
        self.epsilon    = epsilon_start
        self.eps_min    = epsilon_min
        self.eps_decay  = epsilon_decay
        self.batch_size = batch_size
        self.target_update_freq = target_update_freq
        self._episode_count     = 0

        if device == 'auto':
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        else:
            self.device = torch.device(device)

        # Online and target networks
        self.online = DQNNetwork(obs_dim, action_dim).to(self.device)
        self.target = DQNNetwork(obs_dim, action_dim).to(self.device)
        self._sync_target()
        self.target.eval()

        self.optimizer = optim.Adam(self.online.parameters(), lr=lr)
        self.buffer    = ReplayBuffer(buffer_capacity, obs_dim)

    # ── Action selection ──────────────────────────────────────────────────────

    def select_action(self, state: np.ndarray, valid_mask: np.ndarray) -> int:
        """
        Epsilon-greedy with action masking.
        valid_mask: bool array [40], True = valid placement.
        """
        valid_indices = np.where(valid_mask)[0]
        if len(valid_indices) == 0:
            return 0  # shouldn't happen, but safe fallback

        # Explore
        if np.random.random() < self.epsilon:
            return int(np.random.choice(valid_indices))

        # Exploit — mask invalid actions with -inf
        state_t = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        with torch.no_grad():
            q_values = self.online(state_t).squeeze(0).cpu().numpy()

        masked = q_values.copy()
        masked[~valid_mask] = -np.inf
        return int(np.argmax(masked))

    def select_action_greedy(self, state: np.ndarray, valid_mask: np.ndarray) -> int:
        """Pure greedy (no exploration) — used for evaluation."""
        state_t = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        with torch.no_grad():
            q_values = self.online(state_t).squeeze(0).cpu().numpy()
        masked = q_values.copy()
        masked[~valid_mask] = -np.inf
        return int(np.argmax(masked))

    # ── Learning ──────────────────────────────────────────────────────────────

    def store(self, state, action, reward, next_state, done):
        self.buffer.push(state, action, reward, next_state, done)

    def learn(self) -> float | None:
        """Sample a batch and do one gradient step. Returns loss or None."""
        if not self.buffer.is_ready(self.batch_size):
            return None

        states, actions, rewards, next_states, dones = self.buffer.sample(self.batch_size)

        states_t      = torch.FloatTensor(states).to(self.device)
        actions_t     = torch.LongTensor(actions).to(self.device)
        rewards_t     = torch.FloatTensor(rewards).to(self.device)
        next_states_t = torch.FloatTensor(next_states).to(self.device)
        dones_t       = torch.FloatTensor(dones).to(self.device)

        # Current Q-values
        q_current = self.online(states_t).gather(1, actions_t.unsqueeze(1)).squeeze(1)

        # Target Q-values (Double DQN)
        with torch.no_grad():
            next_actions = self.online(next_states_t).argmax(dim=1)
            q_next       = self.target(next_states_t).gather(1, next_actions.unsqueeze(1)).squeeze(1)
            q_target     = rewards_t + self.gamma * q_next * (1.0 - dones_t)

        loss = F.smooth_l1_loss(q_current, q_target)
        self.optimizer.zero_grad()
        loss.backward()
        # Gradient clipping for stability
        nn.utils.clip_grad_norm_(self.online.parameters(), max_norm=10.0)
        self.optimizer.step()

        return float(loss.item())

    def on_episode_end(self):
        """Call at the end of every episode to decay epsilon and sync target."""
        self._episode_count += 1
        self.epsilon = max(self.eps_min, self.epsilon * self.eps_decay)
        if self._episode_count % self.target_update_freq == 0:
            self._sync_target()

    def _sync_target(self):
        self.target.load_state_dict(self.online.state_dict())

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self, path: str):
        torch.save({
            'online_state_dict':  self.online.state_dict(),
            'target_state_dict':  self.target.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'epsilon':            self.epsilon,
            'episode_count':      self._episode_count,
        }, path)

    def load(self, path: str):
        ckpt = torch.load(path, map_location=self.device)
        self.online.load_state_dict(ckpt['online_state_dict'])
        self.target.load_state_dict(ckpt['target_state_dict'])
        self.optimizer.load_state_dict(ckpt['optimizer_state_dict'])
        self.epsilon         = ckpt.get('epsilon', self.eps_min)
        self._episode_count  = ckpt.get('episode_count', 0)
        print(f"[DQN] Loaded checkpoint: episode {self._episode_count}, ε={self.epsilon:.4f}")

    def q_value_mean(self, state: np.ndarray, valid_mask: np.ndarray) -> float:
        state_t = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        with torch.no_grad():
            q = self.online(state_t).squeeze(0).cpu().numpy()
        return float(q[valid_mask].mean()) if valid_mask.any() else 0.0
