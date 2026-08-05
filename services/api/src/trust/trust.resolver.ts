import { Args, Float, Query, Resolver } from '@nestjs/graphql';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { TrustGql } from '../graphql/models';
import { TrustService } from './trust.service';

@Resolver()
export class TrustResolver {
  constructor(private readonly trust: TrustService) {}

  @Query(() => TrustGql, { description: 'Your identity trust posture (face = one factor, never the whole story).' })
  myTrustProfile(@CurrentPerson() person: AuthenticatedPerson): Promise<TrustGql> {
    return this.trust.getProfile(person.personId).then((p) => ({
      personId: p.personId,
      identityScore: p.identityScore,
      deviceScore: p.deviceScore,
      behavioralScore: p.behavioralScore,
      boundMethods: p.boundMethods,
      lastVerifiedAt: p.lastVerifiedAt ?? undefined,
      lastVerificationMethod: p.lastVerificationMethod ?? undefined,
      updatedAt: p.updatedAt,
    }));
  }

  @Query(() => Float, {
    description: 'Dry-run composite identity score without a verification.',
  })
  async trustScorePreview(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('deviceScore', { type: () => Float }) deviceScore = 0.5,
    @Args('behavioralScore', { type: () => Float }) behavioralScore = 0.5,
  ): Promise<number> {
    const profile = await this.trust.getProfile(person.personId);
    return Math.round(
      (profile.identityScore * 0.6 + deviceScore * 0.2 + behavioralScore * 0.2) * 1000,
    ) / 1000;
  }
}
