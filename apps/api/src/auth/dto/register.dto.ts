import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { LOCALES, type Locale, t } from "@plano/shared";

export class RegisterDto {
  @IsString()
  @MinLength(1, { message: () => t("api.auth.enterTheCompanyName") })
  @MaxLength(40, { message: () => t("common.nameMustBeUpTo") })
  workspaceName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Interface language at sign-up: picks the language of the starter content.
  @IsOptional()
  @IsIn(LOCALES)
  locale?: Locale;
}
