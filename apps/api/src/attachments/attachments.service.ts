import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { mkdirSync } from "fs";
import { unlink } from "fs/promises";
import { extname, join, resolve } from "path";
import type { AuthenticatedUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

// Outside dist/ on purpose: the build wipes dist. The API runs from apps/api,
// so the default is apps/api/uploads; override with UPLOAD_DIR in production.
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads"));
mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const LINK_TTL_MS = 12 * 60 * 60 * 1000;
const SECRET = process.env.JWT_SECRET ?? "change-me-in-production";

export function storageKeyFor(originalName: string) {
  const ext = extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  return `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}${ext}`;
}

const sign = (id: string, exp: number) => createHmac("sha256", SECRET).update(`${id}.${exp}`).digest("base64url");

type Row = { id: string; name: string; mime: string; size: number; createdAt: Date; commentId: string | null; uploaderId: string };

// Files are fetched through short-lived signed URLs so <img> and download
// links work without an Authorization header.
export function withUrl<T extends Row>(a: T) {
  const exp = Date.now() + LINK_TTL_MS;
  return { ...a, url: `/attachments/${a.id}/file?exp=${exp}&sig=${sign(a.id, exp)}` };
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async add(cardId: string, userId: string, file: Express.Multer.File) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId }, select: { id: true, projectId: true } });
    if (!card) throw new NotFoundException("Карточка не найдена");
    // Browsers send non-ASCII names as latin1 in multipart headers.
    const name = Buffer.from(file.originalname, "latin1").toString("utf8").slice(0, 200) || "файл";
    const row = await this.prisma.attachment.create({
      data: { cardId, uploaderId: userId, name, mime: file.mimetype || "application/octet-stream", size: file.size, storageKey: file.filename },
    });
    await this.realtime.cardChanged(cardId, card.projectId);
    return withUrl(row);
  }

  // Attach freshly uploaded files to a new message (author's own, same card).
  async linkToComment(ids: string[], commentId: string, cardId: string, userId: string) {
    if (!ids.length) return;
    await this.prisma.attachment.updateMany({ where: { id: { in: ids }, cardId, uploaderId: userId, commentId: null }, data: { commentId } });
  }

  async file(id: string, exp: string, sig: string) {
    const expires = Number(exp);
    const expected = Buffer.from(sign(id, expires));
    const given = Buffer.from(String(sig ?? ""));
    if (!expires || expires < Date.now() || expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new ForbiddenException("Ссылка устарела — откройте карточку заново");
    }
    const row = await this.prisma.attachment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Файл не найден");
    return { row, path: join(UPLOAD_DIR, row.storageKey) };
  }

  async remove(id: string, user: AuthenticatedUser) {
    const row = await this.prisma.attachment.findUnique({ where: { id }, include: { card: { select: { projectId: true } } } });
    if (!row) throw new NotFoundException();
    if (row.uploaderId !== user.userId && user.role !== "ADMIN") throw new ForbiddenException("Удалить файл может тот, кто его загрузил, или администратор");
    await this.prisma.attachment.delete({ where: { id } });
    await unlink(join(UPLOAD_DIR, row.storageKey)).catch(() => {});
    await this.realtime.cardChanged(row.cardId, row.card.projectId);
  }

  // Call before deleting cards/projects: the DB cascade removes the rows, this
  // returns a function that removes the files once the delete succeeded.
  async filesOf(where: { cardId?: { in: string[] } | string; card?: { projectId: string } }) {
    const rows = await this.prisma.attachment.findMany({ where, select: { storageKey: true } });
    return () => Promise.all(rows.map((r) => unlink(join(UPLOAD_DIR, r.storageKey)).catch(() => {})));
  }

  static rejectEmpty(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Файл не получен");
  }
}
