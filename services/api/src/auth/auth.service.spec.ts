import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { FakeRedis } from '../../test/fake-redis';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';

const meta = { ip: '203.0.113.7', userAgent: 'jest' };
const FRAMES = Array.from({ length: 8 }, () => 'aGVsbG8=');

function setup() {
  const redis = new FakeRedis();
  const people = new Map<string, { id: string; email: string; displayName: string }>();
  const credentials = new Map<string, string>(); // credentialId -> personId
  let seq = 0;

  const identities = {
    findByEmail: jest.fn(async (email: string) => [...people.values()].find((p) => p.email === email) ?? null),
    findById: jest.fn(async (id: string) => {
      const p = people.get(id);
      if (!p) throw new Error('Identity not found.');
      return p;
    }),
    create: jest.fn(async (input: { email: string; displayName: string }) => {
      const p = { id: `person_${++seq}`, ...input };
      people.set(p.id, p);
      return p;
    }),
    removeAbandoned: jest.fn(async (id: string) => void people.delete(id)),
  };
  const passkeys = {
    countFor: jest.fn(async (personId: string) => [...credentials.values()].filter((p) => p === personId).length),
    registrationOptions: jest.fn(async (personId: string) => ({ challenge: `c-${personId}`, user: { id: personId } })),
    // The real service verifies the attestation against the challenge stored for this person.
    verifyRegistration: jest.fn(async (personId: string, deviceName: string) => {
      const credentialId = `cred_${++seq}`;
      credentials.set(credentialId, personId);
      return { credentialId, personId, deviceName };
    }),
  };
  const sessions = {
    create: jest.fn(async (person: { id: string }, method: string) => ({ token: `tok:${person.id}:${method}`, sessionId: 's1' })),
    revoke: jest.fn(async () => true),
  };
  const trust = {
    markMethodBound: jest.fn(async () => undefined),
    recordVerification: jest.fn(async () => undefined),
    getProfile: jest.fn(async (personId: string) => ({ personId, faceEnrolled: false, boundMethods: [] as string[] })),
    verifyLiveness: jest.fn(),
    registerFace: jest.fn(async () => undefined),
    markFaceEnrolled: jest.fn(async () => undefined),
  };
  const memory = { ingest: jest.fn(async () => ({})) };
  const limiter = { consume: jest.fn(async () => undefined) };

  const auth = new AuthService(
    identities as never,
    passkeys as never,
    sessions as never,
    trust as never,
    memory as never,
    limiter as never,
    redis as never,
  );
  const resolver = new AuthResolver(auth, passkeys as never, sessions as never, trust as never);
  return { auth, resolver, redis, identities, passkeys, sessions, trust, memory, limiter, credentials };
}

