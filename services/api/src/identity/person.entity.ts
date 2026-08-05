import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * The human identity. Deliberately minimal — all derived knowledge lives in
 * the Twin, the memory stream and the knowledge graph.
 */
@Entity('persons')
export class PersonEntity {
  @PrimaryColumn()
  id: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column()
  displayName: string;

  @Column({ type: 'text', nullable: true })
  avatarUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  bio?: string | null;

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  roles: string[];

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
