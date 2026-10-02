import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { LoginDto } from "./dto/login.dto";
import { templateCreateData } from "../templates/default-template";
import { RegisterDto } from "./dto/register.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async issueToken(userId: string, email: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, email });
    return { accessToken };
  }

  // Open sign-up: creates a workspace together with its first administrator.
  // Further staff are added by that administrator via POST /users.
  async register(dto: RegisterDto) {
    const email = dto.email.trim();
    if (await this.prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })) {
      throw new ConflictException("Эта почта уже зарегистрирована");
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: "ADMIN",
        workspace: { create: { name: dto.workspaceName.trim(), templates: { create: templateCreateData() } } },
      },
    });
    return this.issueToken(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user?.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Неверная почта или пароль");
    }
    return this.issueToken(user.id, user.email);
  }
}
