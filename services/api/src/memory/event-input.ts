import { BadRequestException } from '@nestjs/common';
import type { MemoryEventType } from '@anima/shared';

/**
 * Event types a person may record about themselves. Everything else
 * (identity creation, verification, security changes, document ingestion,
 * goal bookkeeping) is written only by the platform, so users cannot forge
 * e.g. "Identity verified via face" entries that agents would later cite.
 */
export const USER_EVENT_TYPES = [
  'NOTE_CREATED',
  'PROJECT_UPDATE',
  'SKILL_LEARNED',
  'MEETING_ATTENDED',
  'CODE_COMMITTED',
  'CHAT_CREATED',
  'IDEA_CREATED',
  'LINK_SHARED',
  'FEEDBACK_GIVEN',
] as const satisfies readonly MemoryEventType[];

/** Platform-written events that are audit records, not knowledge about the person. */
export const SECURITY_EVENT_TYPES: readonly MemoryEventType[] = [
  'IDENTITY_CREATED',
  'VERIFICATION_SUCCEEDED',
  'SECURITY_CHANGED',
];

export type UserEventType = (typeof USER_EVENT_TYPES)[number];

export interface SanitizedPayload {
  skills?: string[];
  interests?: string[];
  project?: string;
  idea?: string;
  topic?: string;
  collaboratorName?: string;
  url?: string;
}

const MAX_SUMMARY = 2000;
const MAX_PAYLOAD_BYTES = 8 * 1024;

export function validateUserEvent(
  type: unknown,
  summary: unknown,
  payloadJson: unknown,
): { type: UserEventType; summary: string; payload: SanitizedPayload } {
  if (typeof type !== 'string' || !(USER_EVENT_TYPES as readonly string[]).includes(type)) {
    throw new BadRequestException(
      `Unsupported memory type. Allowed: ${USER_EVENT_TYPES.join(', ')}.`,
    );
  }
  if (typeof summary !== 'string' || !summary.trim()) {
    throw new BadRequestException('A memory needs some text.');
  }
  const text = summary.trim();
  if (text.length > MAX_SUMMARY) {
    throw new BadRequestException(`A memory can be at most ${MAX_SUMMARY} characters.`);
  }
  return { type: type as UserEventType, summary: text, payload: parsePayload(payloadJson) };
}

export function parsePayload(payloadJson: unknown): SanitizedPayload {
  if (payloadJson === undefined || payloadJson === null || payloadJson === '') {
    return {};
  }
  if (typeof payloadJson !== 'string') {
    throw new BadRequestException('payload must be a JSON string.');
  }
  if (Buffer.byteLength(payloadJson, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new BadRequestException('payload is too large (max 8 KB).');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(payloadJson);
  } catch {
    throw new BadRequestException('payload is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('payload must be a JSON object.');
  }
  const obj = raw as Record<string, unknown>;
  const out: SanitizedPayload = {};

  const list = (key: 'skills' | 'interests') => {
    const v = obj[key];
    if (v === undefined) return;
    if (!Array.isArray(v) || v.some((s) => typeof s !== 'string')) {
      throw new BadRequestException(`payload.${key} must be a list of strings.`);
    }
    const cleaned = (v as string[]).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (cleaned.length > 20 || cleaned.some((s) => s.length > 60)) {
      throw new BadRequestException(`payload.${key}: at most 20 entries of 60 characters.`);
    }
    out[key] = [...new Map(cleaned.map((s) => [s.toLowerCase(), s])).values()];
  };
  const text = (key: 'project' | 'idea' | 'topic' | 'collaboratorName' | 'url', max: number) => {
    const v = obj[key];
    if (v === undefined) return;
    if (typeof v !== 'string' || !v.trim() || v.trim().length > max) {
      throw new BadRequestException(`payload.${key} must be text of at most ${max} characters.`);
    }
    out[key] = v.trim();
  };

  list('skills');
  list('interests');
  text('project', 120);
  text('idea', 200);
  text('topic', 200);
  text('collaboratorName', 120);
  text('url', 500);
  if (out.url && !/^https?:\/\//i.test(out.url)) {
    throw new BadRequestException('payload.url must start with http:// or https://');
  }
  return out;
}
