import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { RateLimiter } from './rate-limiter.service';
import { REDIS } from './redis.constants';

export { REDIS };

/**
 * Global Redis client — used for session storage (auth), WebAuthn challenges,
 * rate limiting and the event-bus side channel. Each API replica gets its own
 * connection.
 */

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): Redis => {
        const client = new Redis(cfg.get('REDIS_URL', 'redis://localhost:6379'), {
          maxRetriesPerRequest: 2,
          lazyConnect: false,
        });
        client.on('error', (err) => {
          // Never crash the process on transient Redis failures; requests that
          // need Redis fail closed with a 503 instead.
          // eslint-disable-next-line no-console
          console.error('[redis] connection error:', err.message);
        });
        return client;
      },
    },
    RateLimiter,
  ],
  exports: [REDIS, RateLimiter],
})
export class RedisModule {}
