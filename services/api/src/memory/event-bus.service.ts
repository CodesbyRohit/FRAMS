import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';

import { REDIS } from '../redis/redis.module';

export type BusEvent =
  | { channel: 'memory.event.created'; payload: Record<string, unknown> }
  | { channel: 'twin.updated'; payload: { personId: string; version: number } }
  | { channel: 'graph.synced'; payload: Record<string, unknown> };

/**
 * A tiny typed event bus.
 *
 *  - In-process EventEmitter: synchronous, zero-latency delivery to consumers
 *    in the same replica (memory indexer, twin updater, SSE streams).
 *  - Redis PUBLISH: a side-channel for observability and future cross-replica
 *    workers — the event-driven backbone of the platform.
 */
@Injectable()
export class EventBus implements OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private readonly redisClient: Redis;

  constructor(@Inject(REDIS) redis: Redis) {
    // A dedicated connection so the bus never competes with session traffic.
    this.redisClient = redis.duplicate();
    this.redisClient.on('error', () => undefined);
  }

  publish(event: BusEvent): void {
    this.emitter.emit(event.channel, event.payload);
    void this.redisClient.publish('anima.events', JSON.stringify(event)).catch(() => undefined);
  }

  on(channel: BusEvent['channel'], handler: (payload: any) => void | Promise<void>): () => void {
    const wrapped = (payload: any): void => {
      const result = handler(payload);
      // Swallow async consumer errors — the bus must never crash the API.
      if (result instanceof Promise) {
        result.catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[event-bus] consumer error on ${channel}:`, err?.message ?? err);
        });
      }
    };
    this.emitter.on(channel, wrapped);
    // Return an unsubscribe so short-lived consumers (SSE streams) can
    // detach and never leak listeners on the shared emitter.
    return () => this.emitter.off(channel, wrapped);
  }

  async onModuleDestroy(): Promise<void> {
    this.redisClient.disconnect();
  }
}
