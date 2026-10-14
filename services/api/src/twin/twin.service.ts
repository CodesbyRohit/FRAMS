import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { newId } from '../common/ids';
import { TwinEntity, TwinGoalRow, TwinStatsRow } from './twin.entity';

/** Placeholder narrative for a twin nobody has written about yet. */
export const EMPTY_NARRATIVE = 'An emerging intelligence, still writing its story.';

const EMPTY_STATS: TwinStatsRow = {
  memories: 0,
  documents: 0,
  projects: 0,
  interactions: 0,
  daysActive: 0,
};

/** Stats with every counter present (rows created before a counter existed may lack it). */
export function statsOf(twin: TwinEntity): TwinStatsRow {
  return { ...EMPTY_STATS, ...(twin.stats ?? {}) };
}

/** Pure twin transformations — unit-testable without a database. */
export const twinOps = {
  /** Raise a skill toward evidence, or add it. Names are matched case-insensitively. */
  observeSkill(twin: TwinEntity, name: string, at: Date): void {
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    const existing = twin.skills.find((s) => s.name.toLowerCase() === normalized.toLowerCase());
    if (existing) {
      existing.evidenceCount += 1;
      existing.level = Math.min(0.99, existing.level + 0.12 * (1 - existing.level));
      existing.lastObserved = at.toISOString();
    } else {
      twin.skills.push({ name: normalized, level: 0.25, evidenceCount: 1, lastObserved: at.toISOString() });
    }
  },

  addStats(twin: TwinEntity, delta: Partial<Omit<TwinStatsRow, 'daysActive'>>): void {
    const s = { ...EMPTY_STATS, ...twin.stats };
    twin.stats = {
      memories: s.memories + (delta.memories ?? 0),
      documents: Math.max(0, s.documents + (delta.documents ?? 0)),
      projects: s.projects + (delta.projects ?? 0),
      interactions: s.interactions + (delta.interactions ?? 0),
      daysActive: s.daysActive,
    };
  },

  /** Count a new active UTC day at most once. */
  touchActiveDay(twin: TwinEntity, at: Date): void {
    const day = at.toISOString().slice(0, 10);
    if (twin.lastActiveOn !== day) {
      twin.stats = { ...EMPTY_STATS, ...twin.stats, daysActive: (twin.stats?.daysActive ?? 0) + 1 };
      twin.lastActiveOn = day;
    }
  },

  mergeInterests(twin: TwinEntity, interests: string[]): void {
    const merged = new Map(twin.interests.map((i) => [i.toLowerCase(), i]));
    for (const i of interests) merged.set(i.toLowerCase(), i);
    twin.interests = [...merged.values()].slice(0, 30);
  },
};

/**
 * Owns the Digital Twin read model. Every mutation runs inside a transaction
 * holding a row lock on the twin, so concurrent writers (the memory indexer,
 * goal/skill mutations from the UI) serialize instead of overwriting each
 * other's read-modify-write.
 */
@Injectable()
export class TwinService {
  constructor(
    @InjectRepository(TwinEntity)
    private readonly repo: Repository<TwinEntity>,
  ) {}

  async createTwin(personId: string, manager?: EntityManager): Promise<TwinEntity> {
    const repo = manager ? manager.getRepository(TwinEntity) : this.repo;
    const twin = repo.create({
      id: newId('twin'),
      personId,
      skills: [],
      goals: [],
      interests: [],
      narrative: EMPTY_NARRATIVE,
      stats: { ...EMPTY_STATS },
      version: 1,
      lastActiveOn: null,
    });
    return repo.save(twin);
  }

  async getTwin(personId: string): Promise<TwinEntity> {
    const twin = await this.repo.findOne({ where: { personId } });
    if (!twin) {
      throw new NotFoundException('No digital twin exists for this identity yet.');
    }
    return twin;
  }

  /** Apply `change` to the twin under a pessimistic row lock; bumps the version. */
  async mutate(personId: string, change: (twin: TwinEntity) => void): Promise<TwinEntity> {
    return this.repo.manager.transaction(async (em) => {
      const twin = await em.findOne(TwinEntity, {
        where: { personId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!twin) {
        throw new NotFoundException('No digital twin exists for this identity yet.');
      }
      change(twin);
      twin.version += 1;
      return em.save(twin);
    });
  }

  upsertSkill(personId: string, name: string): Promise<TwinEntity> {
    return this.mutate(personId, (twin) => twinOps.observeSkill(twin, name, new Date()));
  }

  addGoal(personId: string, goal: { title: string; description?: string }): Promise<TwinEntity> {
    return this.mutate(personId, (twin) => {
      const row: TwinGoalRow = {
        id: newId('goal'),
        title: goal.title,
        description: goal.description,
        status: 'active',
        progress: 0,
        createdAt: new Date().toISOString(),
      };
      twin.goals.push(row);
    });
  }

  updateGoal(
    personId: string,
    goalId: string,
    patch: { status?: TwinGoalRow['status']; progress?: number },
  ): Promise<TwinEntity> {
    return this.mutate(personId, (twin) => {
      const goal = twin.goals.find((g) => g.id === goalId);
      if (!goal) {
        throw new NotFoundException('No such goal on your twin.');
      }
      if (patch.status !== undefined) goal.status = patch.status;
      if (patch.progress !== undefined) goal.progress = Math.max(0, Math.min(1, patch.progress));
      if (goal.status === 'achieved') goal.progress = 1;
    });
  }

  removeGoal(personId: string, goalId: string): Promise<TwinEntity> {
    return this.mutate(personId, (twin) => {
      const before = twin.goals.length;
      twin.goals = twin.goals.filter((g) => g.id !== goalId);
      if (twin.goals.length === before) {
        throw new NotFoundException('No such goal on your twin.');
      }
    });
  }

  async deleteFor(personId: string, manager?: EntityManager): Promise<void> {
    await (manager ? manager.getRepository(TwinEntity) : this.repo).delete({ personId });
  }
}
