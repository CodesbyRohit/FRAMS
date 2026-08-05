import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface TwinSkillRow {
  name: string;
  level: number;
  evidenceCount: number;
  lastObserved: string;
}

export interface TwinGoalRow {
  id: string;
  title: string;
  description?: string;
  status: string;
  progress: number;
  createdAt: string;
}

export interface TwinStatsRow {
  memories: number;
  documents: number;
  projects: number;
  interactions: number;
  daysActive: number;
}

/**
 * The evolving AI Digital Twin. One per person. Every memory event mutates
 * this row through the TwinService — the twin is the materialized projection
 * of the person's memory stream (a lightweight event-sourcing read model).
 */
@Entity('twins')
export class TwinEntity {
  @PrimaryColumn()
  id: string;

  @Index({ unique: true })
  @Column()
  personId: string;

  @Column({ default: 1 })
  version: number;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  skills: TwinSkillRow[];

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  goals: TwinGoalRow[];

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  interests: string[];

  @Column({ type: 'text', default: 'An emerging intelligence, still writing its story.' })
  narrative: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  stats: TwinStatsRow;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
