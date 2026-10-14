import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { SessionsService, type SessionMethod } from '../auth/sessions.service';
import { IS_PUBLIC_KEY } from './public.decorator';

export interface AuthenticatedPerson {
  personId: string;
  email: string;
  sessionId: string;
  /** How this session was established; sensitive operations require 'passkey'. */
  method: SessionMethod;
}

/** Resolve the Express request for both GraphQL and REST execution contexts. */
export function requestFrom(context: ExecutionContext): Request {
  if (context.getType<string>() === 'graphql') {
    return GqlExecutionContext.create(context).getContext<{ req: Request }>().req;
  }
  return context.switchToHttp().getRequest<Request>();
}

/**
 * Verifies the `Authorization: Bearer <jwt>` header on GraphQL and REST
 * requests. A valid signature is not enough: the session the token names must
 * still exist in the session store, so revocation is immediate.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = requestFrom(context);
    const token = extractBearer(req);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }
    const person = await verifySessionToken(token, this.jwt, this.config, this.sessions);
    (req as Request & { person?: AuthenticatedPerson }).person = person;
    return true;
  }
}

export function extractBearer(req: Request): string | undefined {
  const [type, token] = req.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' && token ? token : undefined;
}

/** Shared by the guard and the SSE endpoint (which cannot send headers). */
export async function verifySessionToken(
  token: string,
  jwt: JwtService,
  config: ConfigService,
  sessions: SessionsService,
): Promise<AuthenticatedPerson> {
  let payload: AuthenticatedPerson;
  try {
    payload = await jwt.verifyAsync<AuthenticatedPerson>(token, {
      secret: config.get('ANIMA_JWT_SECRET'),
    });
  } catch {
    throw new UnauthorizedException('Token expired or invalid.');
  }
  if (!payload?.personId || !payload.sessionId) {
    throw new UnauthorizedException('Token expired or invalid.');
  }
  // Throws ServiceUnavailable (fail closed) if Redis is down.
  const session = await sessions.get(payload.sessionId, payload.personId);
  if (!session) {
    throw new UnauthorizedException('This session has been signed out.');
  }
  return {
    personId: payload.personId,
    email: payload.email,
    sessionId: payload.sessionId,
    method: session.method,
  };
}
