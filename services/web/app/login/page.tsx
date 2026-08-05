'use client';

import { useMutation } from '@apollo/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FaceCapture } from '@/components/auth/face-capture';
import { Button } from '@/components/ui/button';
import { setAuth } from '@/lib/auth';
import { apolloClient } from '@/lib/apollo';
import { LOGIN_WITH_FACE, LOGIN_WITH_PASSKEY, PASSKEY_LOGIN_OPTIONS } from '@/lib/graphql';
import { getCredential, isWebAuthnSupported } from '@/lib/webauthn';

type Method = 'passkey' | 'face';

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('passkey');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loginWithPasskey] = useMutation(LOGIN_WITH_PASSKEY);
  const [loginWithFace] = useMutation(LOGIN_WITH_FACE);

  async function handlePasskey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isWebAuthnSupported()) {
      setError('This browser does not support WebAuthn passkeys.');
      return;
    }
    setBusy(true);
    try {
      const { data: optData } = await apolloClient.query({
        query: PASSKEY_LOGIN_OPTIONS,
        variables: { email },
      });
      const assertion = await getCredential(optData.passkeyLoginOptions);
      const { data } = await loginWithPasskey({
        variables: { email, assertion: JSON.stringify(assertion) },
      });
      setAuth(data.loginWithPasskey.token, {
        personId: data.loginWithPasskey.personId,
        displayName: data.loginWithPasskey.displayName,
        email,
      });
      router.push('/app');
    } catch (err) {
      setError((err as Error).message || 'Passkey login failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFace(dataUrl: string) {
    setError(null);
    setBusy(true);
    try {
      const { data } = await loginWithFace({
        variables: { imageBase64: dataUrl, deviceScore: 0.7, behavioralScore: 0.6 },
      });
      setAuth(data.loginWithFace.token, {
        personId: data.loginWithFace.personId,
        displayName: data.loginWithFace.displayName,
      });
      router.push('/app');
    } catch (err) {
      setError((err as Error).message || 'Face not recognized. Try again or use a passkey.');
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
          <h1 className="mt-5 font-display text-3xl font-bold text-white">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-400">
            Prove it with your passkey — or just your face. The gateway opens either way.
          </p>
        </div>

        <div className="glass p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
            {(['passkey', 'face'] as Method[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-all ${
                  method === m ? 'bg-aurora-violet/20 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {method === 'passkey' ? (
            <form onSubmit={handlePasskey} className="space-y-4">
              <input
                type="email"
                className="input-dark"
                placeholder="you@anima.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && (
                <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-300">{error}</p>
              )}
              <Button type="submit" loading={busy} className="w-full !py-3">
                Continue with passkey
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <FaceCapture onCapture={handleFace} captureLabel={busy ? 'Verifying…' : 'Verify my face'} />
              {error && (
                <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-300">{error}</p>
              )}
              <p className="text-center text-[11px] text-slate-600">
                The image goes to the ANIMA Trust Service for verification only.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          New here?{' '}
          <Link href="/register" className="text-aurora-violet hover:text-violet-300">
            Create your identity
          </Link>
        </p>
      </div>
    </main>
  );
}
