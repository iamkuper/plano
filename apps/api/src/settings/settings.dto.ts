import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Укажите название" })
  @MaxLength(40, { message: "Название — до 40 символов" })
  workspaceName?: string;

  @IsOptional()
  @Matches(/^[A-Za-zА-Яа-яЁё0-9]{1,6}$/, { message: "Префикс — от 1 до 6 букв или цифр, без пробелов" })
  cardPrefix?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "Нужен хотя бы один этап" })
  @ArrayMaxSize(12, { message: "Не больше 12 этапов" })
  @IsString({ each: true })
  @MaxLength(40, { each: true, message: "Название этапа — до 40 символов" })
  defaultColumns?: string[];

}
