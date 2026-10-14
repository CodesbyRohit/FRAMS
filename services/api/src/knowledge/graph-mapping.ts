/**
 * Pure helpers that turn a memory event into graph statements and Neo4j rows
 * into API DTOs. Kept free of the driver so they are unit-testable.
 *
 * Tenancy rule: apart from the person's own root node, every node carries an
 * `ownerId` and is merged on (ownerId, key). Two people who both know
 * "TypeScript" get two different Skill nodes, so no traversal can cross from
 * one person's graph into another's.
 */

export interface GraphStatement {
  cypher: string;
  params: Record<string, unknown>;
}

export interface GraphEventInput {
  type: string;
  summary: string;
  payload?: Record<string, unknown>;
}

const str = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => str(s, 60)).filter((s): s is string => !!s).slice(0, 20) : [];

const ROOT = `MERGE (p:Person {id: $person}) ON CREATE SET p.label = coalesce($personLabel, 'You'), p.createdAt = datetime()`;

/**
 * Owned-node upsert + relationship from the person root. `nodeSet` may only
 * reference `n`; `relSet` runs after the relationship is bound and may use `r`.
 */
function owned(label: string, keyProp: string, rel: string, nodeSet = '', relSet = ''): string {
  return `${ROOT}
     MERGE (n:${label} {ownerId: $person, ${keyProp}: $key})
       ON CREATE SET n.createdAt = datetime()
     SET n.updatedAt = datetime() ${nodeSet}
     MERGE (p)-[r:${rel}]->(n)
     SET r.lastObserved = datetime() ${relSet}`;
}

export function statementsForEvent(
  personId: string,
  event: GraphEventInput,
  personLabel?: string,
): GraphStatement[] {
  const p = event.payload ?? {};
  const base = { person: personId, personLabel: personLabel ?? null };
  const out: GraphStatement[] = [];

  const project = str(p.project, 120) ?? str(p.projectTitle, 120);
  if (project) {
    out.push({ cypher: owned('Project', 'name', 'WORKED_ON'), params: { ...base, key: project } });
  }
  for (const skill of strList(p.skills)) {
    out.push({
      cypher: owned('Skill', 'name', 'HAS_SKILL', '', ', r.evidence = coalesce(r.evidence, 0) + 1'),
      params: { ...base, key: skill },
    });
  }
  const goal = str(p.goal, 200);
  if (goal) {
    out.push({ cypher: owned('Goal', 'title', 'SET_GOAL'), params: { ...base, key: goal } });
  }
  const docId = str(p.documentId, 80);
  const docTitle = str(p.documentTitle, 200);
  if (docId && docTitle) {
    out.push({
      cypher: owned('Document', 'documentId', 'AUTHORED', ', n.title = $title'),
      params: { ...base, key: docId, title: docTitle },
    });
  }
  const collaborator = str(p.collaboratorName, 120);
  if (collaborator) {
    // A contact is a name the person recorded, not a verified ANIMA identity.
    out.push({ cypher: owned('Contact', 'name', 'KNOWS'), params: { ...base, key: collaborator } });
  }
  const idea = str(p.idea, 200);
  if (idea) {
    out.push({ cypher: owned('Idea', 'title', 'CREATED'), params: { ...base, key: idea } });
  }
  const topic = str(p.topic, 200);
  if (topic) {
    out.push({ cypher: owned('Meeting', 'title', 'PARTICIPATED_IN'), params: { ...base, key: topic } });
  }

  const memoryId = str(p.memoryId, 80);
  if (memoryId) {
    out.push({
      cypher: owned('Memory', 'memoryId', 'HAS_MEMORY', ', n.title = $title'),
      params: { ...base, key: memoryId, title: event.summary.slice(0, 120) },
    });
    // Link the memory to the entities it mentions (all owned by the same person).
    const links: Array<[string, string, string | undefined]> = [
      ['Project', 'name', project],
      ['Goal', 'title', goal],
      ['Idea', 'title', idea],
      ['Meeting', 'title', topic],
      ['Contact', 'name', collaborator],
    ];
    for (const skill of strList(p.skills)) links.push(['Skill', 'name', skill]);
    for (const [label, keyProp, key] of links) {
      if (!key) continue;
      out.push({
        cypher: `MATCH (m:Memory {ownerId: $person, memoryId: $memoryId})
                 MATCH (e:${label} {ownerId: $person, ${keyProp}: $key})
                 MERGE (m)-[:MENTIONS]->(e)`,
        params: { person: personId, memoryId, key },
      });
    }
  }
  return out;
}

/** Labels the galaxy understands; anything else is reported as 'Entity'. */
export const NODE_TYPES = ['Person', 'Skill', 'Project', 'Goal', 'Memory', 'Document', 'Contact', 'Idea', 'Meeting'];

export interface RawNodeRow {
  id: string;
  labels: string[];
  props: Record<string, unknown>;
}

export interface RawEdgeRow {
  id: string;
  source: string;
  target: string;
  type: string;
  props: Record<string, unknown>;
}

export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') {
    const v = value as { toNumber?: () => number; toString: () => string; constructor?: { name?: string } };
    // neo4j Integer
    if (typeof v.toNumber === 'function' && 'low' in (value as object) && 'high' in (value as object)) {
      return v.toNumber();
    }
    // neo4j temporal types (DateTime, Date, ...) print as ISO strings
    if ('year' in (value as object) && 'month' in (value as object)) {
      return v.toString();
    }
    if (Array.isArray(value)) return value.map(toPlain);
    return Object.fromEntries(Object.entries(value as object).map(([k, x]) => [k, toPlain(x)]));
  }
  return value;
}

export function mapNode(row: RawNodeRow): {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
} {
  const props = toPlain(row.props) as Record<string, unknown>;
  const type = row.labels.find((l) => NODE_TYPES.includes(l)) ?? 'Entity';
  const label = String(props.label ?? props.name ?? props.title ?? type);
  // Never ship tenancy bookkeeping to the client.
  const { ownerId: _owner, ...visible } = props;
  void _owner;
  return { id: row.id, type, label, properties: visible };
}

export function mapEdge(row: RawEdgeRow) {
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    type: row.type,
    properties: toPlain(row.props) as Record<string, unknown>,
  };
}
