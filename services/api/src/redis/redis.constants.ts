/** DI token for the shared ioredis client (own file: avoids a redis.module <-> rate-limiter import cycle). */
export const REDIS = Symbol('ANIMA_REDIS');
