import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { RequestMeta } from '../auth/auth.service';
import { requestFrom } from './jwt-auth.guard';

/**
 * Injects the caller's network metadata (used for rate limiting and session
 * labelling). `req.ip` honours Express' `trust proxy` setting, so behind a
 * proxy it is the proxy address unless the deployment configures that.
 */
export const ReqMeta = createParamDecorator((_: unknown, context: ExecutionContext): RequestMeta => {
  const req = requestFrom(context);
  const userAgent = req?.headers?.['user-agent'];
  return {
    ip: req?.ip || req?.socket?.remoteAddress || undefined,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
  };
});
