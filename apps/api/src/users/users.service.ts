import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const publicFields = {
  id: true,
  email: true,
  name: true,
  role: true,
  roleId: true,
  isActive: true,
  avatarUrl: true,
  customRole: { select: { name: true, permissions: true } },
} as const;

type UserRow = {
  role: "ADMIN" | "MEMBER";
  roleId: string | null;
  customRole: { name: string; permissions: string[] } | null;
} & Record<string, unknown>;

// Flattens the custom role into roleName/permissions for the web app.
function toDto<T extends UserRow>({ customRole, ...user }: T) {
  const admin = user.role === "ADMIN";
  return {
    ...user,
    roleId: admin ? null : user.roleId,
    roleName: admin ? "Администратор" : (customRole?.name ?? "Без роли"),
    permissions: admin ? [] : (customRole?.permissions ?? []),
  };
}

const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_MAX = 1_500_000; // chars of the data URL

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return (await this.prisma.user.findMany({ select: publicFields, orderBy: { name: "asc" } })).map(toDto);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: publicFields });
    if (!user) throw new NotFoundException();
    return toDto(user);
  }

  async create(dto: CreateUserDto) {
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
      throw new ConflictException("Пользователь с такой почтой уже существует");
    }
    const role = dto.role ?? "MEMBER";
    const roleId = role === "ADMIN" ? null : (dto.roleId ?? (await this.prisma.role.findFirst({ where: { isDefault: true } }))?.id ?? null);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role,
        roleId,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      select: publicFields,
    });
    return toDto(user);
  }

  async updateMe(userId: string, data: { name?: string; email?: string }) {
    if (data.email) {
      const taken = await this.prisma.user.findFirst({ where: { email: data.email, id: { not: userId } } });
      if (taken) throw new ConflictException("Эта почта уже занята другим сотрудником");
    }
    return toDto(await this.prisma.user.update({ where: { id: userId }, data, select: publicFields }));
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      // 400, not 401: the web client treats 401 as "session expired" and logs out.
      throw new BadRequestException("Текущий пароль указан неверно");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  }

  async resetPassword(userId: string, password: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  }

  async setAvatar(userId: string, avatarUrl: string | null) {
    if (avatarUrl !== null && (!AVATAR_RE.test(avatarUrl) || avatarUrl.length > AVATAR_MAX)) {
      throw new BadRequestException("Фото должно быть PNG, JPEG или WebP размером до 1 МБ");
    }
    return toDto(await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl }, select: publicFields }));
  }

  async update(id: string, dto: UpdateUserDto) {
    // Picking a custom role makes the user a MEMBER of it.
    const data = dto.roleId ? { ...dto, role: "MEMBER" as const } : dto;
    return toDto(await this.prisma.user.update({ where: { id }, data, select: publicFields }));
  }
}
