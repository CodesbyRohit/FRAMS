import { Query, Resolver } from '@nestjs/graphql';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { InsightGql } from '../graphql/models';
import { InsightsService } from './insights.service';

@Resolver()
export class InsightsResolver {
  constructor(private readonly insights: InsightsService) {}

  @Query(() => [InsightGql], {
    description: 'Rule-based observations over your data (and an optional generated summary), each with its evidence. Empty when there is no data.',
  })
  myInsights(@CurrentPerson() person: AuthenticatedPerson): Promise<InsightGql[]> {
    return this.insights.generate(person.personId);
  }
}
