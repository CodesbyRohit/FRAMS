import { Args, Mutation, Query, Resolver, ResolveField, Parent } from '@nestjs/graphql';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { PersonGql, TwinGql } from '../graphql/models';
import { TwinService } from '../twin/twin.service';
import type { TwinEntity } from '../twin/twin.entity';
import { IdentityService, OnboardInput } from './identity.service';
import { PersonEntity } from './person.entity';

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

  @Query(() => PersonGql, { description: 'Look up any identity.' })
  person(@Args('id') id: string): Promise<PersonEntity> {
    return this.identities.findById(id);
  }

  @Query(() => TwinGql, { description: "The caller's AI Digital Twin." })
  myTwin(@CurrentPerson() person: AuthenticatedPerson): Promise<TwinEntity> {
    return this.twins.getTwin(person.personId);
  }

  @Public()
  @Mutation(() => PersonGql, { description: 'Onboard a new identity (creates the Digital Twin).' })
  onboard(
    @Args('email') email: string,
    @Args('displayName') displayName: string,
    @Args('roles', { type: () => [String], nullable: true }) roles?: string[],
  ): Promise<PersonEntity> {
    return this.identities.onboard({ email, displayName, roles } satisfies OnboardInput);
  }

  @Mutation(() => PersonGql, { description: 'Update your own profile context.' })
  updateProfile(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('bio', { nullable: true }) bio?: string,
    @Args('displayName', { nullable: true }) displayName?: string,
    @Args('roles', { type: () => [String], nullable: true }) roles?: string[],
  ): Promise<PersonEntity> {
    return this.identities.updateProfile(person.personId, {
      bio: bio ?? undefined,
      displayName: displayName ?? undefined,
      roles: roles ?? undefined,
    });
  }

  @ResolveField(() => TwinGql)
  twin(@Parent() person: PersonEntity): Promise<TwinEntity> {
    return this.twins.getTwin(person.id);
  }
}
