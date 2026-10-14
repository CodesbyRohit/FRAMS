import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { newId } from '../common/ids';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { TwinService } from '../twin/twin.service';
import { PersonEntity } from './person.entity';

export interface OnboardInput {
  email: string;
  displayName: string;
  roles?: string[];
}

@Injectable()
export class IdentityService {
  constructor(
    @InjectRepository(PersonEntity)
    private readonly repo: Repository<PersonEntity>,
    private readonly twins: TwinService,
    private readonly knowledge: KnowledgeService,
  ) {}

  /** Create a person and their empty twin atomically. Input must already be validated. */
  async create(input: OnboardInput): Promise<PersonEntity> {
    const person = await this.repo.manager.transaction(async (em) => {
      const created = em.getRepository(PersonEntity).create({
        id: newId('person'),
        email: input.email,
        displayName: input.displayName,
        roles: input.roles?.length ? input.roles : ['member'],
      });
      await em.getRepository(PersonEntity).save(created);
      // Birth of the Digital Twin, in the same transaction.
      await this.twins.createTwin(created.id, em);
      return created;
    });
    // Graph root is availability-optional; the indexer creates it lazily too.
    void this.knowledge.syncPerson(person.id, person.displayName);
    return person;
  }

  async findById(id: string): Promise<PersonEntity> {
    const person = await this.repo.findOne({ where: { id } });
    if (!person) {
      throw new NotFoundException('Identity not found.');
    }
    return person;
  }

  async findByEmail(email: string): Promise<PersonEntity | null> {
    return this.repo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  /** Delete an identity that never completed registration (no credentials, no data). */
  async removeAbandoned(personId: string): Promise<void> {
    await this.repo.manager.transaction(async (em) => {
      await this.twins.deleteFor(personId, em);
      await em.getRepository(PersonEntity).delete({ id: personId });
    });
  }

  async updateProfile(
    personId: string,
    patch: { displayName?: string; bio?: string; roles?: string[] },
  ): Promise<PersonEntity> {
    const person = await this.findById(personId);
    if (patch.displayName !== undefined) person.displayName = patch.displayName;
    if (patch.bio !== undefined) person.bio = patch.bio || null;
    if (patch.roles !== undefined) person.roles = patch.roles;
    const saved = await this.repo.save(person);
    if (patch.displayName !== undefined) {
      void this.knowledge.syncPerson(saved.id, saved.displayName);
    }
    return saved;
  }

  async deletePerson(personId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(PersonEntity).delete({ id: personId });
  }
}
