import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A source document ingested into a person's RAG corpus. Text chunks and
 * vectors live in Qdrant; this row tracks lifecycle and provenance.
 */
@Entity('documents')
export class DocumentEntity {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  personId: string;

  @Column()
  title: string;

  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ type: 'int', default: 0 })
  chunkCount: number;

  @Column({ default: 'indexing' })
  status: 'indexing' | 'indexed' | 'failed';

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
