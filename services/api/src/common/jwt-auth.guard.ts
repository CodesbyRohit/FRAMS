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

import { IS_PUBLIC_KEY } from './public.decorator';

export interface AuthenticatedPerson {
  personId: string;
  email: string;
  sessionId: string;
}

/**
 * Verifies the `Authorization: Bearer <jwt>` header on GraphQL and REST
 * requests, and attaches the authenticated person to the context.
 * Combined with the Trust Service, this forms ANIMA's continuous-auth chain.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const gql = GqlExecutionContext.create(context);
    const req: Request =
      gql.getContext<{ req: Request }>().req ?? context.switchToHttp().getRequest();

    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    try {
      const payload = await this.jwt.verifyAsync<AuthenticatedPerson>(token, {
        secret: this.config.get('ANIMA_JWT_SECRET'),
      });
      (req as Request & { person?: AuthenticatedPerson }).person = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token expired or invalid.');
    }
  }

  private extractToken(req: Request): string | undefined {
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
