import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A WebAuthn passkey bound to an identity. Credentials are passwordless by
 * design — the platform stores only the public key, never a secret.
 */
@Entity('passkeys')
export class PasskeyEntity {
  @PrimaryColumn()
  credentialId: string;

  @Index()
  @Column()
  personId: string;

  @Column({ type: 'text' })
  publicKey: string;

  @Column({ type: 'int' })
  counter: number;

  @Column({ type: 'text' })
  deviceName: string;

  /** Authenticator transports reported at registration (usb, nfc, ble, internal, hybrid). */
  @Column({ type: 'text', array: true, default: () => `'{}'` })
  transports: string[];

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt?: Date | null;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
