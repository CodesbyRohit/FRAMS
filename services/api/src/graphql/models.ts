import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

/**
 * Centralized code-first GraphQL schema. Every resolver maps domain entities
 * onto these object types, keeping the wire contract stable and documented.
 *
 * Convention: anything that depends on an optional backend (vector store,
 * graph, model, Trust Service) carries an explicit `status` so the client can
 * tell "unavailable" apart from "empty".
 */

@ObjectType('Person')
export class PersonGql {
  @Field() id: string;
  @Field() email: string;
  @Field() displayName: string;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field(() => String, { nullable: true }) bio?: string | null;
  @Field(() => [String]) roles: string[];
  @Field() createdAt: string;
  @Field() updatedAt: string;
}

@ObjectType('Onboarding', {
  description: 'A newly created identity plus the single-use ticket that authorizes its first passkey.',
})
export class OnboardingGql {
  @Field(() => PersonGql) person: PersonGql;
  @Field({ description: 'Single-use, expires in 15 minutes. Required to register the first passkey.' })
  registrationTicket: string;
  @Field() expiresAt: string;
}

@ObjectType('TwinSkill')
export class TwinSkillGql {
  @Field() name: string;
  @Field(() => Float, { description: 'Heuristic 0–1 level that grows with each recorded practice event.' })
  level: number;
  @Field(() => Int) evidenceCount: number;
  @Field() lastObserved: string;
}

@ObjectType('TwinGoal')
export class TwinGoalGql {
  @Field() id: string;
  @Field() title: string;
  @Field(() => String, { nullable: true }) description?: string;
  @Field() status: string;
  @Field(() => Float, { description: 'Progress the person reported (0–1). Not estimated by a model.' })
  progress: number;
  @Field() createdAt: string;
}

@ObjectType('TwinStats')
export class TwinStatsGql {
  @Field(() => Int) memories: number;
  @Field(() => Int) documents: number;
  @Field(() => Int) projects: number;
  @Field(() => Int) interactions: number;
  @Field(() => Int) daysActive: number;
}

@ObjectType('Twin')
export class TwinGql {
  @Field() id: string;
  @Field() personId: string;
  @Field(() => Int) version: number;
  @Field(() => [TwinSkillGql]) skills: TwinSkillGql[];
  @Field(() => [TwinGoalGql]) goals: TwinGoalGql[];
  @Field(() => [String]) interests: string[];
  @Field({ description: 'Empty until a narrative has been written; never a placeholder.' })
  narrative: string;
  @Field(() => TwinStatsGql) stats: TwinStatsGql;
  @Field(() => String, { nullable: true }) lastActiveOn?: string | null;
  @Field() updatedAt: string;
}

@ObjectType('MemoryEvent')
export class MemoryEventGql {
  @Field() id: string;
  @Field() personId: string;
  @Field() type: string;
  @Field() summary: string;
  @Field(() => String, { nullable: true }) payload?: string;
  @Field() occurredAt: string;
  @Field() createdAt: string;
}

@ObjectType('Evidence')
export class EvidenceGql {
  @Field({ description: 'memory_event | document | skill | stat | memory' }) type: string;
  @Field(() => String, { nullable: true, description: 'Id of the referenced record, when linkable.' })
  refId?: string | null;
  @Field() label: string;
  @Field() detail: string;
}

@ObjectType('Memory')
export class MemoryGql {
  @Field() id: string;
  @Field() personId: string;
  @Field(() => String, { nullable: true }) sourceEventId?: string | null;
  @Field() kind: string;
  @Field() title: string;
  @Field() content: string;
  @Field(() => [EvidenceGql]) evidence: EvidenceGql[];
  @Field(() => Float, { description: 'Fixed weight by event type (rule-based), not a model output.' })
  importance: number;
  @Field() vectorIndexed: boolean;
  @Field() graphSynced: boolean;
  @Field(() => Float, { nullable: true, description: 'Cosine similarity to the query (search results only).' })
  score?: number | null;
  @Field() createdAt: string;
}

