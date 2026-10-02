import { Controller, Delete, Get, HttpCode, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { diskStorage } from "multer";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { AttachmentsService, MAX_FILE_BYTES, UPLOAD_DIR, storageKeyFor } from "./attachments.service";

// Types shown inline in the browser; everything else downloads.
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|text\/plain)$/;

@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post("cards/:id/attachments")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({ destination: UPLOAD_DIR, filename: (_req, file, cb) => cb(null, storageKeyFor(file.originalname)) }),
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  upload(@Param("id") id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    AttachmentsService.rejectEmpty(file);
    return this.attachments.add(id, user.userId, file);
  }

  // Public but signed (see withUrl): needed for <img src> and downloads.
  @Get("attachments/:id/file")
  async file(@Param("id") id: string, @Query("exp") exp: string, @Query("sig") sig: string, @Res() res: Response) {
    const { row, path } = await this.attachments.file(id, exp, sig);
    const inline = INLINE.test(row.mime);
    res.setHeader("Content-Type", row.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(row.name)}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    );
    res.sendFile(path, (err) => err && !res.headersSent && res.status(404).end());
  }

  @Delete("attachments/:id")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attachments.remove(id, user);
  }
}