describe('Passkey registration ticket', () => {
  it('binds the first passkey to the identity the ticket names, then dies', async () => {
    const { auth, passkeys } = setup();
    const { person, ticket } = await auth.onboard({ email: 'a@example.com', displayName: 'Ada', roles: [] }, meta);

    const payload = await auth.registerFirstPasskey(ticket, 'Laptop', {} as never, meta);
    expect(payload).toMatchObject({ personId: person.id, verificationMethod: 'passkey' });
    expect(passkeys.verifyRegistration).toHaveBeenCalledWith(person.id, 'Laptop', {});

    // Reuse after success: the ticket was consumed.
    await expect(auth.registerFirstPasskey(ticket, 'Attacker key', {} as never, meta)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.firstPasskeyOptions(ticket)).rejects.toThrow(UnauthorizedException);
    expect(passkeys.verifyRegistration).toHaveBeenCalledTimes(1);
  });

  it('refuses a second passkey via the ticket even if deleting the ticket failed', async () => {
    const { auth, redis, passkeys } = setup();
    const { ticket } = await auth.onboard({ email: 'a@example.com', displayName: 'Ada', roles: [] }, meta);
    await auth.registerFirstPasskey(ticket, 'Laptop', {} as never, meta);
    // Simulate the ticket surviving (e.g. DEL failed): put it back.
    const personId = [...passkeys.verifyRegistration.mock.calls][0][0];
    await redis.set(`anima:onboarding:${ticket}`, personId);

    await expect(auth.registerFirstPasskey(ticket, 'Attacker key', {} as never, meta)).rejects.toThrow(
      /already been used/,
    );
    expect(passkeys.verifyRegistration).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown tickets without touching any identity', async () => {
    const { auth, passkeys } = setup();
    await auth.onboard({ email: 'a@example.com', displayName: 'Ada', roles: [] }, meta);
    await expect(auth.registerFirstPasskey('not-a-ticket', 'x', {} as never, meta)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(passkeys.verifyRegistration).not.toHaveBeenCalled();
  });

  it('the resolver takes no person id: identity comes only from the ticket', async () => {
    const { auth, resolver, passkeys } = setup();
    const victim = await auth.onboard({ email: 'victim@example.com', displayName: 'V', roles: [] }, meta);
    const attacker = await auth.onboard({ email: 'eve@example.com', displayName: 'E', roles: [] }, meta);

    await resolver.registerPasskey(meta, attacker.ticket, '{"id":"x"}', 'Eve key');
    expect(passkeys.verifyRegistration).toHaveBeenCalledWith(attacker.person.id, 'Eve key', { id: 'x' });
    expect(passkeys.verifyRegistration).not.toHaveBeenCalledWith(victim.person.id, expect.anything(), expect.anything());
  });

  it('rejects malformed attestation JSON with 400, not 500', async () => {
    const { resolver, auth } = setup();
    const { ticket } = await auth.onboard({ email: 'a@example.com', displayName: 'Ada', roles: [] }, meta);
    await expect(resolver.registerPasskey(meta, ticket, '{nope', undefined)).rejects.toThrow(BadRequestException);
  });

  it('onboarding is rate limited per IP', async () => {
    const { auth, limiter } = setup();
    await auth.onboard({ email: 'a@example.com', displayName: 'Ada', roles: [] }, meta);
    expect(limiter.consume).toHaveBeenCalledWith('onboard:ip:203.0.113.7', 10, 3600);
  });
});

describe('Face safeguards', () => {
  const face: AuthenticatedPerson = { personId: 'person_1', email: 'a@example.com', sessionId: 's', method: 'face' };
  const passkey: AuthenticatedPerson = { ...face, method: 'passkey' };

  it('face sign-in is 1:1, rate limited per IP and per email, and needs a blink', async () => {
    const { auth, trust, limiter } = setup();
    const { person } = await auth.onboard({ email: 'a@example.com', displayName: 'Ada', roles: [] }, meta);
    trust.getProfile.mockResolvedValue({ personId: person.id, faceEnrolled: true, boundMethods: ['face'] });
    trust.verifyLiveness.mockResolvedValue({ verified: false, similarity: 0.9, livenessPassed: false, reason: 'no blink' });

    await expect(auth.loginWithFace('a@example.com', FRAMES, meta)).rejects.toThrow(/No blink/);
    expect(trust.verifyLiveness).toHaveBeenCalledWith(person.id, FRAMES);
    expect(limiter.consume).toHaveBeenCalledWith('face:ip:203.0.113.7', 20, 900);
    expect(limiter.consume).toHaveBeenCalledWith('face:email:a@example.com', 5, 900);
  });

  it('gives the same generic error for unknown and non-enrolled identities', async () => {
    const { auth, trust } = setup();
    await auth.onboard({ email: 'a@example.com', displayName: 'Ada', roles: [] }, meta);
    const unknown = auth.loginWithFace('nobody@example.com', FRAMES, meta).catch((e: Error) => e.message);
    const notEnrolled = auth.loginWithFace('a@example.com', FRAMES, meta).catch((e: Error) => e.message);
    expect(await unknown).toBe(await notEnrolled);
    expect(trust.verifyLiveness).not.toHaveBeenCalled();
  });

  it('rejects a single still image (too few frames)', async () => {
    const { auth } = setup();
    await expect(auth.loginWithFace('a@example.com', ['one-photo'], meta)).rejects.toThrow(BadRequestException);
  });

  it('opens a face session (not a passkey session) on success', async () => {
    const { auth, trust } = setup();
    const { person } = await auth.onboard({ email: 'a@example.com', displayName: 'Ada', roles: [] }, meta);
    trust.getProfile.mockResolvedValue({ personId: person.id, faceEnrolled: true, boundMethods: ['face'] });
    trust.verifyLiveness.mockResolvedValue({ verified: true, similarity: 0.62, livenessPassed: true, reason: 'ok' });
    await expect(auth.loginWithFace('a@example.com', FRAMES, meta)).resolves.toMatchObject({
      personId: person.id,
      verificationMethod: 'face',
      faceMatchSimilarity: 0.62,
      livenessPassed: true,
    });
  });

  it('enrollment needs a passkey session and explicit consent', async () => {
    const { resolver, trust, auth } = setup();
    const { person } = await auth.onboard({ email: 'a@example.com', displayName: 'Ada', roles: [] }, meta);
    const me = { ...passkey, personId: person.id };

    await expect(resolver.enrollFace({ ...me, method: 'face' }, 'aGVsbG8=', true)).rejects.toThrow(ForbiddenException);
    await expect(resolver.enrollFace(me, 'aGVsbG8=', false)).rejects.toThrow(/consent/);
    expect(trust.registerFace).not.toHaveBeenCalled();

    await resolver.enrollFace(me, 'aGVsbG8=', true);
    expect(trust.registerFace).toHaveBeenCalledWith(person.id, 'Ada', expect.any(Buffer));
  });

  it('a face session cannot remove face data or manage passkeys', async () => {
    const { resolver } = setup();
    await expect(resolver.deleteFace(face)).rejects.toThrow(ForbiddenException);
    await expect(resolver.addPasskeyOptions(face)).rejects.toThrow(ForbiddenException);
    await expect(resolver.removePasskey(face, 'cred')).rejects.toThrow(ForbiddenException);
  });
});

describe('Logout', () => {
  it('revokes exactly the caller\'s own session', async () => {
    const { resolver, sessions } = setup();
    const me: AuthenticatedPerson = { personId: 'person_9', email: 'x@example.com', sessionId: 'sess_9', method: 'face' };
    await expect(resolver.logout(me)).resolves.toBe(true);
    expect(sessions.revoke).toHaveBeenCalledWith('person_9', 'sess_9');
  });
});
