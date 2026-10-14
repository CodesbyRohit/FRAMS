import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

import { CurrentPerson } from '../common/current-person.decorator';
import { toIso } from '../common/dates';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { ReqMeta } from '../common/request-meta.decorator';
import {
  assertPasskeySession,
  normalizeEmail,
  optionalText,
  parseJsonObject,
  requireText,
  textList,
} from '../common/validation';
import {
  AuthPayloadGql,
  OnboardingGql,
  PasskeyChallengeGql,
  PasskeyGql,
  SessionGql,
  TrustGql,
} from '../graphql/models';
import { toTrustGql } from '../trust/trust.resolver';
import { TrustService } from '../trust/trust.service';
import { AuthService, RequestMeta } from './auth.service';
import type { PasskeyEntity } from './passkey.entity';
import { PasskeysService } from './passkeys.service';
import { SessionsService } from './sessions.service';

function toPasskeyGql(p: PasskeyEntity): PasskeyGql {
  return {
    id: p.credentialId,
    deviceName: p.deviceName,
    createdAt: toIso(p.createdAt),
    lastUsedAt: toIso(p.lastUsedAt),
  };
}

/**
 * Authentication surface. Identity is never taken from a client-supplied
 * person id: unauthenticated flows are bound to a server-issued secret (the
 * onboarding ticket or a WebAuthn ceremony), authenticated flows to the
 * session principal.
 */
@Resolver()
export class AuthResolver {
  constructor(
    private readonly auth: AuthService,
    private readonly passkeys: PasskeysService,
    private readonly sessions: SessionsService,
    private readonly trust: TrustService,
  ) {}

  // ── Onboarding (ticket-bound) ─────────────────────────────────────────────

  @Public()
  @Mutation(() => OnboardingGql, {
    description: 'Create an identity. Returns a single-use ticket that authorizes registering its first passkey.',
  })
  async onboard(
    @ReqMeta() meta: RequestMeta,
    @Args('email') email: string,
    @Args('displayName') displayName: string,
    @Args('roles', { type: () => [String], nullable: true }) roles?: string[],
  ): Promise<OnboardingGql> {
    const { person, ticket, expiresAt } = await this.auth.onboard(
      {
        email: normalizeEmail(email),
        displayName: requireText(displayName, 'Display name', { max: 80 }),
        roles: textList(roles, 'Roles', { maxItems: 10, maxLength: 40 }),
      },
      meta,
    );
    return { person, registrationTicket: ticket, expiresAt };
  }

  @Public()
  @Query(() => String, { description: 'WebAuthn registration options (JSON) for the identity the ticket names.' })
  async passkeyRegistrationOptions(@Args('ticket') ticket: string): Promise<string> {
    return JSON.stringify(await this.auth.firstPasskeyOptions(requireText(ticket, 'Ticket', { max: 128 })));
  }

  @Public()
  @Mutation(() => AuthPayloadGql, { description: 'Bind the first passkey with the onboarding ticket and sign in.' })
  async registerPasskey(
    @ReqMeta() meta: RequestMeta,
    @Args('ticket') ticket: string,
    @Args('attestation') attestation: string,
    @Args('deviceName', { type: () => String, nullable: true }) deviceName?: string,
  ): Promise<AuthPayloadGql> {
    return this.auth.registerFirstPasskey(
      requireText(ticket, 'Ticket', { max: 128 }),
      optionalText(deviceName, 'Device name', 64) ?? '',
      parseJsonObject<RegistrationResponseJSON>(attestation, 'attestation'),
      meta,
    );
  }

  // ── Passkey sign-in (discoverable credentials) ────────────────────────────

  @Public()
  @Mutation(() => PasskeyChallengeGql, { description: 'Start a passkey sign-in ceremony.' })
  async passkeyLoginOptions(@ReqMeta() meta: RequestMeta): Promise<PasskeyChallengeGql> {
    return this.auth.passkeyLoginOptions(meta);
  }

  @Public()
  @Mutation(() => AuthPayloadGql, { description: 'Complete a passkey sign-in ceremony.' })
  async loginWithPasskey(
    @ReqMeta() meta: RequestMeta,
    @Args('ceremonyId') ceremonyId: string,
    @Args('assertion') assertion: string,
  ): Promise<AuthPayloadGql> {
    return this.auth.loginWithPasskey(
      requireText(ceremonyId, 'Ceremony id', { max: 64 }),
      parseJsonObject<AuthenticationResponseJSON>(assertion, 'assertion'),
      meta,
    );
  }

