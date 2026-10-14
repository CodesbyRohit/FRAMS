import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { requestFrom, type AuthenticatedPerson } from './jwt-auth.guard';

/** Injects the authenticated person into a resolver/controller method. */
export const CurrentPerson = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedPerson | undefined =>
    (requestFrom(context) as { person?: AuthenticatedPerson } | undefined)?.person,
);
