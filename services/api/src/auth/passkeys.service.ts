import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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

const CHALLENGE_TTL_SECONDS = 300;

/**
 * WebAuthn passkey orchestration. Challenges live in Redis (single use, 5 min
 * TTL) so the flow survives API restarts and multiple replicas. User
 * verification (biometric or device PIN on the authenticator) is required:
 * a passkey is the sole factor, so mere possession of a security key is not
 * enough.
 */
@Injectable()
export class PasskeysService {
  private readonly rpName = 'ANIMA';
  private readonly rpId: string;
  private readonly origins: string[];

  constructor(
    cfg: ConfigService,
    @InjectRepository(PasskeyEntity)
    private readonly repo: Repository<PasskeyEntity>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    const configured = String(cfg.get('ANIMA_WEB_ORIGIN', 'http://localhost:3000'))
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    this.origins = configured;
    this.rpId = cfg.get('ANIMA_WEBAUTHN_RP_ID') ?? new URL(configured[0]).hostname;
  }

  private challengeKey(kind: string, id: string): string {
    return `anima:webauthn:${kind}:${id}`;
  }

  private async storeChallenge(kind: string, id: string, challenge: string): Promise<void> {
    try {
      await this.redis.set(this.challengeKey(kind, id), challenge, 'EX', CHALLENGE_TTL_SECONDS);
    } catch {
      throw new ServiceUnavailableException('Passkey ceremonies need Redis, which is unavailable.');
    }
  }

  /** Atomically read-and-delete so a challenge can be used at most once. */
  private async takeChallenge(kind: string, id: string): Promise<string> {
    let challenge: string | null;
    try {
      challenge = await this.redis.getdel(this.challengeKey(kind, id));
    } catch {
      throw new ServiceUnavailableException('Passkey ceremonies need Redis, which is unavailable.');
    }
    if (!challenge) {
      throw new UnauthorizedException('The passkey request expired or was already used. Start again.');
    }
    return challenge;
  }

  countFor(personId: string): Promise<number> {
    return this.repo.count({ where: { personId } });
  }

  listFor(personId: string): Promise<PasskeyEntity[]> {
    return this.repo.find({ where: { personId }, order: { createdAt: 'ASC' } });
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
      userID: new TextEncoder().encode(personId),
      attestationType: 'none',
      excludeCredentials: credentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports as CredentialTransport[],
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
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
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origins,
        expectedRPID: this.rpId,
        requireUserVerification: true,
      });
    } catch (err) {
      throw new UnauthorizedException(`Passkey registration was rejected: ${(err as Error).message}`);
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new UnauthorizedException('Passkey registration was not verified by the authenticator.');
    }
    const { credential: authCred } = verification.registrationInfo;

    const existing = await this.repo.findOne({ where: { credentialId: authCred.id } });
    if (existing) {
      throw new BadRequestException('This passkey is already registered.');
    }

    const credential = this.repo.create({
      credentialId: authCred.id,
      personId,
      publicKey: Buffer.from(authCred.publicKey).toString('base64url'),
      counter: authCred.counter,
      deviceName: deviceName.trim().slice(0, 64) || 'Passkey',
      transports: (response.response.transports as string[] | undefined) ?? [],
    });
    return this.repo.save(credential);
  }

  /**
   * Discoverable-credential sign-in: no email needed, the authenticator offers
   * the passkeys it holds for this site. The challenge is keyed by a random
   * ceremony id returned to the browser.
   */
  async authenticationOptions(
    ceremonyId: string,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: [],
      userVerification: 'required',
      timeout: 120_000,
    });
    await this.storeChallenge('authentication', ceremonyId, options.challenge);
    return options;
  }

  /** Verify an assertion and return the person it belongs to. */
  async verifyAuthentication(
    ceremonyId: string,
    response: AuthenticationResponseJSON,
  ): Promise<string> {
    const expectedChallenge = await this.takeChallenge('authentication', ceremonyId);
    const credential = await this.repo.findOne({ where: { credentialId: response.id } });
    if (!credential) {
      throw new UnauthorizedException('This passkey is not registered with ANIMA.');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origins,
        expectedRPID: this.rpId,
        credential: {
          id: credential.credentialId,
          publicKey: Buffer.from(credential.publicKey, 'base64url'),
          counter: credential.counter,
          transports: credential.transports as CredentialTransport[],
        },
        requireUserVerification: true,
      });
    } catch (err) {
      throw new UnauthorizedException(`Passkey sign-in was rejected: ${(err as Error).message}`);
    }

    if (!verification.verified) {
      throw new UnauthorizedException('Passkey assertion failed.');
    }
    // The user handle, when present, must name the same identity.
    const handle = response.response.userHandle;
    if (handle && Buffer.from(handle, 'base64url').toString('utf8') !== credential.personId) {
      throw new UnauthorizedException('Passkey user handle does not match its credential.');
    }
    credential.counter = verification.authenticationInfo.newCounter;
    credential.lastUsedAt = new Date();
    await this.repo.save(credential);
    return credential.personId;
  }

  /** Remove a passkey, refusing to remove the last one (it would lock the account). */
  async remove(personId: string, credentialId: string): Promise<void> {
    const credentials = await this.repo.find({ where: { personId } });
    const target = credentials.find((c) => c.credentialId === credentialId);
    if (!target) {
      throw new BadRequestException('No such passkey on this account.');
    }
    if (credentials.length <= 1) {
      throw new BadRequestException('You cannot remove your only passkey — add another one first.');
    }
    await this.repo.delete({ credentialId, personId });
  }

  async removeAllFor(personId: string): Promise<void> {
    await this.repo.delete({ personId });
  }
}
