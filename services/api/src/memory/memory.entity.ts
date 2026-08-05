import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export interface MemoryEvidenceRow {
  type: string;
  id: string;
  label: string;
}

export interface MemoryEntityRow {
  label: string;
  name: string;
}

/**
 * A consolidated memory unit — the human-readable, queryable knowledge derived
 * from the raw event stream. Vectors for these rows live in Qdrant; graph
 * projections live in Neo4j. This row is the source of truth for both.
 */
@Entity('memories')
export class MemoryEntity {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  personId: string;

  @Column()
  kind: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  evidence: MemoryEvidenceRow[];

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  entities: MemoryEntityRow[];

  @Column({ type: 'float', default: 0.5 })
  importance: number;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
