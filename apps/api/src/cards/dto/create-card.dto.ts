import { Type } from "class-transformer";
import { IsArray, IsDate, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { CardPriority, CardType } from "@prisma/client";

export class CreateCardDto {
  @IsString()
  columnId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CardType)
  type?: CardType;

  @IsOptional()
  @IsEnum(CardPriority)
  priority?: CardPriority;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimateHours?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];
}
