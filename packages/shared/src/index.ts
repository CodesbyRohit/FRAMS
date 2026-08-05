/**
 * ANIMA — shared domain types.
 *
 * These types are the single source of truth for the platform's core concepts:
 * Identity, Digital Twin, Memory, Trust, Knowledge Graph, Insights and Agents.
 * Consumed by both the NestJS API and the Next.js web app (via transpilePackages).
 */

// ─── Identity ───────────────────────────────────────────────────────────────

export type VerificationMethod = 'passkey' | 'face' | 'voice' | 'device' | 'password';

export interface Person {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  /** Short personal bio / context the user chooses to share with their twin. */
  bio?: string | null;
  /** Occupations / roles in the world (engineer, researcher, student...). */
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Digital Twin ───────────────────────────────────────────────────────────

export interface TwinSkill {
  name: string;
  /** 0-1 normalized proficiency derived from evidence, not self-report. */
  level: number;
  /** Number of evidence events backing this skill. */
  evidenceCount: number;
  /** ISO date of most recent evidence. */
  lastObserved: string;
}

export interface TwinGoal {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'in_progress' | 'achieved' | 'paused' | 'abandoned';
  /** 0-1 progress, estimated by the planner agent. */
  progress: number;
  createdAt: string;
}

export interface TwinState {
  id: string;
  personId: string;
  /** Version counter — increments on every twin mutation. */
  version: number;
  skills: TwinSkill[];
  goals: TwinGoal[];
  interests: string[];
  /** Short AI-written summary of who this person is becoming. */
  narrative: string;
  /** Aggregate counts of ingested evidence. */
  stats: {
    memories: number;
    documents: number;
    projects: number;
    interactions: number;
    daysActive: number;
  };
  updatedAt: string;
}

// ─── Memory ─────────────────────────────────────────────────────────────────

export type MemoryEventType =
  | 'IDENTITY_CREATED'
  | 'VERIFICATION_SUCCEEDED'
  | 'DOCUMENT_ADDED'
  | 'NOTE_CREATED'
  | 'PROJECT_UPDATE'
  | 'SKILL_LEARNED'
  | 'GOAL_SET'
  | 'GOAL_UPDATED'
  | 'MEETING_ATTENDED'
  | 'CODE_COMMITTED'
  | 'CHAT_CREATED'
  | 'IDEA_CREATED'
  | 'LINK_SHARED'
  | 'FEEDBACK_GIVEN';

/** One raw interaction recorded by any service. */
export interface MemoryEventInput {
  personId: string;
  type: MemoryEventType;
  /** Human-readable one-liner, e.g. "Shipped realtime sync for the Atlas project". */
  summary: string;
  /** Optional structured payload (projectId, skill names, tags...). */
  payload?: Record<string, unknown>;
  /** When the interaction actually happened (defaults to now). */
  occurredAt?: string;
}

export interface MemoryEvent extends MemoryEventInput {
  id: string;
  occurredAt: string;
  createdAt: string;
}

/** A consolidated, embedded memory unit derived from events. */
export interface Memory {
  id: string;
  personId: string;
  /** e.g. "SHIPPED_PROJECT", "LEARNED_SKILL", "MET_PERSON", "CREATED_IDEA". */
  kind: string;
  title: string;
  content: string;
  /** Embedding vector in Qdrant. */
  vector: number[];
  /** Evidence references used for explainability. */
  evidence: Array<{ type: string; id: string; label: string }>;
  /** Graph entities this memory touches. */
  entities: Array<{ label: string; name: string }>;
  importance: number;
  createdAt: string;
}

// ─── Trust ──────────────────────────────────────────────────────────────────

export interface TrustProfile {
  personId: string;
  /** 0-1 composite identity confidence. */
  identityScore: number;
  /** 0-1 device posture score. */
  deviceScore: number;
  /** 0-1 behavioral consistency score. */
  behavioralScore: number;
  /** Methods bound to this identity. */
  boundMethods: VerificationMethod[];
  lastVerifiedAt?: string;
  lastVerificationMethod?: VerificationMethod;
  updatedAt: string;
}

export interface VerificationResult {
  verified: boolean;
  method: VerificationMethod;
  /** 0-1 match confidence (face: embedding cosine similarity). */
  confidence: number;
  /** Machine-readable reason for audit / explainability. */
  reason: string;
  liveness?: { passed: boolean; method: string };
}

// ─── Knowledge graph ────────────────────────────────────────────────────────

export type GraphNodeType =
  | 'Person'
  | 'Twin'
  | 'Skill'
  | 'Project'
  | 'Goal'
  | 'Memory'
  | 'Document'
  | 'Meeting'
  | 'Idea'
  | 'Organization';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  /** Extra properties surfaced for the visualization (skill level, progress...). */
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** ISO timestamp of generation — used for caching on the client. */
  generatedAt: string;
}

// ─── RAG / documents ────────────────────────────────────────────────────────

export interface DocumentRecord {
  id: string;
  personId: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  status: 'indexed' | 'indexing' | 'failed';
  createdAt: string;
}

export interface SearchHit {
  memoryId?: string;
  documentId?: string;
  chunkId?: string;
  content: string;
  score: number;
  sourceLabel: string;
}

export interface RagResult {
  answer: string;
  /** Citations shown to the user — the explainability surface. */
  sources: Array<{ label: string; snippet: string; score: number }>;
  query: string;
  latencyMs: number;
}

// ─── Insights & predictions ─────────────────────────────────────────────────

export interface Insight {
  id: string;
  personId: string;
  kind: 'prediction' | 'recommendation' | 'summary' | 'alert';
  title: string;
  body: string;
  /** 0-1 model confidence. */
  confidence: number;
  /** Evidence that backs this insight (explainable AI). */
  evidence: Array<{ label: string; detail: string }>;
  /** What the platform observed, vs. what it inferred. */
  observedFacts: string[];
  createdAt: string;
}

// ─── Agents / copilot ───────────────────────────────────────────────────────

export type AgentId =
  | 'identity'
  | 'memory'
  | 'research'
  | 'learning'
  | 'productivity'
  | 'creativity'
  | 'networking'
  | 'knowledge'
  | 'planner'
  | 'security';

export interface AgentDescriptor {
  id: AgentId;
  name: string;
  description: string;
  /** Capabilities the router uses for intent matching. */
  keywords: string[];
}

export interface AgentToolCall {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Which agent handled this turn (for transparency). */
  agentId?: AgentId;
  /** Tool calls the agent made — shown in the UI as a "chain of thought". */
  toolCalls: AgentToolCall[];
  /** Sources cited (explainable AI). */
  sources: Array<{ label: string; snippet: string }>;
  createdAt: string;
}

// ─── API envelope ───────────────────────────────────────────────────────────

export interface PageInfo {
  hasNextPage: boolean;
  endCursor?: string;
}

export interface Paginated<T> {
  items: T[];
  pageInfo: PageInfo;
}
