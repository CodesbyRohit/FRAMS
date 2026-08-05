import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * The raw interaction stream — the event-sourced journal of a person's life
 * inside the platform. Everything the twin knows ultimately traces back to
 * one of these rows, which is what makes every insight explainable.
 */
@Entity('memory_events')
export class MemoryEventEntity {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  personId: string;

  @Column()
  type: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  occurredAt: string;

  @CreateDateColumn()
  createdAt: string;
}
