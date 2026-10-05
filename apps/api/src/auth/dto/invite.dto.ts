import { IsEmail, IsString, MinLength } from "class-validator";
import { t } from "@plano/shared";
export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(1, { message: () => t("common.enterAName") })
  name!: string;

  @IsString()
  @MinLength(8, { message: () => t("common.passwordMustBeAtLeast") })
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: () => t("common.enterAnEmail") })
  email!: string;
}

export class ResetPasswordTokenDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8, { message: () => t("common.passwordMustBeAtLeast") })
  password!: string;
}
