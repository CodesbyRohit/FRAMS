'use client';

/**
 * Thin, typed wrappers around the WebAuthn browser APIs. The server-side
 * contract is @simplewebauthn's JSON types; these produce exactly that shape.
 */

function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const raw = atob(base64 + pad);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createCredential(
  optionsJson: string,
): Promise<Record<string, unknown>> {
  const options = JSON.parse(optionsJson) as PublicKeyCredentialCreationOptions;
  options.challenge = base64UrlToArrayBuffer(options.challenge as unknown as string);
  options.user.id = base64UrlToArrayBuffer(options.user.id as unknown as string);
  if (options.excludeCredentials) {
    options.excludeCredentials = options.excludeCredentials.map((c) => ({
      ...c,
      id: base64UrlToArrayBuffer(c.id as unknown as string),
    }));
  }
  const credential = (await navigator.credentials.create({
    publicKey: options,
  })) as PublicKeyCredential;
  return credential.toJSON() as unknown as Record<string, unknown>;
}

export async function getCredential(
  optionsJson: string,
): Promise<Record<string, unknown>> {
  const options = JSON.parse(optionsJson) as PublicKeyCredentialRequestOptions;
  options.challenge = base64UrlToArrayBuffer(options.challenge as unknown as string);
  if (options.allowCredentials) {
    options.allowCredentials = options.allowCredentials.map((c) => ({
      ...c,
      id: base64UrlToArrayBuffer(c.id as unknown as string),
    }));
  }
  const credential = (await navigator.credentials.get({
    publicKey: options,
  })) as PublicKeyCredential;
  return credential.toJSON() as unknown as Record<string, unknown>;
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && !!navigator.credentials;
}
