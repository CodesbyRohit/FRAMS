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
 * projections live in Neo4j. This row is the source of truth for both, and
 * records whether each projection actually succeeded.
 */
@Entity('memories')
export class MemoryEntity {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  personId: string;

  /** The memory event this memory was materialized from. */
  @Index()
  @Column({ type: 'text', nullable: true })
  sourceEventId?: string | null;

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

  /** Rule-based weight by event type (see memory-indexer.ts). Not a model output. */
  @Column({ type: 'float', default: 0.5 })
  importance: number;

  /** True once the memory's embedding is stored in the vector index. */
  @Column({ type: 'boolean', default: false })
  vectorIndexed: boolean;

  /** True once the memory has been projected into the knowledge graph. */
  @Column({ type: 'boolean', default: false })
  graphSynced: boolean;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
