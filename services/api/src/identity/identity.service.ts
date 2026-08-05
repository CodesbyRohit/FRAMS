import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { newId } from '../common/ids';
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
  ) {}

  async onboard(input: OnboardInput): Promise<PersonEntity> {
    const email = input.email.trim().toLowerCase();
    const exists = await this.repo.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException('An identity with this email already exists.');
    }

    const person = this.repo.create({
      id: newId('person'),
      email,
      displayName: input.displayName.trim(),
      roles: input.roles?.length ? input.roles : ['member'],
    });
    await this.repo.save(person);
    // Birth of the Digital Twin.
    await this.twins.createTwin(person.id);
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

  async updateProfile(
    personId: string,
    patch: { displayName?: string; bio?: string; roles?: string[]; avatarUrl?: string },
  ): Promise<PersonEntity> {
    const person = await this.findById(personId);
    if (patch.displayName !== undefined) person.displayName = patch.displayName.trim();
    if (patch.bio !== undefined) person.bio = patch.bio;
    if (patch.roles !== undefined) person.roles = patch.roles;
    if (patch.avatarUrl !== undefined) person.avatarUrl = patch.avatarUrl;
    return this.repo.save(person);
  }
}
