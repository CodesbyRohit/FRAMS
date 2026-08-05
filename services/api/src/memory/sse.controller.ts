import { Controller, ForbiddenException, Get, Param, Query, Req, Sse } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

import { Public } from '../common/public.decorator';
import { EventBus } from './event-bus.service';

/**
 * Server-Sent Events stream of live twin mutations.
 *
 * EventSource cannot send Authorization headers, so the JWT travels as a
 * query parameter — validated here explicitly. This is the realtime backbone
 * the web app uses to animate the twin and the galaxy as the memory indexer
 * processes events.
 */
@Public()
@Controller('sse')
export class SseController {
  constructor(
    private readonly bus: EventBus,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  @Sse('twin/:personId')
  twinStream(
    @Param('personId') personId: string,
    @Query('token') token: string,
  ): Observable<MessageEvent> {
    this.assertToken(token, personId);
    return new Observable<MessageEvent>((subscriber) => {
      const unsubscribe = this.bus.on('twin.updated', (payload) => {
        if (payload.personId === personId) {
          subscriber.next({ data: JSON.stringify(payload) } as MessageEvent);
        }
      });
      // Keepalive comment so proxies don't drop the connection.
      const keepalive = setInterval(
        () => subscriber.next({ data: ':keepalive' } as MessageEvent),
        20_000,
      );
      return () => {
        unsubscribe();
        clearInterval(keepalive);
      };
    });
  }

  private assertToken(token: string | undefined, personId: string): void {
    if (!token) {
      throw new ForbiddenException('Missing token.');
    }
    try {
      const payload = this.jwt.verify<{ personId: string }>(token, {
        secret: this.cfg.get('ANIMA_JWT_SECRET'),
      });
      if (payload.personId !== personId) {
        throw new ForbiddenException('Token does not match this twin.');
      }
    } catch {
      throw new ForbiddenException('Invalid token.');
    }
  }
}
