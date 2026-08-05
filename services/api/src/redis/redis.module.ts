import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Global Redis client — used for session storage (auth), distributed locks,
 * and cross-instance event fan-out. Each API replica gets its own connection.
 */
export const REDIS = Symbol('ANIMA_REDIS');

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
          // Never crash the process on transient Redis failures.
          // eslint-disable-next-line no-console
          console.error('[redis] connection error:', err.message);
        });
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
