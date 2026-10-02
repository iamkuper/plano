import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDate, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateChecklistItemDto {
  @IsString()
  @MinLength(1)
  text!: string;
}

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class CreateCommentDto {
  // May be empty when the message only carries files.
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];

  // Users picked via "@" in the composer.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionIds?: string[];
}

export class CreateTimeEntryDto {
  @IsInt()
  @Min(1)
  minutes!: number;

  @Type(() => Date)
  @IsDate()
  date!: Date;

  @IsOptional()
  @IsString()
  note?: string;
}
