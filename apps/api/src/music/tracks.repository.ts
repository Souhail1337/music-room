import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Track } from '../generated/prisma/client.js';

/** Owns the Track table (AD-8). */
@Injectable()
export class TracksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Track | null> {
    return this.prisma.track.findUnique({ where: { id } });
  }

  upsert(track: Omit<Track, 'createdAt' | 'updatedAt'>): Promise<Track> {
    const { id, ...data } = track;
    return this.prisma.track.upsert({
      where: { id },
      create: track,
      update: data,
    });
  }
}