@ObjectType('MemorySearchResult')
export class MemorySearchResultGql {
  @Field({ description: 'ok | unavailable | not_configured' }) status: string;
  @Field(() => String, { nullable: true }) message?: string;
  @Field(() => [MemoryGql]) items: MemoryGql[];
  @Field(() => Int, { description: 'Memories not yet in the vector index (not findable by meaning).' })
  unindexedCount: number;
}

@ObjectType('IndexRetry')
export class IndexRetryGql {
  @Field(() => Int) vectorIndexed: number;
  @Field(() => Int) graphSynced: number;
  @Field(() => Int) remaining: number;
}

@ObjectType('TrustProfile', {
  description: 'Verification facts only. ANIMA does not compute device or behavioural scores.',
})
export class TrustGql {
  @Field() personId: string;
  @Field() faceEnrolled: boolean;
  @Field(() => String, { nullable: true }) faceConsentAt?: string | null;
  @Field(() => Float, {
    nullable: true,
    description: 'Similarity (1 − face distance) of the last successful face sign-in. Not a probability.',
  })
  lastFaceSimilarity?: number | null;
  @Field(() => [String]) boundMethods: string[];
  @Field(() => String, { nullable: true }) lastVerifiedAt?: string | null;
  @Field(() => String, { nullable: true }) lastVerificationMethod?: string | null;
  @Field() updatedAt: string;
}

@ObjectType('Passkey')
export class PasskeyGql {
  @Field() id: string;
  @Field() deviceName: string;
  @Field() createdAt: string;
  @Field(() => String, { nullable: true }) lastUsedAt?: string | null;
}

@ObjectType('Session')
export class SessionGql {
  @Field() id: string;
  @Field() method: string;
  @Field() createdAt: string;
  @Field() expiresAt: string;
  @Field(() => String, { nullable: true }) userAgent?: string | null;
  @Field() current: boolean;
}

@ObjectType('Insight')
export class InsightGql {
  @Field() id: string;
  @Field() personId: string;
  @Field() kind: string;
  @Field() title: string;
  @Field() body: string;
  @Field({ description: 'rule = computed from your data by a fixed rule; generated = written by a language model.' })
  basis: string;
  @Field(() => Float, {
    nullable: true,
    description: 'Always null today: ANIMA has no calibrated confidence model, so none is reported.',
  })
  confidence?: number | null;
  @Field(() => [EvidenceGql]) evidence: EvidenceGql[];
  @Field(() => [String]) observedFacts: string[];
  @Field() createdAt: string;
}

@ObjectType('AgentToolCall')
export class AgentToolCallGql {
  @Field() tool: string;
  @Field() args: string;
  @Field({ description: 'ok | empty | unavailable | error' }) status: string;
  @Field(() => String, { nullable: true }) result?: string;
  @Field(() => String, { nullable: true }) error?: string;
  @Field(() => Int) durationMs: number;
}

@ObjectType('AgentSource')
export class AgentSourceGql {
  @Field(() => Int, { description: 'The [n] the answer uses to cite this source.' }) index: number;
  @Field({ description: 'memory | document | twin | graph | trust' }) kind: string;
  @Field() label: string;
  @Field() snippet: string;
  @Field(() => String, { nullable: true, description: 'Memory id or document id, when linkable.' })
  refId?: string | null;
  @Field(() => Int, { nullable: true }) chunkIndex?: number | null;
  @Field(() => Float, { nullable: true }) score?: number | null;
}

@ObjectType('AgentMessage')
export class AgentMessageGql {
  @Field() id: string;
  @Field() role: string;
  @Field() content: string;
  @Field(() => String, { nullable: true }) agentId?: string;
  @Field(() => String, { nullable: true }) agentName?: string;
  @Field({ description: 'How the agent was chosen: explicit | keyword | default' }) routing: string;
  @Field({ description: 'True when a language model wrote `content`; false for the evidence-only fallback.' })
  generated: boolean;
  @Field(() => String, { nullable: true }) generationNote?: string;
  @Field(() => String, { nullable: true }) model?: string;
  @Field(() => [AgentToolCallGql]) toolCalls: AgentToolCallGql[];
  @Field(() => [AgentSourceGql]) sources: AgentSourceGql[];
  @Field(() => [Int], { description: 'Source indexes the answer actually cites (validated).' })
  citedSourceIndexes: number[];
  @Field(() => [Int], { description: 'Citation markers in the answer that match no source.' })
  invalidCitations: number[];
  @Field() createdAt: string;
}

