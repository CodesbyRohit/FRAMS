import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

import { IdentityService } from '../identity/identity.service';
import { PersonEntity } from '../identity/person.entity';
import { MemoryService } from '../memory/memory.service';
import { TrustService } from '../trust/trust.service';
import { PasskeyEntity } from './passkey.entity';
import { PasskeysService } from './passkeys.service';
import { SessionsService } from './sessions.service';

export interface AuthPayload {
  token: string;
  personId: string;
  displayName: string;
  verificationConfidence?: number;
  verificationMethod?: string;
}

/**
 * Orchestrates every way an identity proves itself: passkeys, face
 * verification through the Trust Service, and continuous-auth bookkeeping.
 * Returns signed sessions; never stores passwords.
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
  ) {}

  passkeyRegistrationOptions(
    personId: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return this.identities.findById(personId).then((p) =>
      this.passkeys.registrationOptions(personId, p.email, p.displayName),
    );
  }

  async registerPasskey(
    personId: string,
    deviceName: string,
    response: RegistrationResponseJSON,
  ): Promise<AuthPayload> {
    const person = await this.identities.findById(personId);
    const credential: PasskeyEntity = await this.passkeys.verifyRegistration(
      personId,
      deviceName,
      response,
    );
    this.logger.log(`Bound passkey ${credential.credentialId.slice(0, 8)}… to ${person.id}`);
    const { token } = await this.sessions.create(person);
    return { token, personId: person.id, displayName: person.displayName, verificationMethod: 'passkey' };
  }

  async loginWithPasskeyOptions(email: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return this.passkeys.authenticationOptions(email);
  }

  async loginWithPasskey(
    email: string,
    response: AuthenticationResponseJSON,
  ): Promise<AuthPayload> {
    const personId = await this.passkeys.verifyAuthentication(email, response);
    const person = await this.identities.findById(personId);
    const { token } = await this.sessions.create(person);
    return { token, personId: person.id, displayName: person.displayName, verificationMethod: 'passkey' };
  }

  /**
   * Face login: the image is sent to the Trust Service which matches it
   * against the global registry. The face is the gateway — the session that
   * follows is a normal ANIMA session.
   */
  async loginWithFace(
    imageBase64: string,
    deviceScore?: number,
    behavioralScore?: number,
  ): Promise<AuthPayload> {
    const result = await this.trust.verifyFace(imageBase64, { deviceScore, behavioralScore });
    if (!result.verified || !result.subjectId) {
      throw new UnauthorizedException(`Face not recognized. ${result.reason}`);
    }
    const person = await this.identities.findById(result.subjectId);
    const { token } = await this.sessions.create(person);
    await this.trust.recordVerification(person.id, result, 'face');
    await this.memory.ingest({
      personId: person.id,
      type: 'VERIFICATION_SUCCEEDED',
      summary: `Identity verified via face (${Math.round(result.confidence * 100)}% confidence).`,
      payload: { confidence: result.confidence, method: 'face', risk: result.risk },
    });
    return {
      token,
      personId: person.id,
      displayName: person.displayName,
      verificationConfidence: result.confidence,
      verificationMethod: 'face',
    };
  }

  /** Authenticated face enrollment: bind this identity's face at the Trust Service. */
  async enrollFace(
    personId: string,
    displayName: string,
    imageBase64: string,
  ): Promise<{ enrolled: boolean }> {
    const raw = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    await this.trust.registerFace(personId, displayName, Buffer.from(raw, 'base64'));
    await this.memory.ingest({
      personId,
      type: 'IDENTITY_CREATED',
      summary: 'Face enrolled as a trusted identity factor.',
      payload: { method: 'face' },
    });
    return { enrolled: true };
  }

  async logout(sessionId: string): Promise<boolean> {
    await this.sessions.revoke(sessionId);
    return true;
  }
}
