'use client';

import { useMutation } from '@apollo/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { setAuth } from '@/lib/auth';
import { apolloClient } from '@/lib/apollo';
import {
  ONBOARD,
  PASSKEY_REGISTRATION_OPTIONS,
  REGISTER_PASSKEY,
} from '@/lib/graphql';
import { createCredential, isWebAuthnSupported } from '@/lib/webauthn';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roles, setRoles] = useState('builder, learner');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [onboard] = useMutation(ONBOARD);
  const [registerPasskey] = useMutation(REGISTER_PASSKEY);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isWebAuthnSupported()) {
      setError('This browser does not support WebAuthn passkeys. Use Safari, Chrome or Edge.');
      return;
    }
    setBusy(true);
    try {
      // 1. Create the identity + digital twin.
      const { data } = await onboard({
        variables: {
          email,
          displayName,
          roles: roles.split(',').map((r) => r.trim()).filter(Boolean),
        },
      });
      const personId: string = data.onboard.id;

      // 2. Ask the authenticator to create a passkey (the primary factor).
      const { data: optData } = await apolloClient.query({
        query: PASSKEY_REGISTRATION_OPTIONS,
        variables: { personId },
      });
      const attestation = await createCredential(optData.passkeyRegistrationOptions);

      // 3. Bind it and receive the session token.
      const { data: regData } = await registerPasskey({
        variables: {
          personId,
          deviceName: navigator.userAgent.slice(0, 64),
          attestation: JSON.stringify(attestation),
        },
      });
      setAuth(regData.registerPasskey.token, {
        personId,
        displayName: regData.registerPasskey.displayName,
        email,
      });
      router.push('/app');
    } catch (err) {
      setError((err as Error).message || 'Registration failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="aurora-bg flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-aurora-violet to-aurora-cyan text-lg font-bold text-white shadow-glow">
            A
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold text-white">Create your identity</h1>
          <p className="mt-2 text-sm text-slate-400">
            Your Digital Twin is born the moment you are. No password to remember.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Display name</label>
            <input
              className="input-dark"
              placeholder="Aurora Chen"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
            <input
              type="email"
              className="input-dark"
              placeholder="you@anima.ai"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Roles <span className="text-slate-600">(comma separated)</span>
            </label>
            <input
              className="input-dark"
              placeholder="engineer, researcher"
              value={roles}
              onChange={(e) => setRoles(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" loading={busy} className="w-full !py-3">
            Create identity with passkey
          </Button>

          <div className="flex items-center justify-center gap-2 pt-1 text-xs text-slate-500">
            <Badge tone="emerald">WebAuthn</Badge>
            <Badge tone="cyan">Zero passwords</Badge>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an identity?{' '}
          <Link href="/login" className="text-aurora-violet hover:text-violet-300">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
