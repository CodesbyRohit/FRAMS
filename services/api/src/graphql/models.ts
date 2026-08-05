import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

/**
 * Centralized code-first GraphQL schema. Every resolver maps domain entities
 * onto these object types, keeping the wire contract stable and documented.
 */

@ObjectType('Person')
export class PersonGql {
  @Field() id: string;
  @Field() email: string;
  @Field() displayName: string;
  @Field({ nullable: true }) avatarUrl?: string | null;
  @Field({ nullable: true }) bio?: string | null;
  @Field(() => [String]) roles: string[];
  @Field() createdAt: string;
  @Field() updatedAt: string;
}

@ObjectType('TwinSkill')
export class TwinSkillGql {
  @Field() name: string;
  @Field(() => Float) level: number;
  @Field(() => Int) evidenceCount: number;
  @Field() lastObserved: string;
}

@ObjectType('TwinGoal')
export class TwinGoalGql {
  @Field() id: string;
  @Field() title: string;
  @Field({ nullable: true }) description?: string;
  @Field() status: string;
  @Field(() => Float) progress: number;
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
  @Field() narrative: string;
  @Field(() => TwinStatsGql) stats: TwinStatsGql;
  @Field() updatedAt: string;
}

@ObjectType('MemoryEvent')
export class MemoryEventGql {
  @Field() id: string;
  @Field() personId: string;
  @Field() type: string;
  @Field() summary: string;
  @Field({ nullable: true }) payload?: string;
  @Field() occurredAt: string;
  @Field() createdAt: string;
}

@ObjectType('Evidence')
export class EvidenceGql {
  @Field() label: string;
  @Field() detail: string;
}

@ObjectType('Memory')
export class MemoryGql {
  @Field() id: string;
  @Field() personId: string;
  @Field() kind: string;
  @Field() title: string;
  @Field() content: string;
  @Field(() => [EvidenceGql]) evidence: EvidenceGql[];
  @Field(() => Float) importance: number;
  @Field() createdAt: string;
}

@ObjectType('TrustProfile')
export class TrustGql {
  @Field() personId: string;
  @Field(() => Float) identityScore: number;
  @Field(() => Float) deviceScore: number;
  @Field(() => Float) behavioralScore: number;
  @Field(() => [String]) boundMethods: string[];
  @Field({ nullable: true }) lastVerifiedAt?: string;
  @Field({ nullable: true }) lastVerificationMethod?: string;
  @Field() updatedAt: string;
}

@ObjectType('Insight')
export class InsightGql {
  @Field() id: string;
  @Field() personId: string;
  @Field() kind: string;
  @Field() title: string;
  @Field() body: string;
  @Field(() => Float) confidence: number;
  @Field(() => [EvidenceGql]) evidence: EvidenceGql[];
  @Field(() => [String]) observedFacts: string[];
  @Field() createdAt: string;
}

@ObjectType('AgentToolCall')
export class AgentToolCallGql {
  @Field() tool: string;
  @Field() args: string;
  @Field({ nullable: true }) result?: string;
  @Field({ nullable: true }) error?: string;
}

@ObjectType('AgentSource')
export class AgentSourceGql {
  @Field() label: string;
  @Field() snippet: string;
}

@ObjectType('AgentMessage')
export class AgentMessageGql {
  @Field() id: string;
  @Field() role: string;
  @Field() content: string;
  @Field({ nullable: true }) agentId?: string;
  @Field(() => [AgentToolCallGql]) toolCalls: AgentToolCallGql[];
  @Field(() => [AgentSourceGql]) sources: AgentSourceGql[];
  @Field() createdAt: string;
}

@ObjectType('AgentDescriptor')
export class AgentDescriptorGql {
  @Field() id: string;
  @Field() name: string;
  @Field() description: string;
  @Field(() => [String]) keywords: string[];
}

@ObjectType('GraphNode')
export class GraphNodeGql {
  @Field() id: string;
  @Field() type: string;
  @Field() label: string;
  @Field({ nullable: true }) properties?: string;
}

@ObjectType('GraphEdge')
export class GraphEdgeGql {
  @Field() id: string;
  @Field() source: string;
  @Field() target: string;
  @Field() type: string;
  @Field({ nullable: true }) properties?: string;
}

@ObjectType('GraphSnapshot')
export class GraphSnapshotGql {
  @Field(() => [GraphNodeGql]) nodes: GraphNodeGql[];
  @Field(() => [GraphEdgeGql]) edges: GraphEdgeGql[];
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
  @Field() status: string;
  @Field() createdAt: string;
}

@ObjectType('RagSource')
export class RagSourceGql {
  @Field() label: string;
  @Field() snippet: string;
  @Field(() => Float) score: number;
}

@ObjectType('RagResult')
export class RagResultGql {
  @Field() answer: string;
  @Field(() => [RagSourceGql]) sources: RagSourceGql[];
  @Field() query: string;
  @Field(() => Int) latencyMs: number;
}

@ObjectType('AuthPayload')
export class AuthPayloadGql {
  @Field() token: string;
  @Field() personId: string;
  @Field() displayName: string;
  @Field({ nullable: true }) verificationConfidence?: number;
  @Field({ nullable: true }) verificationMethod?: string;
}

@ObjectType('VerificationChallenge')
export class VerificationChallengeGql {
  @Field() challengeId: string;
  @Field() options: string;
}
