'use client';

const TOKEN_KEY = 'anima.token';
const PERSON_KEY = 'anima.person';

export interface StoredPerson {
  personId: string;
  displayName: string;
  email?: string;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuth(token: string, person: StoredPerson): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(PERSON_KEY, JSON.stringify(person));
}

export function getStoredPerson(): StoredPerson | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(PERSON_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredPerson;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(PERSON_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