@ObjectType('AgentDescriptor')
export class AgentDescriptorGql {
  @Field() id: string;
  @Field() name: string;
  @Field() description: string;
  @Field(() => [String]) keywords: string[];
  @Field(() => [String]) tools: string[];
}

@ObjectType('GraphNode')
export class GraphNodeGql {
  @Field() id: string;
  @Field() type: string;
  @Field() label: string;
  @Field(() => String, { nullable: true }) properties?: string;
}

@ObjectType('GraphEdge')
export class GraphEdgeGql {
  @Field() id: string;
  @Field() source: string;
  @Field() target: string;
  @Field() type: string;
  @Field(() => String, { nullable: true }) properties?: string;
}

@ObjectType('GraphSnapshot')
export class GraphSnapshotGql {
  @Field({ description: 'ok | unavailable' }) status: string;
  @Field(() => [GraphNodeGql]) nodes: GraphNodeGql[];
  @Field(() => [GraphEdgeGql]) edges: GraphEdgeGql[];
  @Field() truncated: boolean;
  @Field() generatedAt: string;
}

@ObjectType('Document')
export class DocumentGql {
  @Field() id: string;
  @Field() personId: string;
  @Field() title: string;
  @Field() mimeType: string;
  @Field(() => Int) sizeBytes: number;
  @Field(() => Int) chunkCount: number;
  @Field({ description: 'indexing | indexed | failed' }) status: string;
  @Field(() => String, { nullable: true }) errorMessage?: string | null;
  @Field() createdAt: string;
}

@ObjectType('RagSource')
export class RagSourceGql {
  @Field(() => Int) index: number;
  @Field() documentId: string;
  @Field() label: string;
  @Field(() => Int) chunkIndex: number;
  @Field() snippet: string;
  @Field(() => Float) score: number;
}

@ObjectType('RagResult')
export class RagResultGql {
  @Field({ description: 'ok | no_results | unavailable | not_configured' }) status: string;
  @Field(() => String, { nullable: true, description: 'Null when no answer could be generated.' })
  answer?: string | null;
  @Field() generated: boolean;
  @Field(() => String, { nullable: true }) generationNote?: string;
  @Field(() => [RagSourceGql]) sources: RagSourceGql[];
  @Field(() => [Int]) citedSourceIndexes: number[];
  @Field(() => [Int]) invalidCitations: number[];
  @Field() query: string;
  @Field(() => Int) latencyMs: number;
}

@ObjectType('AuthPayload')
export class AuthPayloadGql {
  @Field() token: string;
  @Field() personId: string;
  @Field() displayName: string;
  @Field() verificationMethod: string;
  @Field(() => Float, {
    nullable: true,
    description: 'Face sign-in only: similarity (1 − face distance). Not a probability of identity.',
  })
  faceMatchSimilarity?: number;
  @Field(() => Boolean, { nullable: true }) livenessPassed?: boolean;
}

@ObjectType('PasskeyChallenge')
export class PasskeyChallengeGql {
  @Field({ description: 'Echo this back when completing the ceremony.' }) ceremonyId: string;
  @Field({ description: 'WebAuthn options JSON.' }) options: string;
}

@ObjectType('DeletionStep')
export class DeletionStepGql {
  @Field() store: string;
  @Field({ description: 'deleted | skipped | failed' }) status: string;
  @Field(() => String, { nullable: true }) detail?: string;
}

@ObjectType('DeletionReport')
export class DeletionReportGql {
  @Field() deleted: boolean;
  @Field(() => [DeletionStepGql]) steps: DeletionStepGql[];
}

@ObjectType('DependencyStatus')
export class DependencyStatusGql {
  @Field() name: string;
  @Field({ description: 'ok | degraded | unavailable | not_configured' }) status: string;
  @Field() detail: string;
}
