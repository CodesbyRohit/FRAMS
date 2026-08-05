import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Cached trust posture per identity. The authoritative computations happen in
 * the Trust Service; the API materializes them here for fast reads.
 */
@Entity('trust_profiles')
export class TrustProfileEntity {
  @PrimaryColumn()
  personId: string;

  @Column({ type: 'float', default: 0.5 })
  identityScore: number;

  @Column({ type: 'float', default: 0.5 })
  deviceScore: number;

  @Column({ type: 'float', default: 0.5 })
  behavioralScore: number;

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  boundMethods: string[];

  @Column({ type: 'text', nullable: true })
  lastVerifiedAt?: string | null;

  @Column({ type: 'text', nullable: true })
  lastVerificationMethod?: string | null;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
