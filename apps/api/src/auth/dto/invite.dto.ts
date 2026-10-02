import { IsEmail, IsString, MinLength } from "class-validator";

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(1, { message: "Укажите имя" })
  name!: string;

  @IsString()
  @MinLength(8, { message: "Пароль — не короче 8 символов" })
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: "Укажите почту" })
  email!: string;
}

export class ResetPasswordTokenDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8, { message: "Пароль — не короче 8 символов" })
  password!: string;
}
