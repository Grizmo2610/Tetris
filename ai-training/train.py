"""
train.py — DQN training loop for Tetris AI.

Usage:
  # Train from scratch
  python train.py

  # Resume from checkpoint
  python train.py --resume checkpoints/ep20000.pt

  # Override hyperparams
  python train.py --episodes 30000 --device cuda

Checkpoints are saved to checkpoints/ every 5000 episodes.
Hard model  → checkpoints/ep30000.pt  (upload as tetris-ai-hard.onnx)
Expert model→ checkpoints/ep50000.pt  (upload as tetris-ai-expert.onnx)

Logging:
  - Console: progress every 100 episodes
  - W&B (optional): set WANDB_PROJECT env variable or pass --wandb
"""

import os
import sys
import argparse
import time
import numpy as np

# ── Weights & Biases (optional) ───────────────────────────────────────────────
try:
    import wandb
    WANDB_AVAILABLE = True
except ImportError:
    WANDB_AVAILABLE = False

from env.tetris_env import TetrisEnv
from agent.dqn import DQNAgent


# ─── Hyperparameters ─────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    'episodes':           50_000,
    'max_pieces':         5_000,    # episode length cap (truncation)
    'lr':                 1e-3,
    'gamma':              0.99,
    'epsilon_start':      1.0,
    'epsilon_min':        0.01,
    'epsilon_decay':      0.995,
    'buffer_capacity':    50_000,
    'batch_size':         64,
    'target_update_freq': 100,      # episodes
    'learn_every':        1,        # steps between gradient updates
    'checkpoint_freq':    5000,     # episodes
    'log_freq':           100,      # episodes
    'checkpoint_dir':     'checkpoints',
    'device':             'auto',
}


# ─── Evaluation helper ───────────────────────────────────────────────────────

def evaluate(agent: DQNAgent, n_episodes: int = 5, max_pieces: int = 5000) -> dict:
    """Run n_episodes with greedy policy, return mean stats."""
    env = TetrisEnv(max_pieces=max_pieces)
    scores, lines_list, lengths = [], [], []
    for _ in range(n_episodes):
        obs, _ = env.reset()
        done = truncated = False
        while not done and not truncated:
            mask = env.get_valid_mask()
            action = agent.select_action_greedy(obs, mask)
            obs, _, done, truncated, info = env.step(action)
        scores.append(info['score'])
        lines_list.append(info['lines'])
        lengths.append(info['pieces'])
    return {
        'eval_score_mean':  np.mean(scores),
        'eval_lines_mean':  np.mean(lines_list),
        'eval_length_mean': np.mean(lengths),
    }


# ─── Training loop ───────────────────────────────────────────────────────────

