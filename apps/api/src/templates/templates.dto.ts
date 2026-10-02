import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { CardType } from "@prisma/client";

export class TemplateCardDto {
  @IsString()
  @MinLength(1, { message: "У карточки шаблона должно быть название" })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsEnum(CardType)
  type!: CardType;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimateHours?: number | null;

  @IsArray()
  @IsString({ each: true })
  checklist!: string[];
}

// The whole template in one payload: saving replaces its cards.
export class SaveTemplateDto {
  @IsString()
  @MinLength(1, { message: "Укажите название шаблона" })
  @MaxLength(80)
  name!: string;

  @IsArray()
  @ArrayMinSize(1, { message: "Нужен хотя бы один этап" })
  @ArrayMaxSize(12)
  @IsString({ each: true })
  columns!: string[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateCardDto)
  cards!: TemplateCardDto[];
}

export class FromProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}
