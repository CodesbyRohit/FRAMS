import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { FakeRedis } from '../../test/fake-redis';
import { verifySessionToken } from '../common/jwt-auth.guard';
import { SessionsService } from './sessions.service';

const SECRET = 'x'.repeat(40);

function setup() {
  const redis = new FakeRedis();
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: 3600 } });
  const cfg = { get: (k: string, d?: unknown) => (k === 'ANIMA_JWT_SECRET' ? SECRET : d) } as unknown as ConfigService;
  const sessions = new SessionsService(jwt, cfg, redis as never);
  const verify = (token: string) => verifySessionToken(token, jwt, cfg, sessions);
  return { redis, jwt, sessions, verify };
}

const alice = { id: 'person_alice', email: 'alice@example.com' };
const bob = { id: 'person_bob', email: 'bob@example.com' };

describe('Session revocation', () => {
  it('honours a token only while its session record exists', async () => {
    const { sessions, verify } = setup();
    const { token, sessionId } = await sessions.create(alice, 'passkey');
    await expect(verify(token)).resolves.toMatchObject({ personId: alice.id, sessionId, method: 'passkey' });

    await expect(sessions.revoke(alice.id, sessionId)).resolves.toBe(true);
    await expect(verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('cannot revoke, read or use another person\'s session', async () => {
    const { sessions, verify } = setup();
    const { token, sessionId } = await sessions.create(alice, 'passkey');
    await expect(sessions.revoke(bob.id, sessionId)).resolves.toBe(false);
    await expect(sessions.get(sessionId, bob.id)).resolves.toBeNull();
    // Alice's session survives Bob's attempt.
    await expect(verify(token)).resolves.toMatchObject({ personId: alice.id });
  });

  it('rejects a validly signed token whose session id belongs to someone else', async () => {
    const { sessions, jwt, verify } = setup();
    const { sessionId } = await sessions.create(alice, 'passkey');
    const forged = await jwt.signAsync({ personId: bob.id, email: bob.email, sessionId, method: 'passkey' });
    await expect(verify(forged)).rejects.toThrow(UnauthorizedException);
  });

  it('takes the session method from the server record, not the token', async () => {
    const { sessions, jwt, verify } = setup();
    const { sessionId } = await sessions.create(alice, 'face');
    const upgraded = await jwt.signAsync({ personId: alice.id, email: alice.email, sessionId, method: 'passkey' });
    await expect(verify(upgraded)).resolves.toMatchObject({ method: 'face' });
  });

  it('revokeAll keeps only the caller\'s session', async () => {
    const { sessions, verify } = setup();
    const a = await sessions.create(alice, 'passkey');
    const b = await sessions.create(alice, 'passkey');
    const c = await sessions.create(alice, 'face');
    await expect(sessions.revokeAll(alice.id, a.sessionId)).resolves.toBe(2);
    await expect(verify(a.token)).resolves.toBeTruthy();
    await expect(verify(b.token)).rejects.toThrow(UnauthorizedException);
    await expect(verify(c.token)).rejects.toThrow(UnauthorizedException);
  });

  it('fails closed when the session store is unreachable', async () => {
    const { sessions, redis, verify } = setup();
    const { token } = await sessions.create(alice, 'passkey');
    redis.down = true;
    await expect(verify(token)).rejects.toThrow(ServiceUnavailableException);
  });
});
