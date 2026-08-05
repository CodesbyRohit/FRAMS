import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver, Session } from 'neo4j-driver';

export interface GraphNodeDto {
  id: string;
  type: string;
  label: string;
  properties?: Record<string, unknown>;
}

export interface GraphEdgeDto {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface GraphSnapshotDto {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  generatedAt: string;
}

/**
 * Knowledge graph projection over Neo4j. Every memory event is folded into
 * the graph: people, skills, projects, goals, documents, ideas and meetings
 * become nodes; the relationships between them become edges.
 *
 * The graph is an availability-optional dependency: if Neo4j is unreachable
 * the API still runs and the twin keeps learning — the graph catches up on
 * reconnection via the event stream.
 */
@Injectable()
export class KnowledgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeService.name);
  private driver?: Driver;
  private available = false;

  constructor(private readonly cfg: ConfigService) {}

  onModuleInit(): void {
    try {
      const uri = this.cfg.get('NEO4J_URI', 'bolt://localhost:7687');
      this.driver = neo4j.driver(
        uri,
        neo4j.auth.basic(
          this.cfg.get('NEO4J_USER', 'neo4j'),
          this.cfg.get('NEO4J_PASSWORD', 'anima-neo4j'),
        ),
        { maxConnectionLifetime: 3 * 60 * 60 * 1000 },
      );
      this.available = true;
    } catch (err) {
      this.logger.warn(`Neo4j disabled: ${(err as Error).message}`);
      this.available = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver?.close();
  }

  isAvailable(): boolean {
    return this.available && !!this.driver;
  }

  private session(): Session {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized.');
    }
    return this.driver.session();
  }

  private async run(query: string, params: Record<string, unknown>): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }
    try {
      const session = this.session();
      try {
        await session.run(query, params);
      } finally {
        await session.close();
      }
    } catch (err) {
      this.logger.warn(`Neo4j query failed (${(err as Error).message}) — graph sync deferred.`);
    }
  }

  /** Create or refresh the person root node. */
  async syncPerson(personId: string, displayName: string): Promise<void> {
    await this.run(
      `MERGE (p:Person {id: $id}) ON CREATE SET p.label = $name, p.createdAt = datetime()
       ON MATCH SET p.label = $name`,
      { id: personId, name: displayName },
    );
  }

  /** Fold one memory event into the graph based on its payload shape. */
  async syncEvent(personId: string, event: {
    type: string;
    summary: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }
    const p = event.payload ?? {};
    const label = event.summary.slice(0, 120);

    // Project node + WORKED_ON edge.
    if (typeof p.project === 'string' || typeof p.projectTitle === 'string') {
      const name = (p.project ?? p.projectTitle) as string;
      await this.run(
        `MATCH (p:Person {id: $person})
         MERGE (proj:Project {name: $name})
         MERGE (p)-[:WORKED_ON {at: datetime()}]->(proj)`,
        { person: personId, name },
      );
    }

    // Skill nodes + HAS_SKILL edges (level from payload or default 0.5).
    const skills = Array.isArray(p.skills) ? (p.skills as string[]) : [];
    for (const skill of skills) {
      await this.run(
        `MATCH (p:Person {id: $person})
         MERGE (s:Skill {name: $skill})
         MERGE (p)-[r:HAS_SKILL]->(s)
         SET r.level = COALESCE(r.level, 0.25) + 0.05, r.lastObserved = datetime()`,
        { person: personId, skill },
      );
    }

    // Goal node + SET edge.
    if (typeof p.goal === 'string') {
      await this.run(
        `MATCH (p:Person {id: $person})
         MERGE (g:Goal {title: $title})
         MERGE (p)-[:SET]->(g)`,
        { person: personId, title: p.goal },
      );
    }

    // Document node + AUTHORED edge.
    if (typeof p.documentTitle === 'string' && typeof p.documentId === 'string') {
      await this.run(
        `MATCH (p:Person {id: $person})
         MERGE (d:Document {id: $docId})
         ON CREATE SET d.title = $title
         MERGE (p)-[:AUTHORED]->(d)`,
        { person: personId, docId: p.documentId, title: p.documentTitle },
      );
    }

    // Collaborator relationship (networking events).
    if (typeof p.collaboratorName === 'string' && p.collaboratorName !== '') {
      await this.run(
        `MATCH (p:Person {id: $person})
         MERGE (c:Person {name: $collab})
         MERGE (p)-[:KNOWS]->(c)`,
        { person: personId, collab: p.collaboratorName },
      );
    }

    // Idea node + CREATED edge.
    if (typeof p.idea === 'string') {
      await this.run(
        `MATCH (p:Person {id: $person})
         MERGE (i:Idea {title: $idea})
         MERGE (p)-[:CREATED]->(i)`,
        { person: personId, idea: p.idea },
      );
    }

    // Meeting node + PARTICIPATED_IN edge.
    if (typeof p.topic === 'string') {
      await this.run(
        `MATCH (p:Person {id: $person})
         MERGE (m:Meeting {title: $topic})
         MERGE (p)-[:PARTICIPATED_IN]->(m)`,
        { person: personId, topic: p.topic },
      );
    }

    // Memory node linking this event to the person + its entities.
    if (typeof p.memoryId === 'string') {
      await this.run(
        `MATCH (p:Person {id: $person})
         MERGE (m:Memory {id: $memoryId})
         ON CREATE SET m.title = $label
         MERGE (p)-[:HAS_MEMORY]->(m)`,
        { person: personId, memoryId: p.memoryId, label },
      );
    }
  }

  /**
   * Fetch a 2-hop neighborhood around the person for the interactive galaxy.
   * Returns an empty snapshot when the graph is unavailable so the UI can
   * show its fallback state honestly.
   */
  async getGraph(personId: string, limit = 120): Promise<GraphSnapshotDto> {
    if (!this.isAvailable()) {
      return { nodes: [], edges: [], generatedAt: new Date().toISOString() };
    }
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (p:Person {id: $person})
         OPTIONAL MATCH (p)-[r1]-(a)
         OPTIONAL MATCH (a)-[r2]-(b) WHERE b <> p
         RETURN p, collect(DISTINCT a) AS aNodes,
                collect(DISTINCT b) AS bNodes,
                collect(DISTINCT r1) AS r1Edges,
                collect(DISTINCT r2) AS r2Edges
         LIMIT $limit`,
        { person: personId, limit: neo4j.int(limit) },
      );

      const nodes = new Map<string, GraphNodeDto>();
      const edges = new Map<string, GraphEdgeDto>();
      const record = result.records[0];

      const addNode = (node: any, fallbackType = 'Entity') => {
        if (!node) return;
        const id = (node.properties as any)?.id ?? node.identity.toString();
        const type = (node.labels?.[0] as string) ?? fallbackType;
        const label = (node.properties as any)?.label ?? (node.properties as any)?.name ?? (node.properties as any)?.title ?? id;
        nodes.set(id, { id, type, label: String(label) });
      };

      record?.get('aNodes').forEach((n: any) => addNode(n));
      record?.get('bNodes').forEach((n: any) => addNode(n));
      // The person root itself.
      const person = record?.get('p');
      if (person) {
        addNode(person, 'Person');
      }

      const addEdge = (rel: any, relType: string) => {
        if (!rel) return;
        const id = rel.identity.toString();
        const source = (rel.start ?? rel.startNodeElementId ?? '').toString();
        const target = (rel.end ?? rel.endNodeElementId ?? '').toString();
        edges.set(id, { id, source, target, type: relType ?? rel.type, properties: rel.properties });
      };
      record?.get('r1Edges').forEach((r: any) => addEdge(r, r?.type));
      record?.get('r2Edges').forEach((r: any) => addEdge(r, r?.type));

      return {
        nodes: [...nodes.values()],
        edges: [...edges.values()],
        generatedAt: new Date().toISOString(),
      };
    } finally {
      await session.close();
    }
  }
}
