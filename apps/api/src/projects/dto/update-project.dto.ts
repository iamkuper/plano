import { Type } from "class-transformer";
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { ProjectStatus } from "@prisma/client";

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

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