def train(config: dict, resume_path: str | None = None, use_wandb: bool = False):
    os.makedirs(config['checkpoint_dir'], exist_ok=True)

    # W&B init
    if use_wandb and WANDB_AVAILABLE:
        wandb.init(
            project=os.environ.get('WANDB_PROJECT', 'tetris-dqn'),
            config=config,
        )

    # Environment
    env = TetrisEnv(max_pieces=config['max_pieces'])

    # Agent
    agent = DQNAgent(
        lr=config['lr'],
        gamma=config['gamma'],
        epsilon_start=config['epsilon_start'],
        epsilon_min=config['epsilon_min'],
        epsilon_decay=config['epsilon_decay'],
        buffer_capacity=config['buffer_capacity'],
        batch_size=config['batch_size'],
        target_update_freq=config['target_update_freq'],
        device=config['device'],
    )

    start_episode = 0
    if resume_path:
        agent.load(resume_path)
        # Parse episode number from filename if possible
        base = os.path.basename(resume_path)
        if base.startswith('ep') and base.endswith('.pt'):
            try:
                start_episode = int(base[2:-3])
            except ValueError:
                pass

    print(f"[Train] Device: {agent.device}")
    print(f"[Train] Episodes: {start_episode} → {config['episodes']}")
    print(f"[Train] Buffer capacity: {config['buffer_capacity']:,}")

    # Rolling stats
    recent_scores   = []
    recent_lines    = []
    recent_lengths  = []
    recent_losses   = []
    total_steps     = 0
    t_start         = time.time()

    for episode in range(start_episode, config['episodes']):
        obs, _ = env.reset()
        done = truncated = False
        ep_reward = 0.0
        ep_steps  = 0
        ep_losses = []

        while not done and not truncated:
            mask   = env.get_valid_mask()
            action = agent.select_action(obs, mask)
            next_obs, reward, done, truncated, info = env.step(action)

            agent.store(obs, action, reward, next_obs, done or truncated)

            if total_steps % config['learn_every'] == 0:
                loss = agent.learn()
                if loss is not None:
                    ep_losses.append(loss)

            obs         = next_obs
            ep_reward  += reward
            ep_steps   += 1
            total_steps += 1

        agent.on_episode_end()

        recent_scores.append(info['score'])
        recent_lines.append(info['lines'])
        recent_lengths.append(info['pieces'])
        if ep_losses:
            recent_losses.append(np.mean(ep_losses))

        # ── Logging ──────────────────────────────────────────────────────────
        if (episode + 1) % config['log_freq'] == 0:
            window = min(config['log_freq'], len(recent_scores))
            mean_score  = np.mean(recent_scores[-window:])
            mean_lines  = np.mean(recent_lines[-window:])
            mean_length = np.mean(recent_lengths[-window:])
            mean_loss   = np.mean(recent_losses[-window:]) if recent_losses else 0.0
            elapsed     = time.time() - t_start

            # Quick Q-value sample
            sample_obs, _ = TetrisEnv().reset()
            sample_mask   = TetrisEnv().get_valid_mask()
            q_mean        = agent.q_value_mean(sample_obs, sample_mask)

            log = {
                'episode':          episode + 1,
                'episode_score':    mean_score,
                'episode_lines':    mean_lines,
                'episode_length':   mean_length,
                'loss':             mean_loss,
                'epsilon':          agent.epsilon,
                'q_value_mean':     q_mean,
                'buffer_size':      len(agent.buffer),
                'total_steps':      total_steps,
                'elapsed_sec':      elapsed,
            }

            print(
                f"Ep {episode+1:>6} | "
                f"score {mean_score:>8.0f} | "
                f"lines {mean_lines:>6.1f} | "
                f"len {mean_length:>6.1f} | "
                f"loss {mean_loss:.4f} | "
                f"ε {agent.epsilon:.4f} | "
                f"buf {len(agent.buffer):>6,}"
            )

            if use_wandb and WANDB_AVAILABLE:
                wandb.log(log, step=episode + 1)

        # ── Checkpoint ───────────────────────────────────────────────────────
        if (episode + 1) % config['checkpoint_freq'] == 0:
            path = os.path.join(
                config['checkpoint_dir'], f"ep{episode+1}.pt"
            )
            agent.save(path)
            print(f"[Checkpoint] Saved → {path}")

            # Evaluation run at checkpoint
            eval_stats = evaluate(agent, n_episodes=5, max_pieces=config['max_pieces'])
            print(
                f"[Eval]  score {eval_stats['eval_score_mean']:.0f} | "
                f"lines {eval_stats['eval_lines_mean']:.1f} | "
                f"len {eval_stats['eval_length_mean']:.1f}"
            )
            if use_wandb and WANDB_AVAILABLE:
                wandb.log(eval_stats, step=episode + 1)

    # Final checkpoint
    final_path = os.path.join(config['checkpoint_dir'], 'final.pt')
    agent.save(final_path)
    print(f"[Train] Done. Final checkpoint → {final_path}")

    if use_wandb and WANDB_AVAILABLE:
        wandb.finish()

    return agent


# ─── CLI ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description='Train Tetris DQN')
    p.add_argument('--episodes',    type=int,   default=None)
    p.add_argument('--device',      type=str,   default=None)
    p.add_argument('--resume',      type=str,   default=None,
                   help='Path to checkpoint .pt to resume from')
    p.add_argument('--wandb',       action='store_true',
                   help='Enable Weights & Biases logging')
    p.add_argument('--lr',          type=float, default=None)
    p.add_argument('--batch-size',  type=int,   default=None)
    return p.parse_args()


if __name__ == '__main__':
    args = parse_args()
    config = dict(DEFAULT_CONFIG)
    if args.episodes  is not None: config['episodes']   = args.episodes
    if args.device    is not None: config['device']     = args.device
    if args.lr        is not None: config['lr']         = args.lr
    if args.batch_size is not None: config['batch_size'] = args.batch_size

    train(config, resume_path=args.resume, use_wandb=args.wandb)
