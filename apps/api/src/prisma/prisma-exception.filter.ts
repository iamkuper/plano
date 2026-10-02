import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

// P2025 ("record not found") is also what the tenant scope produces for rows
// of another workspace: to the client both are simply 404.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (e.code === "P2025") return res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: "Не найдено" });
    if (e.code === "P2002") return res.status(HttpStatus.CONFLICT).json({ statusCode: 409, message: "Такая запись уже есть" });
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: "Internal server error" });
  }
}
