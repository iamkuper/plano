import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { LOCALES, type Locale } from "@plano/shared";

export class RegisterDto {
  @IsString()
  @MinLength(1, { message: "Укажите название компании" })
  @MaxLength(40, { message: "Название — до 40 символов" })
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
