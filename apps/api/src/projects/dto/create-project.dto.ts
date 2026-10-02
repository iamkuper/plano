import { Type } from "class-transformer";
import { IsDate, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  @IsOptional()
  @IsInt()
  @Min(0)
  hoursBudget?: number;
}
