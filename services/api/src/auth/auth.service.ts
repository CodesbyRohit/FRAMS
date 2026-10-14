import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { Redis } from 'ioredis';
import { randomBytes, randomUUID } from 'crypto';

import { IdentityService } from '../identity/identity.service';
import { PersonEntity } from '../identity/person.entity';
import { MemoryService } from '../memory/memory.service';
import { REDIS } from '../redis/redis.module';
import { RateLimiter } from '../redis/rate-limiter.service';
import { stripDataUrl, TrustService } from '../trust/trust.service';
import { PasskeyEntity } from './passkey.entity';
import { PasskeysService } from './passkeys.service';
import { SessionMethod, SessionsService } from './sessions.service';

export interface AuthPayload {
  token: string;
  personId: string;
  displayName: string;
  verificationMethod: SessionMethod;
  faceMatchSimilarity?: number;
  livenessPassed?: boolean;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const TICKET_TTL_SECONDS = 15 * 60;
const MIN_FRAMES = 8;
const MAX_FRAMES = 30;
/** Base64 length cap per frame (~450 KB decoded) — webcam JPEGs are far smaller. */
const MAX_FRAME_B64 = 600_000;
const MAX_ENROLL_BYTES = 4 * 1024 * 1024;

/**
 * Orchestrates every way an identity proves itself.
 *
 *  - Passkeys (WebAuthn, user verification required) are the primary factor
 *    and the only one that can change credentials or delete the account.
 *  - Face sign-in is an optional convenience factor: 1:1 against the identity
 *    the person names, over a multi-frame blink-liveness burst. It never runs
 *    as an open-ended 1:N search, and it is rate limited.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly identities: IdentityService,
    private readonly passkeys: PasskeysService,
    private readonly sessions: SessionsService,
    private readonly trust: TrustService,
    private readonly memory: MemoryService,
    private readonly limiter: RateLimiter,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // ── Onboarding ────────────────────────────────────────────────────────────

  private ticketKey(ticket: string): string {
    return `anima:onboarding:${ticket}`;
  }

  async onboard(
    input: { email: string; displayName: string; roles: string[] },
    meta: RequestMeta,
  ): Promise<{ person: PersonEntity; ticket: string; expiresAt: string }> {
    await this.limiter.consume(`onboard:ip:${meta.ip ?? 'unknown'}`, 10, 3600);

    const existing = await this.identities.findByEmail(input.email);
    if (existing) {
      if ((await this.passkeys.countFor(existing.id)) > 0) {
        throw new ConflictException('An identity with this email already exists. Sign in instead.');
      }
      // Registration was started but never completed: no credential, no data.
      await this.identities.removeAbandoned(existing.id);
    }
    const person = await this.identities.create(input);
    const ticket = randomBytes(32).toString('base64url');
    try {
      await this.redis.set(this.ticketKey(ticket), person.id, 'EX', TICKET_TTL_SECONDS);
    } catch {
      throw new ServiceUnavailableException('Registration needs Redis, which is unavailable.');
    }
    return {
      person,
      ticket,
      expiresAt: new Date(Date.now() + TICKET_TTL_SECONDS * 1000).toISOString(),
    };
  }

  private async personForTicket(ticket: string): Promise<PersonEntity> {
    let personId: string | null;
    try {
      personId = typeof ticket === 'string' && ticket.length <= 128 ? await this.redis.get(this.ticketKey(ticket)) : null;
    } catch {
      throw new ServiceUnavailableException('Registration needs Redis, which is unavailable.');
    }
    if (!personId) {
      throw new UnauthorizedException('This registration link has expired. Start again.');
    }
    return this.identities.findById(personId);
  }

  async firstPasskeyOptions(ticket: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const person = await this.personForTicket(ticket);
    return this.passkeys.registrationOptions(person.id, person.email, person.displayName);
  }

  /** Bind the first passkey using the onboarding ticket, then open a session. */
  async registerFirstPasskey(
    ticket: string,
    deviceName: string,
    response: RegistrationResponseJSON,
    meta: RequestMeta,
  ): Promise<AuthPayload> {
    const person = await this.personForTicket(ticket);
    const credential: PasskeyEntity = await this.passkeys.verifyRegistration(person.id, deviceName, response);
    await this.redis.del(this.ticketKey(ticket)).catch(() => undefined);
    this.logger.log(`Bound first passkey ${credential.credentialId.slice(0, 8)}… to ${person.id}`);
    await this.trust.markMethodBound(person.id, 'passkey');
    await this.memory.ingest({
      personId: person.id,
      type: 'IDENTITY_CREATED',
      summary: 'Identity created and secured with a passkey.',
      payload: { method: 'passkey' },
    });
    return this.openSession(person, 'passkey', meta);
  }

  // ── Passkey sign-in & management ──────────────────────────────────────────

  async passkeyLoginOptions(meta: RequestMeta): Promise<{ ceremonyId: string; options: string }> {
    await this.limiter.consume(`passkey-options:ip:${meta.ip ?? 'unknown'}`, 30, 900);
    const ceremonyId = randomUUID();
    const options = await this.passkeys.authenticationOptions(ceremonyId);
    return { ceremonyId, options: JSON.stringify(options) };
  }

