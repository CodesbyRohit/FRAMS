import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver } from 'neo4j-driver';

import {
  GraphEventInput,
  GraphStatement,
  mapEdge,
  mapNode,
  RawEdgeRow,
  RawNodeRow,
  statementsForEvent,
} from './graph-mapping';

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

export type GraphStatus = 'ok' | 'unavailable';

export interface GraphSnapshotDto {
  status: GraphStatus;
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  /** True when more owned nodes exist than were returned. */
  truncated: boolean;
  generatedAt: string;
}

const PROBE_TTL_MS = 15_000;

/**
 * Knowledge graph projection over Neo4j. Memory events are folded into a
 * per-person graph (see graph-mapping.ts for the tenancy rule).
 *
 * Neo4j is availability-optional: when unreachable, writes return `false`
 * (the memory row records that graph sync is pending and can be replayed with
 * `rebuildFor`) and reads report `status: 'unavailable'` instead of an empty
 * graph that would look like "no data".
 */
@Injectable()
export class KnowledgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeService.name);
  private driver?: Driver;
  private lastProbe: { at: number; ok: boolean } = { at: 0, ok: false };

  constructor(private readonly cfg: ConfigService) {}

  onModuleInit(): void {
    try {
      this.driver = neo4j.driver(
        this.cfg.get('NEO4J_URI', 'bolt://localhost:7687'),
        neo4j.auth.basic(
          this.cfg.get('NEO4J_USER', 'neo4j'),
          this.cfg.get('NEO4J_PASSWORD', 'anima-neo4j'),
        ),
        { maxConnectionLifetime: 3 * 60 * 60 * 1000, connectionAcquisitionTimeout: 5_000 },
      );
    } catch (err) {
      this.logger.warn(`Neo4j disabled: ${(err as Error).message}`);
    }
    void this.isAvailable(true).then((ok) => {
      if (ok) {
        void this.ensureIndexes();
      } else {
        this.logger.warn('Neo4j is not reachable — the knowledge graph is unavailable.');
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver?.close();
  }

  /** Real connectivity check, cached briefly so hot paths don't probe every call. */
  async isAvailable(force = false): Promise<boolean> {
    if (!this.driver) return false;
    if (!force && Date.now() - this.lastProbe.at < PROBE_TTL_MS) {
      return this.lastProbe.ok;
    }
    let ok = false;
    try {
      await this.driver.verifyConnectivity();
      ok = true;
    } catch {
      ok = false;
    }
    this.lastProbe = { at: Date.now(), ok };
    return ok;
  }

  private markDown(err: unknown): void {
    this.lastProbe = { at: Date.now(), ok: false };
    this.logger.warn(`Neo4j operation failed: ${(err as Error)?.message ?? err}`);
  }

  private async ensureIndexes(): Promise<void> {
    const labels = ['Skill', 'Project', 'Goal', 'Memory', 'Document', 'Contact', 'Idea', 'Meeting'];
    const session = this.driver!.session();
    try {
      await session.run('CREATE INDEX person_id IF NOT EXISTS FOR (p:Person) ON (p.id)');
      for (const label of labels) {
        await session.run(
          `CREATE INDEX ${label.toLowerCase()}_owner IF NOT EXISTS FOR (n:${label}) ON (n.ownerId)`,
        );
      }
    } catch (err) {
      this.logger.warn(`Could not create graph indexes: ${(err as Error).message}`);
    } finally {
      await session.close();
    }
  }

  /** Run statements in one write transaction. Returns false if the graph is unavailable. */
  private async write(statements: GraphStatement[]): Promise<boolean> {
    if (statements.length === 0) return true;
    if (!(await this.isAvailable())) return false;
    const session = this.driver!.session();
    try {
      await session.executeWrite(async (tx) => {
        for (const s of statements) {
          await tx.run(s.cypher, s.params);
        }
      });
      return true;
    } catch (err) {
      this.markDown(err);
      return false;
    } finally {
      await session.close();
    }
  }

  /** Create or refresh the person root node. */
  syncPerson(personId: string, displayName: string): Promise<boolean> {
    return this.write([
      {
        cypher: `MERGE (p:Person {id: $person}) ON CREATE SET p.createdAt = datetime() SET p.label = $name`,
        params: { person: personId, name: displayName },
      },
    ]);
  }

  /** Fold one memory event into the person's graph. */
  syncEvent(personId: string, event: GraphEventInput, personLabel?: string): Promise<boolean> {
    return this.write(statementsForEvent(personId, event, personLabel));
  }

  /** Remove a document node the person owns. */
  removeDocument(personId: string, documentId: string): Promise<boolean> {
    return this.write([
      {
        cypher: `MATCH (d:Document {ownerId: $person, documentId: $doc}) DETACH DELETE d`,
        params: { person: personId, doc: documentId },
      },
    ]);
  }

  /** Erase the person's entire graph (root + every owned node). */
  async deleteAllFor(personId: string): Promise<boolean> {
    if (!(await this.isAvailable(true))) return false;
    return this.write([
      {
        cypher: `MATCH (n) WHERE n.ownerId = $person OR (n:Person AND n.id = $person) DETACH DELETE n`,
        params: { person: personId },
      },
    ]);
  }

  /** The person's own graph: their root node, owned nodes and edges among them. */
  async getGraph(personId: string, limit = 150): Promise<GraphSnapshotDto> {
    const generatedAt = new Date().toISOString();
    const empty = (status: GraphStatus): GraphSnapshotDto => ({
      status,
      nodes: [],
      edges: [],
      truncated: false,
      generatedAt,
    });
    if (!(await this.isAvailable())) {
      return empty('unavailable');
    }
    const cap = Math.max(1, Math.min(500, Math.floor(limit)));
    const session = this.driver!.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const nodeResult = await session.run(
        `MATCH (n)
         WHERE (n:Person AND n.id = $person) OR n.ownerId = $person
         RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS props,
                CASE WHEN n:Person THEN 0 ELSE 1 END AS rank
         ORDER BY rank, coalesce(n.updatedAt, n.createdAt) DESC
         LIMIT $limit`,
        { person: personId, limit: neo4j.int(cap + 1) },
      );
      const rows: RawNodeRow[] = nodeResult.records.map((r) => ({
        id: r.get('id') as string,
        labels: r.get('labels') as string[],
        props: r.get('props') as Record<string, unknown>,
      }));
      const truncated = rows.length > cap;
      const nodes = rows.slice(0, cap).map(mapNode);
      const ids = nodes.map((n) => n.id);

      const edgeResult = await session.run(
        `MATCH (a)-[r]->(b)
         WHERE elementId(a) IN $ids AND elementId(b) IN $ids
         RETURN elementId(r) AS id, elementId(a) AS source, elementId(b) AS target,
                type(r) AS type, properties(r) AS props`,
        { ids },
      );
      const edges = edgeResult.records.map((r) =>
        mapEdge({
          id: r.get('id') as string,
          source: r.get('source') as string,
          target: r.get('target') as string,
          type: r.get('type') as string,
          props: r.get('props') as Record<string, unknown>,
        } satisfies RawEdgeRow),
      );
      return { status: 'ok', nodes, edges, truncated, generatedAt };
    } catch (err) {
      this.markDown(err);
      return empty('unavailable');
    } finally {
      await session.close();
    }
  }
}
