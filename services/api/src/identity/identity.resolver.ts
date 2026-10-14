import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { optionalText, textList } from '../common/validation';
import { PersonGql, TwinGql } from '../graphql/models';
import type { TwinEntity } from '../twin/twin.entity';
import { EMPTY_NARRATIVE, TwinService } from '../twin/twin.service';
import { IdentityService } from './identity.service';
import { PersonEntity } from './person.entity';

/** Wire mapping for the twin; the placeholder narrative is never presented as content. */
export function toTwinGql(twin: TwinEntity): TwinGql {
  return {
    id: twin.id,
    personId: twin.personId,
    version: twin.version,
    skills: twin.skills,
    goals: twin.goals,
    interests: twin.interests,
    narrative: twin.narrative === EMPTY_NARRATIVE ? '' : twin.narrative,
    stats: {
      memories: twin.stats?.memories ?? 0,
      documents: twin.stats?.documents ?? 0,
      projects: twin.stats?.projects ?? 0,
      interactions: twin.stats?.interactions ?? 0,
      daysActive: twin.stats?.daysActive ?? 0,
    },
    lastActiveOn: twin.lastActiveOn ?? null,
    updatedAt: twin.updatedAt,
  };
}

/**
 * Person data is only ever exposed for the caller. There is deliberately no
 * "look up any identity" query: identities are private.
 */
@Resolver(() => PersonGql)
export class IdentityResolver {
  constructor(
    private readonly identities: IdentityService,
    private readonly twins: TwinService,
  ) {}

  @Query(() => PersonGql, { description: 'The authenticated person.' })
  me(@CurrentPerson() person: AuthenticatedPerson): Promise<PersonEntity> {
    return this.identities.findById(person.personId);
  }

  @Query(() => TwinGql, { description: "The caller's AI Digital Twin." })
  async myTwin(@CurrentPerson() person: AuthenticatedPerson): Promise<TwinGql> {
    return toTwinGql(await this.twins.getTwin(person.personId));
  }

  @Mutation(() => PersonGql, { description: 'Update your own profile context.' })
  updateProfile(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('bio', { type: () => String, nullable: true }) bio?: string,
    @Args('displayName', { type: () => String, nullable: true }) displayName?: string,
    @Args('roles', { type: () => [String], nullable: true }) roles?: string[],
  ): Promise<PersonEntity> {
    const name = optionalText(displayName, 'Display name', 80);
    return this.identities.updateProfile(person.personId, {
      displayName: name === '' ? undefined : name,
      bio: optionalText(bio, 'Bio', 500),
      roles: roles === undefined || roles === null ? undefined : textList(roles, 'Roles', { maxItems: 10, maxLength: 40 }),
    });
  }

  /** Only reachable through `me` (or onboarding's own person), i.e. the caller's twin. */
  @ResolveField(() => TwinGql)
  async twin(@Parent() parent: PersonEntity): Promise<TwinGql> {
    return toTwinGql(await this.twins.getTwin(parent.id));
  }
}
