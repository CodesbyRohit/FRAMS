import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { Redis } from 'ioredis';
import { Repository } from 'typeorm';

import { REDIS } from '../redis/redis.module';
import { PasskeyEntity } from './passkey.entity';

type CredentialTransport = 'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid';

/**
 * WebAuthn passkey orchestration. Challenges live in Redis (TTL 5 min) so the
 * flow survives API restarts and multiple replicas.
 */
@Injectable()
export class PasskeysService {
  private readonly rpName = 'ANIMA';
  private readonly rpId: string;
  private readonly origin: string;

  constructor(
    private readonly cfg: ConfigService,
    @InjectRepository(PasskeyEntity)
    private readonly repo: Repository<PasskeyEntity>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    const webOrigin = cfg.get('ANIMA_WEB_ORIGIN', 'http://localhost:3000');
    this.origin = webOrigin.split(',')[0];
    this.rpId = new URL(this.origin).hostname;
  }

  private challengeKey(kind: string, id: string): string {
    return `anima:webauthn:${kind}:${id}`;
  }

  private async storeChallenge(kind: string, id: string, challenge: string): Promise<void> {
    await this.redis.set(this.challengeKey(kind, id), challenge, 'EX', 300);
  }

  private async takeChallenge(kind: string, id: string): Promise<string> {
    const key = this.challengeKey(kind, id);
    const challenge = await this.redis.get(key);
    if (!challenge) {
      throw new UnauthorizedException('Missing or expired WebAuthn challenge. Start again.');
    }
    await this.redis.del(key);
    return challenge;
  }

  async registrationOptions(
    personId: string,
    email: string,
    displayName: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const credentials = await this.repo.find({ where: { personId } });
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userName: email,
      userDisplayName: displayName,
      userID: Buffer.from(personId),
      attestationType: 'none',
      excludeCredentials: credentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports as CredentialTransport[],
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      timeout: 120_000,
    });
    await this.storeChallenge('registration', personId, options.challenge);
    return options;
  }

  async verifyRegistration(
    personId: string,
    deviceName: string,
    response: RegistrationResponseJSON,
  ): Promise<PasskeyEntity> {
    const expectedChallenge = await this.takeChallenge('registration', personId);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new UnauthorizedException('Passkey registration was not verified by the authenticator.');
    }
    const { credential: authCred } = verification.registrationInfo;

    const existing = await this.repo.findOne({ where: { credentialId: authCred.id } });
    if (existing) {
      throw new UnauthorizedException('This passkey is already registered.');
    }

    const credential = this.repo.create({
      credentialId: authCred.id,
      personId,
      publicKey: Buffer.from(authCred.publicKey).toString('base64url'),
      counter: authCred.counter,
      deviceName: deviceName || 'Default device',
      transports: (response.response.transports as string[]) ?? [],
    });
    return this.repo.save(credential);
  }

  async authenticationOptions(email: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const person = await this.findPersonByEmail(email);
    const credentials = person ? await this.repo.find({ where: { personId: person.id } }) : [];
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports as CredentialTransport[],
      })),
      userVerification: 'preferred',
      timeout: 120_000,
    });
    await this.storeChallenge('authentication', email, options.challenge);
    return options;
  }

  async verifyAuthentication(email: string, response: AuthenticationResponseJSON): Promise<string> {
    const person = await this.findPersonByEmail(email);
    if (!person) {
      throw new UnauthorizedException('No identity matches this email.');
    }
    const credential = await this.repo.findOne({
      where: { credentialId: response.id },
    });
    if (!credential || credential.personId !== person.id) {
      throw new UnauthorizedException('Unknown credential for this identity.');
    }

    const expectedChallenge = await this.takeChallenge('authentication', email);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      credential: {
        id: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey, 'base64url'),
        counter: credential.counter,
        transports: credential.transports as CredentialTransport[],
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      throw new UnauthorizedException('Passkey assertion failed.');
    }
    credential.counter = verification.authenticationInfo.newCounter;
    await this.repo.save(credential);
    return person.id;
  }

  /** Resolve email -> person id without importing the identity module (repo-local). */
  private async findPersonByEmail(email: string): Promise<{ id: string } | null> {
    const rows = await this.repo.query(
      'SELECT id FROM persons WHERE lower(email) = lower($1) LIMIT 1',
      [email.trim()],
    );
    return rows[0] ?? null;
  }
}
