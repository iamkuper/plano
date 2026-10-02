import { IsBoolean, IsEmail, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: "Укажите корректную почту" })
  email?: string;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: "Новый пароль — не короче 8 символов" })
  newPassword!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: "Пароль — не короче 8 символов" })
  password!: string;
}

export class SetAvatarDto {
  @ValidateIf((_, v) => v !== null)
  @IsString()
  avatarUrl!: string | null;
}
