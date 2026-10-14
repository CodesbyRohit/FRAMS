import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * What the platform actually knows about an identity's verification factors.
 * Only measured facts are stored: there are no device or behavioural scores,
 * because nothing in ANIMA measures device posture or behaviour.
 */
@Entity('trust_profiles')
export class TrustProfileEntity {
  @PrimaryColumn()
  personId: string;

  /** True while the Trust Service holds face embeddings for this identity. */
  @Column({ type: 'boolean', default: false })
  faceEnrolled: boolean;

  /** When the person explicitly consented to biometric enrollment. */
  @Column({ type: 'timestamptz', nullable: true })
  faceConsentAt?: Date | null;

  /**
   * Similarity (1 − face distance) of the most recent successful face
   * verification. A similarity, not a probability that the person is who they
   * claim to be.
   */
  @Column({ type: 'float', nullable: true })
  lastFaceSimilarity?: number | null;

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  boundMethods: string[];

  @Column({ type: 'timestamptz', nullable: true })
  lastVerifiedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  lastVerificationMethod?: string | null;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
