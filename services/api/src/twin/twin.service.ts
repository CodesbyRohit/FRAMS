import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { newId } from '../common/ids';
import { TwinEntity, TwinGoalRow, TwinSkillRow, TwinStatsRow } from './twin.entity';

export interface TwinUpdate {
  skills?: TwinSkillRow[];
  goals?: TwinGoalRow[];
  interests?: string[];
  narrative?: string;
  statsDelta?: Partial<TwinStatsRow>;
}

const EMPTY_STATS: TwinStatsRow = {
  memories: 0,
  documents: 0,
  projects: 0,
  interactions: 0,
  daysActive: 0,
};

/**
 * Owns the Digital Twin read model. All twin mutations flow through here so
 * versioning and update timestamps stay consistent.
 */
@Injectable()
export class TwinService {
  constructor(
    @InjectRepository(TwinEntity)
    private readonly repo: Repository<TwinEntity>,
  ) {}

  async createTwin(personId: string): Promise<TwinEntity> {
    const twin = this.repo.create({
      id: newId('twin'),
      personId,
      skills: [],
      goals: [],
      interests: [],
      narrative: 'An emerging intelligence, still writing its story.',
      stats: { ...EMPTY_STATS },
      version: 1,
    });
    return this.repo.save(twin);
  }

  async getTwin(personId: string): Promise<TwinEntity> {
    const twin = await this.repo.findOne({ where: { personId } });
    if (!twin) {
      throw new NotFoundException('No digital twin exists for this identity yet.');
    }
    return twin;
  }

  async getTwinSafe(personId: string): Promise<TwinEntity | null> {
    return this.repo.findOne({ where: { personId } });
  }

  async update(personId: string, patch: TwinUpdate): Promise<TwinEntity> {
    const twin = await this.getTwin(personId);
    if (patch.skills) twin.skills = patch.skills;
    if (patch.goals) twin.goals = patch.goals;
    if (patch.interests) twin.interests = patch.interests;
    if (patch.narrative !== undefined) twin.narrative = patch.narrative;
    if (patch.statsDelta) {
      twin.stats = {
        memories: twin.stats.memories + (patch.statsDelta.memories ?? 0),
        documents: twin.stats.documents + (patch.statsDelta.documents ?? 0),
        projects: twin.stats.projects + (patch.statsDelta.projects ?? 0),
        interactions: twin.stats.interactions + (patch.statsDelta.interactions ?? 0),
        daysActive: Math.max(twin.stats.daysActive, patch.statsDelta.daysActive ?? 0),
      };
    }
    twin.version += 1;
    return this.repo.save(twin);
  }

  /** Apply a skill observation: raise level toward evidence, keep lastObserved fresh. */
  upsertSkill(personId: string, name: string, strength = 1): Promise<TwinEntity> {
    const normalized = name.trim().replace(/\s+/g, ' ');
    return this.getTwin(personId).then((twin) => {
      const existing = twin.skills.find((s) => s.name.toLowerCase() === normalized.toLowerCase());
      if (existing) {
        existing.evidenceCount += 1;
        existing.level = Math.min(0.99, existing.level + 0.12 * strength * (1 - existing.level));
        existing.lastObserved = new Date().toISOString();
      } else {
        twin.skills.push({
          name: normalized,
          level: Math.min(0.9, 0.25 * strength),
          evidenceCount: 1,
          lastObserved: new Date().toISOString(),
        });
      }
      twin.version += 1;
      return this.repo.save(twin);
    });
  }

  upsertGoal(
    personId: string,
    goal: Omit<TwinGoalRow, 'id' | 'createdAt'> & { id?: string },
  ): Promise<TwinEntity> {
    return this.getTwin(personId).then((twin) => {
      const existing = twin.goals.find((g) => g.id === goal.id);
      if (existing) {
        Object.assign(existing, goal);
      } else {
        twin.goals.push({
          id: newId('goal'),
          createdAt: new Date().toISOString(),
          ...goal,
        });
      }
      twin.version += 1;
      return this.repo.save(twin);
    });
  }
}
