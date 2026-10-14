import { HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Redis } from 'ioredis';

import { REDIS } from './redis.constants';

/**
 * Fixed-window rate limiter backed by Redis. Used on unauthenticated,
 * abuse-prone endpoints (onboarding, sign-in ceremonies, face verification).
 * Fails closed: if Redis is down these endpoints refuse rather than run
 * unlimited.
 */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async consume(bucket: string, limit: number, windowSeconds: number): Promise<void> {
    const key = `anima:rl:${bucket}`;
    let count: number;
    try {
      const res = await this.redis.multi().incr(key).expire(key, windowSeconds, 'NX').exec();
      count = Number(res?.[0]?.[1] ?? 0);
    } catch {
      throw new ServiceUnavailableException('Rate limiting is unavailable (Redis). Try again shortly.');
    }
    if (count > limit) {
      throw new HttpException(
        'Too many attempts. Wait a few minutes before trying again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