  // ── Face (optional convenience factor) ────────────────────────────────────

  @Public()
  @Mutation(() => AuthPayloadGql, {
    description: 'Face sign-in: 1:1 against the named identity over a short frame burst with a blink check.',
  })
  async loginWithFace(
    @ReqMeta() meta: RequestMeta,
    @Args('email') email: string,
    @Args('frames', { type: () => [String] }) frames: string[],
  ): Promise<AuthPayloadGql> {
    return this.auth.loginWithFace(normalizeEmail(email), frames, meta);
  }

  @Mutation(() => TrustGql, { description: 'Enroll one face for optional face sign-in. Requires a passkey session and consent.' })
  async enrollFace(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('imageBase64') imageBase64: string,
    @Args('consent') consent: boolean,
  ): Promise<TrustGql> {
    assertPasskeySession(person, 'Enrolling a face');
    await this.auth.enrollFace(person.personId, imageBase64, consent);
    return toTrustGql(await this.trust.getProfile(person.personId));
  }

  @Mutation(() => TrustGql, { description: 'Erase your face data and disable face sign-in. Requires a passkey session.' })
  async deleteFace(@CurrentPerson() person: AuthenticatedPerson): Promise<TrustGql> {
    assertPasskeySession(person, 'Removing face sign-in');
    await this.auth.deleteFace(person.personId);
    return toTrustGql(await this.trust.getProfile(person.personId));
  }

  // ── Passkey management (passkey session only) ─────────────────────────────

  @Query(() => [PasskeyGql], { description: 'Passkeys bound to your identity.' })
  async myPasskeys(@CurrentPerson() person: AuthenticatedPerson): Promise<PasskeyGql[]> {
    return (await this.passkeys.listFor(person.personId)).map(toPasskeyGql);
  }

  @Mutation(() => String, { description: 'WebAuthn options (JSON) to add another passkey.' })
  async addPasskeyOptions(@CurrentPerson() person: AuthenticatedPerson): Promise<string> {
    assertPasskeySession(person, 'Adding a passkey');
    return JSON.stringify(await this.auth.addPasskeyOptions(person.personId));
  }

  @Mutation(() => PasskeyGql, { description: 'Add another passkey to your identity.' })
  async addPasskey(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('attestation') attestation: string,
    @Args('deviceName', { type: () => String, nullable: true }) deviceName?: string,
  ): Promise<PasskeyGql> {
    assertPasskeySession(person, 'Adding a passkey');
    const credential = await this.auth.addPasskey(
      person.personId,
      optionalText(deviceName, 'Device name', 64) ?? '',
      parseJsonObject<RegistrationResponseJSON>(attestation, 'attestation'),
    );
    return toPasskeyGql(credential);
  }

  @Mutation(() => [PasskeyGql], { description: 'Remove one of your passkeys (never the last one).' })
  async removePasskey(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('id') id: string,
  ): Promise<PasskeyGql[]> {
    assertPasskeySession(person, 'Removing a passkey');
    await this.auth.removePasskey(person.personId, requireText(id, 'Passkey id', { max: 512 }));
    return (await this.passkeys.listFor(person.personId)).map(toPasskeyGql);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  @Query(() => [SessionGql], { description: 'Your active sessions.' })
  async mySessions(@CurrentPerson() person: AuthenticatedPerson): Promise<SessionGql[]> {
    const sessions = await this.sessions.list(person.personId);
    return sessions.map((s) => ({
      id: s.sessionId,
      method: s.method,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      userAgent: s.userAgent ?? null,
      current: s.sessionId === person.sessionId,
    }));
  }

  @Mutation(() => Boolean, { description: 'Revoke one of your sessions. False if it was not yours or already gone.' })
  async revokeSession(@CurrentPerson() person: AuthenticatedPerson, @Args('id') id: string): Promise<boolean> {
    return this.sessions.revoke(person.personId, requireText(id, 'Session id', { max: 64 }));
  }

  @Mutation(() => Int, { description: 'Sign out every other device. Returns how many sessions were revoked.' })
  async revokeOtherSessions(@CurrentPerson() person: AuthenticatedPerson): Promise<number> {
    return this.sessions.revokeAll(person.personId, person.sessionId);
  }

  @Mutation(() => Boolean, { description: 'Revoke the current session.' })
  async logout(@CurrentPerson() person: AuthenticatedPerson): Promise<boolean> {
    return this.auth.logout(person.personId, person.sessionId);
  }
}
