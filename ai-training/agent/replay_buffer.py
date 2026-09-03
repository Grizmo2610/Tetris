"""
replay_buffer.py — Experience replay buffer for DQN training.

Stores (state, action, reward, next_state, done) transitions.
Supports uniform sampling only (no PER) — keeps it simple and fast.
"""

import numpy as np
from collections import deque
import random


class ReplayBuffer:
    """
    Circular buffer of fixed capacity.
    Sampling is uniform-random (standard DQN).
    """

    def __init__(self, capacity: int, obs_dim: int = 224):
        self.capacity  = capacity
        self.obs_dim   = obs_dim
        self.size      = 0
        self.ptr       = 0   # write pointer (circular)

        # Pre-allocate contiguous arrays — much faster than list-of-tuples
        self.states      = np.zeros((capacity, obs_dim), dtype=np.float32)
        self.actions     = np.zeros(capacity,             dtype=np.int64)
        self.rewards     = np.zeros(capacity,             dtype=np.float32)
        self.next_states = np.zeros((capacity, obs_dim), dtype=np.float32)
        self.dones       = np.zeros(capacity,             dtype=np.float32)

    def push(self, state, action, reward, next_state, done):
        i = self.ptr
        self.states[i]      = state
        self.actions[i]     = action
        self.rewards[i]     = reward
        self.next_states[i] = next_state
        self.dones[i]       = float(done)

        self.ptr  = (self.ptr + 1) % self.capacity
        self.size = min(self.size + 1, self.capacity)

    def sample(self, batch_size: int):
        indices = np.random.randint(0, self.size, size=batch_size)
        return (
            self.states[indices],
            self.actions[indices],
            self.rewards[indices],
            self.next_states[indices],
            self.dones[indices],
        )

    def __len__(self):
        return self.size

    def is_ready(self, batch_size: int) -> bool:
        return self.size >= batch_size
