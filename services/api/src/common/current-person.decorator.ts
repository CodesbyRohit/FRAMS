import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import type { AuthenticatedPerson } from './jwt-auth.guard';

/** Injects the authenticated person into a resolver/controller method. */
export const CurrentPerson = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedPerson | undefined => {
    const gql = GqlExecutionContext.create(context);
    const req = gql.getContext<{ req: { person?: AuthenticatedPerson } }>().req;
    return req?.person;
  },
);
