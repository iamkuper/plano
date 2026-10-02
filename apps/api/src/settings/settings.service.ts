import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateSettingsDto } from "./settings.dto";

// Single-row workspace settings (id = 1), created on first read if missing.
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  update(dto: UpdateSettingsDto) {
    const data = {
      ...dto,
      cardPrefix: dto.cardPrefix?.toUpperCase(),
      defaultColumns: dto.defaultColumns?.map((c) => c.trim()).filter(Boolean),
    };
    return this.prisma.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  }
}
