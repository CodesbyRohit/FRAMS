import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';

import { REDIS } from '../redis/redis.module';
import type { PersonEntity } from '../identity/person.entity';

export interface SessionToken {
  token: string;
  sessionId: string;
}

/**
 * Issues stateless JWTs backed by a revocable Redis session. Continuous
 * authentication can invalidate a session at any time (device change,
 * anomalous behavior) without waiting for token expiry.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private sessionKey(sessionId: string): string {
    return `anima:session:${sessionId}`;
  }

  async create(person: PersonEntity): Promise<SessionToken> {
    const sessionId = randomUUID();
    const ttl = this.cfg.get<number>('ANIMA_SESSION_TTL_SECONDS', 28_800);
    await this.redis.set(this.sessionKey(sessionId), person.id, 'EX', ttl);

    // Global JWT options (secret + expiry) come from JwtModule.registerAsync.
    const token = await this.jwt.signAsync({
      personId: person.id,
      email: person.email,
      sessionId,
    });
    return { token, sessionId };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.redis.del(this.sessionKey(sessionId));
  }

  async isActive(sessionId: string): Promise<boolean> {
    return (await this.redis.exists(this.sessionKey(sessionId))) === 1;
  }
}
