import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { SetupDto } from "./dto/setup.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async issueToken(userId: string, email: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, email });
    return { accessToken };
  }

  // One-time bootstrap: the very first user becomes ADMIN. After that, users
  // are only created by an admin via POST /users — there is no open sign-up.
  async setup(dto: SetupDto) {
    if ((await this.prisma.user.count()) > 0) {
      throw new ForbiddenException("Первый администратор уже создан");
    }
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: "ADMIN",
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
