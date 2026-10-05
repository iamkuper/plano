import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";
import { LOCALES, t, type Locale } from "@plano/shared";
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: () => t("api.users.enterAValidEmail") })
  email?: string;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsIn(LOCALES)
  locale?: Locale;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: () => t("api.users.newPasswordMustBeAt") })
  newPassword!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: () => t("common.passwordMustBeAtLeast") })
  password!: string;
}

export class SetAvatarDto {
  @ValidateIf((_, v) => v !== null)
  @IsString()
  avatarUrl!: string | null;
}
