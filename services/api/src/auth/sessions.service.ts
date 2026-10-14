import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';

import { REDIS } from '../redis/redis.module';
import type { PersonEntity } from '../identity/person.entity';

export type SessionMethod = 'passkey' | 'face';

export interface SessionToken {
  token: string;
  sessionId: string;
}

export interface SessionRecord {
  sessionId: string;
  personId: string;
  method: SessionMethod;
  createdAt: string;
  expiresAt: string;
  userAgent?: string;
}

/**
 * Issues JWTs that are only honoured while their Redis session record exists.
 * The guard checks the record on every request, so revoking a session (logout,
 * "sign out other devices", account deletion) takes effect immediately rather
 * than at token expiry. If Redis is unreachable, authentication fails closed.
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

  private indexKey(personId: string): string {
    return `anima:sessions:${personId}`;
  }

  private ttlSeconds(): number {
    return Number(this.cfg.get('ANIMA_SESSION_TTL_SECONDS', 28_800));
  }

  async create(
    person: Pick<PersonEntity, 'id' | 'email'>,
    method: SessionMethod,
    userAgent?: string,
  ): Promise<SessionToken> {
    const sessionId = randomUUID();
    const ttl = this.ttlSeconds();
    const now = Date.now();
    const record: SessionRecord = {
      sessionId,
      personId: person.id,
      method,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl * 1000).toISOString(),
      userAgent: userAgent?.slice(0, 160),
    };
    await this.guard(() =>
      this.redis
        .multi()
        .set(this.sessionKey(sessionId), JSON.stringify(record), 'EX', ttl)
        .sadd(this.indexKey(person.id), sessionId)
        .expire(this.indexKey(person.id), ttl)
        .exec(),
    );

    // Global JWT options (secret + expiry) come from JwtModule.registerAsync.
    const token = await this.jwt.signAsync({
      personId: person.id,
      email: person.email,
      sessionId,
      method,
    });
    return { token, sessionId };
  }

  /** The live session record, or null when revoked/expired/foreign. */
  async get(sessionId: string, personId: string): Promise<SessionRecord | null> {
    const raw = await this.guard(() => this.redis.get(this.sessionKey(sessionId)));
    if (!raw) {
      return null;
    }
    const record = parseRecord(raw);
    // A session id is only valid for the identity it was issued to.
    return record && record.personId === personId ? record : null;
  }

  async list(personId: string): Promise<SessionRecord[]> {
    const ids = await this.guard(() => this.redis.smembers(this.indexKey(personId)));
    if (ids.length === 0) {
      return [];
    }
    const raws = await this.guard(() => this.redis.mget(ids.map((id) => this.sessionKey(id))));
    const live: SessionRecord[] = [];
    const stale: string[] = [];
    raws.forEach((raw, i) => {
      const record = raw ? parseRecord(raw) : null;
      if (record && record.personId === personId) {
        live.push(record);
      } else {
        stale.push(ids[i]);
      }
    });
    if (stale.length > 0) {
      await this.guard(() => this.redis.srem(this.indexKey(personId), ...stale));
    }
    return live.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Revoke one session belonging to `personId`. Returns false if it was not theirs. */
  async revoke(personId: string, sessionId: string): Promise<boolean> {
    const record = await this.get(sessionId, personId);
    if (!record) {
      return false;
    }
    await this.guard(() =>
      this.redis
        .multi()
        .del(this.sessionKey(sessionId))
        .srem(this.indexKey(personId), sessionId)
        .exec(),
    );
    return true;
  }

  /** Revoke every session of a person, optionally keeping one (the caller's). */
  async revokeAll(personId: string, keepSessionId?: string): Promise<number> {
    const sessions = await this.list(personId);
    const doomed = sessions.filter((s) => s.sessionId !== keepSessionId);
    for (const s of doomed) {
      await this.revoke(personId, s.sessionId);
    }
    if (!keepSessionId) {
      await this.guard(() => this.redis.del(this.indexKey(personId)));
    }
    return doomed.length;
  }

  private async guard<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch {
      throw new ServiceUnavailableException(
        'The session store (Redis) is unavailable, so sign-in state cannot be verified. Try again shortly.',
      );
    }
  }
}

function parseRecord(raw: string): SessionRecord | null {
  try {
    const parsed = JSON.parse(raw) as SessionRecord;
    return typeof parsed?.personId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