  async loginWithPasskey(
    ceremonyId: string,
    response: AuthenticationResponseJSON,
    meta: RequestMeta,
  ): Promise<AuthPayload> {
    const personId = await this.passkeys.verifyAuthentication(ceremonyId, response);
    const person = await this.identities.findById(personId);
    await this.trust.recordVerification(person.id, 'passkey');
    return this.openSession(person, 'passkey', meta);
  }

  async addPasskeyOptions(personId: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const person = await this.identities.findById(personId);
    return this.passkeys.registrationOptions(person.id, person.email, person.displayName);
  }

  async addPasskey(personId: string, deviceName: string, response: RegistrationResponseJSON): Promise<PasskeyEntity> {
    const credential = await this.passkeys.verifyRegistration(personId, deviceName, response);
    await this.memory.ingest({
      personId,
      type: 'SECURITY_CHANGED',
      summary: `Added passkey "${credential.deviceName}".`,
      payload: { change: 'passkey_added' },
    });
    return credential;
  }

  async removePasskey(personId: string, credentialId: string): Promise<void> {
    await this.passkeys.remove(personId, credentialId);
    await this.memory.ingest({
      personId,
      type: 'SECURITY_CHANGED',
      summary: 'Removed a passkey.',
      payload: { change: 'passkey_removed' },
    });
  }

  // ── Face (optional convenience factor) ────────────────────────────────────

  /**
   * Face sign-in: the person names their identity (email) and submits a short
   * frame burst. The Trust Service verifies 1:1 that the face matches that
   * identity AND that a blink occurred. Device/behaviour signals are not used:
   * nothing in ANIMA measures them.
   */
  async loginWithFace(email: string, frames: string[], meta: RequestMeta): Promise<AuthPayload> {
    validateFrames(frames);
    await this.limiter.consume(`face:ip:${meta.ip ?? 'unknown'}`, 20, 900);
    await this.limiter.consume(`face:email:${email}`, 5, 900);

    const generic = new UnauthorizedException(
      'Face sign-in did not succeed. Check lighting, blink once during capture, or use your passkey.',
    );
    const person = await this.identities.findByEmail(email);
    if (!person) {
      throw generic;
    }
    const profile = await this.trust.getProfile(person.id);
    if (!profile.faceEnrolled) {
      throw generic;
    }

    const result = await this.trust.verifyLiveness(person.id, frames);
    if (!result.verified) {
      this.logger.log(`Face sign-in rejected for ${person.id}: liveness=${result.livenessPassed}`);
      throw new UnauthorizedException(
        result.livenessPassed
          ? 'Your face did not match this identity closely enough. Use your passkey.'
          : 'No blink was detected, so liveness could not be confirmed. Try again and blink once.',
      );
    }
    await this.trust.recordVerification(person.id, 'face', result.similarity);
    await this.memory.ingest({
      personId: person.id,
      type: 'VERIFICATION_SUCCEEDED',
      summary: 'Signed in with face + blink check.',
      payload: { method: 'face', similarity: result.similarity },
    });
    const payload = await this.openSession(person, 'face', meta);
    return { ...payload, faceMatchSimilarity: result.similarity, livenessPassed: true };
  }

  /** Enroll exactly one face, after explicit consent, from a passkey session. */
  async enrollFace(personId: string, imageBase64: string, consent: boolean): Promise<void> {
    if (consent !== true) {
      throw new BadRequestException('Face enrollment requires your explicit consent.');
    }
    if (typeof imageBase64 !== 'string' || !imageBase64) {
      throw new BadRequestException('Provide a photo.');
    }
    const bytes = Buffer.from(stripDataUrl(imageBase64), 'base64');
    if (bytes.length === 0 || bytes.length > MAX_ENROLL_BYTES) {
      throw new BadRequestException('The photo must be a JPEG/PNG of at most 4 MB.');
    }
    const person = await this.identities.findById(personId);
    await this.trust.registerFace(person.id, person.displayName, bytes);
    await this.trust.markFaceEnrolled(person.id, new Date());
    await this.memory.ingest({
      personId,
      type: 'SECURITY_CHANGED',
      summary: 'Enrolled a face for optional face sign-in (consent recorded).',
      payload: { change: 'face_enrolled' },
    });
  }

  /** Erase face embeddings at the Trust Service, then the API-side record. */
  async deleteFace(personId: string): Promise<void> {
    await this.trust.deleteFace(personId);
    await this.trust.markFaceRemoved(personId);
    await this.memory.ingest({
      personId,
      type: 'SECURITY_CHANGED',
      summary: 'Deleted face data; face sign-in disabled.',
      payload: { change: 'face_removed' },
    });
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  private async openSession(person: PersonEntity, method: SessionMethod, meta: RequestMeta): Promise<AuthPayload> {
    const { token } = await this.sessions.create(person, method, meta.userAgent);
    return { token, personId: person.id, displayName: person.displayName, verificationMethod: method };
  }

  async logout(personId: string, sessionId: string): Promise<boolean> {
    return this.sessions.revoke(personId, sessionId);
  }
}

export function validateFrames(frames: unknown): asserts frames is string[] {
  if (!Array.isArray(frames) || frames.length < MIN_FRAMES || frames.length > MAX_FRAMES) {
    throw new BadRequestException(`Provide between ${MIN_FRAMES} and ${MAX_FRAMES} frames.`);
  }
  for (const f of frames) {
    if (typeof f !== 'string' || f.length === 0 || f.length > MAX_FRAME_B64) {
      throw new BadRequestException('Each frame must be a JPEG image under ~450 KB.');
    }
  }
}
