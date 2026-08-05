import { Args, Float, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { IdentityService } from '../identity/identity.service';
import { Public } from '../common/public.decorator';
import { AuthPayloadGql } from '../graphql/models';
import { AuthService } from './auth.service';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly auth: AuthService,
    private readonly identities: IdentityService,
  ) {}

  @Public()
  @Mutation(() => AuthPayloadGql, {
    description: 'Register a passkey for a newly onboarded identity (passwordless creation).',
  })
  registerPasskey(
    @Args('personId') personId: string,
    @Args('deviceName', { nullable: true }) deviceName: string,
    @Args('attestation') attestation: string,
  ): Promise<AuthPayloadGql> {
    return this.auth.registerPasskey(personId, deviceName, JSON.parse(attestation) as RegistrationResponseJSON);
  }

  @Public()
  @Query(() => String, {
    description: 'WebAuthn registration options (JSON). Call after onboarding.',
  })
  passkeyRegistrationOptions(@Args('personId') personId: string): Promise<string> {
    return this.auth.passkeyRegistrationOptions(personId).then((o) => JSON.stringify(o));
  }

  @Public()
  @Query(() => String, { description: 'WebAuthn authentication options (JSON) for a known email.' })
  passkeyLoginOptions(@Args('email') email: string): Promise<string> {
    return this.auth.loginWithPasskeyOptions(email).then((o) => JSON.stringify(o));
  }

  @Public()
  @Mutation(() => AuthPayloadGql, { description: 'Complete a passkey login.' })
  loginWithPasskey(
    @Args('email') email: string,
    @Args('assertion') assertion: string,
  ): Promise<AuthPayloadGql> {
    return this.auth.loginWithPasskey(email, JSON.parse(assertion) as AuthenticationResponseJSON);
  }

  @Public()
  @Mutation(() => AuthPayloadGql, {
    description:
      'Face login — the Trust Service verifies your face and opens a session. The gateway, not the product.',
  })
  loginWithFace(
    @Args('imageBase64') imageBase64: string,
    @Args('deviceScore', { type: () => Float, nullable: true }) deviceScore?: number,
    @Args('behavioralScore', { type: () => Float, nullable: true }) behavioralScore?: number,
  ): Promise<AuthPayloadGql> {
    return this.auth.loginWithFace(imageBase64, deviceScore, behavioralScore);
  }

  @Mutation(() => Boolean, {
    description: 'Enroll your face with the Trust Service (requires an active session).',
  })
  async enrollFace(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('imageBase64') imageBase64: string,
  ): Promise<boolean> {
    const identity = await this.identities.findById(person.personId);
    const { enrolled } = await this.auth.enrollFace(
      person.personId,
      identity.displayName,
      imageBase64,
    );
    return enrolled;
  }

  @Mutation(() => Boolean, { description: 'Revoke the current session.' })
  async logout(@CurrentPerson() person: AuthenticatedPerson): Promise<boolean> {
    return this.auth.logout(person.sessionId);
  }
}
