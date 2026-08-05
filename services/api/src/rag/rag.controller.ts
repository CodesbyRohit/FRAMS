import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { RagService } from './rag.service';

/**
 * Document upload over REST (multipart) — GraphQL stays for queries. The
 * global JWT guard protects this endpoint; the twin hears about the new
 * document through a memory event.
 */
@Controller('rag')
export class RagController {
  constructor(private readonly rag: RagService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async upload(
    @CurrentPerson() person: AuthenticatedPerson,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Provide a file field in multipart/form-data.');
    }
    const doc = await this.rag.uploadDocument(person.personId, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
    return {
      id: doc.id,
      title: doc.title,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      chunkCount: doc.chunkCount,
      status: doc.status,
      createdAt: doc.createdAt,
    };
  }
}
