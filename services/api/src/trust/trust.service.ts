import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TrustProfileEntity } from './trust.entity';

/** Result of a 1:1 face + liveness verification performed by the Trust Service. */
export interface LivenessVerifyResult {
  verified: boolean;
  subjectId?: string | null;
  /** 1 − face distance for the best-matching frame; 0 when no face was found. */
  similarity: number;
  livenessPassed: boolean;
  reason: string;
}

interface TrustVerificationWire {
  verified: boolean;
  subject_id?: string | null;
  confidence: number;
  reason: string;
  liveness?: boolean | null;
}

export type TrustHealth = 'ok' | 'degraded' | 'unreachable' | 'unauthorized';

/**
 * Typed client for the standalone Trust Service (services/trust) plus the
 * API-side record of what has been verified. The API never stores face images
 * or embeddings — those live only in the Trust Service.
 */
@Injectable()
export class TrustService {
  private readonly logger = new Logger(TrustService.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(
    cfg: ConfigService,
    @InjectRepository(TrustProfileEntity)
    private readonly profileRepo: Repository<TrustProfileEntity>,
  ) {
    this.baseUrl = String(cfg.get('TRUST_SERVICE_URL', 'http://localhost:8090')).replace(/\/$/, '');
    this.token = cfg.get('TRUST_SERVICE_TOKEN', 'anima-trust-local');
    this.timeoutMs = Number(cfg.get('TRUST_SERVICE_TIMEOUT_MS', 45_000));
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
      });
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      throw new ServiceUnavailableException(
        aborted
          ? 'The Trust Service took too long to respond.'
          : 'The Trust Service is unreachable, so face features are unavailable right now.',
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw await mapTrustError(res);
    }
    return (await res.json()) as T;
  }

  async health(): Promise<TrustHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3_000) });
      if (!res.ok) return 'degraded';
      const body = (await res.json()) as { status?: string };
      return body.status === 'ok' ? 'ok' : 'degraded';
    } catch {
      return 'unreachable';
    }
  }

  /** Enroll exactly one face for the subject (the Trust Service enforces this). */
  async registerFace(subjectId: string, displayName: string, imageBytes: Buffer): Promise<void> {
    const form = new FormData();
    form.append('subject_id', subjectId);
    form.append('display_name', displayName);
    form.append('image', new Blob([new Uint8Array(imageBytes)], { type: 'image/jpeg' }), 'face.jpg');
    await this.call('/identities', { method: 'POST', body: form });
    this.logger.log(`Enrolled face for subject ${subjectId}`);
  }

  /** 1:1 verification of a short frame burst: face match AND blink liveness. */
  async verifyLiveness(subjectId: string, frames: string[]): Promise<LivenessVerifyResult> {
    const wire = await this.call<TrustVerificationWire>('/verify/liveness', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subject_id: subjectId,
        frames: frames.map((f, i) => ({ image_base64: stripDataUrl(f), timestamp_ms: i })),
      }),
    });
    return {
      verified: wire.verified === true && wire.liveness === true && wire.subject_id === subjectId,
      subjectId: wire.subject_id,
      similarity: clamp01(wire.confidence),
      livenessPassed: wire.liveness === true,
      reason: wire.reason,
    };
  }

  /** Permanently erase the subject's embeddings. Missing subject counts as erased. */
  async deleteFace(subjectId: string): Promise<void> {
    try {
      await this.call(`/identities/${encodeURIComponent(subjectId)}`, { method: 'DELETE' });
    } catch (err) {
      if (err instanceof NotFoundException) {
        return;
      }
      throw err;
    }
  }

  // ── API-side trust profile ─────────────────────────────────────────────────

  async getProfile(personId: string): Promise<TrustProfileEntity> {
    const existing = await this.profileRepo.findOne({ where: { personId } });
    if (existing) {
      return existing;
    }
    return this.profileRepo.save(this.profileRepo.create({ personId, boundMethods: [] }));
  }

  async markMethodBound(personId: string, method: string): Promise<TrustProfileEntity> {
    const profile = await this.getProfile(personId);
    if (!profile.boundMethods.includes(method)) {
      profile.boundMethods = [...profile.boundMethods, method];
    }
    return this.profileRepo.save(profile);
  }

  async markFaceEnrolled(personId: string, consentAt: Date): Promise<TrustProfileEntity> {
    const profile = await this.getProfile(personId);
    profile.faceEnrolled = true;
    profile.faceConsentAt = consentAt;
    if (!profile.boundMethods.includes('face')) {
      profile.boundMethods = [...profile.boundMethods, 'face'];
    }
    return this.profileRepo.save(profile);
  }

  async markFaceRemoved(personId: string): Promise<TrustProfileEntity> {
    const profile = await this.getProfile(personId);
    profile.faceEnrolled = false;
    profile.faceConsentAt = null;
    profile.lastFaceSimilarity = null;
    profile.boundMethods = profile.boundMethods.filter((m) => m !== 'face');
    return this.profileRepo.save(profile);
  }

  async recordVerification(
    personId: string,
    method: 'passkey' | 'face',
    faceSimilarity?: number,
  ): Promise<TrustProfileEntity> {
    const profile = await this.getProfile(personId);
    profile.lastVerifiedAt = new Date();
    profile.lastVerificationMethod = method;
    if (method === 'face' && faceSimilarity !== undefined) {
      profile.lastFaceSimilarity = faceSimilarity;
    }
    if (!profile.boundMethods.includes(method)) {
      profile.boundMethods = [...profile.boundMethods, method];
    }
    return this.profileRepo.save(profile);
  }

  async deleteProfile(personId: string): Promise<void> {
    await this.profileRepo.delete({ personId });
  }
}

export function stripDataUrl(value: string): string {
  return value.replace(/^data:image\/[\w.+-]+;base64,/, '');
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

/** Translate Trust Service HTTP errors into meaningful API errors (no 500s). */
export async function mapTrustError(res: Response): Promise<HttpException> {
  let detail = '';
  try {
    const body = (await res.json()) as { detail?: unknown };
    detail = typeof body.detail === 'string' ? body.detail : '';
  } catch {
    detail = '';
  }
  switch (res.status) {
    case 400:
    case 422:
      return new BadRequestException(detail || 'The Trust Service rejected the image.');
    case 404:
      return new NotFoundException(detail || 'No face enrollment found.');
    case 409:
      return new ConflictException(detail || 'This face is already enrolled.');
    case 413:
      return new PayloadTooLargeException(detail || 'Image too large.');
    case 401:
    case 403:
      return new ServiceUnavailableException(
        'The API is not authorized to use the Trust Service (TRUST_SERVICE_TOKEN mismatch).',
      );
    case 503:
      return new ServiceUnavailableException(
        detail || 'The Trust Service face engine is not installed on its host.',
      );
    default:
      return new ServiceUnavailableException(`The Trust Service failed (${res.status}).`);
  }
}
