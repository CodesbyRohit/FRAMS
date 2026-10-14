import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedPerson } from './jwt-auth.guard';

/**
 * Small, explicit input validators for GraphQL scalar arguments. The global
 * ValidationPipe only validates DTO classes, so plain `@Args('x') x: string`
 * arguments would otherwise reach services unchecked.
 */

export function requireText(
  value: unknown,
  field: string,
  { min = 1, max }: { min?: number; max: number },
): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new BadRequestException(min <= 1 ? `${field} is required.` : `${field} must be at least ${min} characters.`);
  }
  if (trimmed.length > max) {
    throw new BadRequestException(`${field} must be at most ${max} characters.`);
  }
  return trimmed;
}

export function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireText(value, field, { min: 0, max });
}

export function textList(
  value: unknown,
  field: string,
  { maxItems, maxLength }: { maxItems: number; maxLength: number },
): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${field} must be a list.`);
  }
  if (value.some((v) => typeof v !== 'string')) {
    throw new BadRequestException(`${field} must contain only text.`);
  }
  const items = (value as string[]).map((v) => v.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (items.length > maxItems) {
    throw new BadRequestException(`${field} can have at most ${maxItems} entries.`);
  }
  for (const item of items) {
    if (item.length > maxLength) {
      throw new BadRequestException(`Each ${field} entry must be at most ${maxLength} characters.`);
    }
  }
  return [...new Map(items.map((i) => [i.toLowerCase(), i])).values()];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  const email = requireText(value, 'Email', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new BadRequestException('Enter a valid email address.');
  }
  return email;
}

/**
 * Sensitive account operations need a session that was opened with a passkey.
 * A face match alone never authorizes changes to credentials or the account.
 */
export function assertPasskeySession(person: AuthenticatedPerson, action: string): void {
  if (person.method !== 'passkey') {
    throw new ForbiddenException(
      `${action} requires a session started with your passkey. Sign out, sign in with your passkey, and try again.`,
    );
  }
}
