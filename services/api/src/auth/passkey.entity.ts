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

  /** Base64url-encoded transports (usb, nfc, ble, internal). */
  @Column({ type: 'text', array: true, default: () => `'{}'` })
  transports: string[];

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
