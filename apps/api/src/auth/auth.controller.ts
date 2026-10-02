import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { AcceptInviteDto, ForgotPasswordDto, ResetPasswordTokenDto } from "./dto/invite.dto";
import { RegisterDto } from "./dto/register.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get("invitations/:token")
  invitation(@Param("token") token: string) {
    return this.auth.invitePreview(token);
  }

  @Post("accept-invite")
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.auth.acceptInvite(dto.token, dto.name, dto.password);
  }

  @Post("forgot")
  @HttpCode(204)
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post("reset")
  @HttpCode(204)
  reset(@Body() dto: ResetPasswordTokenDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }
}
