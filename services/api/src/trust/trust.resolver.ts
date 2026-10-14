import { Query, Resolver } from '@nestjs/graphql';

import { CurrentPerson } from '../common/current-person.decorator';
import { toIso } from '../common/dates';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { TrustGql } from '../graphql/models';
import type { TrustProfileEntity } from './trust.entity';
import { TrustService } from './trust.service';

/** Wire mapping: verification facts only — no device/behavioural/identity scores exist. */
export function toTrustGql(p: TrustProfileEntity): TrustGql {
  return {
    personId: p.personId,
    faceEnrolled: p.faceEnrolled,
    faceConsentAt: toIso(p.faceConsentAt),
    lastFaceSimilarity: p.lastFaceSimilarity ?? null,
    boundMethods: p.boundMethods,
    lastVerifiedAt: toIso(p.lastVerifiedAt),
    lastVerificationMethod: p.lastVerificationMethod ?? null,
    updatedAt: toIso(p.updatedAt),
  };
}

@Resolver()
export class TrustResolver {
  constructor(private readonly trust: TrustService) {}

  @Query(() => TrustGql, { description: 'Your verification facts: bound factors, face enrollment, last sign-in.' })
  async myTrustProfile(@CurrentPerson() person: AuthenticatedPerson): Promise<TrustGql> {
    return toTrustGql(await this.trust.getProfile(person.personId));
  }
}
