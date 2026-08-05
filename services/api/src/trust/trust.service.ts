import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Redis } from 'ioredis';
import { Repository } from 'typeorm';

import { REDIS } from '../redis/redis.module';
import { TrustProfileEntity } from './trust.entity';

export interface FaceVerifyOptions {
  subjectId?: string;
  deviceScore?: number;
  behavioralScore?: number;
}

export interface FaceVerifyResult {
  verified: boolean;
  subjectId?: string | null;
  confidence: number;
  reason: string;
  risk: string;
  liveness?: boolean;
}

export interface LivenessVerifyInput {
  subjectId: string;
  frames: string[];
  deviceScore?: number;
  behavioralScore?: number;
}

/**
 * Thin, typed client for the standalone Trust Service (services/trust).
 * The API never touches face data directly — the trust layer is a remote,
 * independently deployable capability that any product can consume.
 */
@Injectable()
export class TrustService {
  private readonly logger = new Logger(TrustService.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(
    private readonly cfg: ConfigService,
    @InjectRepository(TrustProfileEntity)
    private readonly profileRepo: Repository<TrustProfileEntity>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.baseUrl = cfg.get('TRUST_SERVICE_URL', 'http://localhost:8090');
    this.token = cfg.get('TRUST_SERVICE_TOKEN', 'anima-trust-local');
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 503) {
      throw new ServiceUnavailableException(
        'Trust service face engine unavailable. Install face_recognition on the trust host.',
      );
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Trust service ${res.status}: ${detail.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  /** Multipart upload helper for image-based endpoints. */
  private async callMultipart<T>(path: string, fields: Record<string, string | Blob>): Promise<T> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    return this.call<T>(path, { method: 'POST', body: form });
  }

  async registerFace(
    subjectId: string,
    displayName: string,
    imageBytes: Uint8Array,
  ): Promise<void> {
    const blob = new Blob([Buffer.from(imageBytes) as unknown as BlobPart], { type: 'image/jpeg' });
    await this.callMultipart('/identities', {
      subject_id: subjectId,
      display_name: displayName,
      image: blob,
    });
    this.logger.log(`Registered face for subject ${subjectId}`);
  }

  async verifyFace(imageBase64: string, opts: FaceVerifyOptions = {}): Promise<FaceVerifyResult> {
    const raw = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBlob = new Blob([Buffer.from(raw, 'base64')], { type: 'image/jpeg' });
    const fields: Record<string, string | Blob> = {
      image: imageBlob,
      device_score: String(opts.deviceScore ?? 0.5),
      behavioral_score: String(opts.behavioralScore ?? 0.5),
    };
    if (opts.subjectId) {
      fields.subject_id = opts.subjectId;
    }
    return this.callMultipart<FaceVerifyResult>('/verify', fields);
  }

  async verifyLiveness(input: LivenessVerifyInput): Promise<FaceVerifyResult> {
    return this.call<FaceVerifyResult>('/verify/liveness', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subject_id: input.subjectId,
        frames: input.frames.map((f) => f.replace(/^data:image\/\w+;base64,/, '')),
        device_score: input.deviceScore ?? 0.5,
        behavioral_score: input.behavioralScore ?? 0.5,
      }),
    });
  }

  // ── Trust profile materialization ─────────────────────────────────────────

  private profileCacheKey(personId: string): string {
    return `anima:trust:${personId}`;
  }

  async getProfile(personId: string): Promise<TrustProfileEntity> {
    const cached = await this.redis.get(this.profileCacheKey(personId));
    if (cached) {
      return JSON.parse(cached) as TrustProfileEntity;
    }
    let profile = await this.profileRepo.findOne({ where: { personId } });
    if (!profile) {
      profile = this.profileRepo.create({ personId, boundMethods: [] });
      profile = await this.profileRepo.save(profile);
    }
    await this.redis.set(this.profileCacheKey(personId), JSON.stringify(profile), 'EX', 60);
    return profile;
  }

  async recordVerification(
    personId: string,
    result: FaceVerifyResult,
    method: string,
  ): Promise<TrustProfileEntity> {
    const profile = await this.getProfile(personId);
    profile.identityScore = Math.max(profile.identityScore, result.confidence);
    profile.lastVerifiedAt = new Date().toISOString();
    profile.lastVerificationMethod = method;
    if (!profile.boundMethods.includes(method)) {
      profile.boundMethods.push(method);
    }
    const saved = await this.profileRepo.save(profile);
    await this.redis.set(this.profileCacheKey(personId), JSON.stringify(saved), 'EX', 60);
    return saved;
  }
}
