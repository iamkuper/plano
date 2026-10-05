import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { CardPriority, RecurrenceFrequency } from "@prisma/client";

export class SaveRecurringDto {
  @IsString()
  @MinLength(1, { message: "Укажите название задачи" })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  typeId?: string;

  @IsOptional()
  @IsEnum(CardPriority)
  priority?: CardPriority;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimateHours?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  checklist?: string[];

  @IsEnum(RecurrenceFrequency)
  frequency!: RecurrenceFrequency;

  @IsInt()
  @Min(1)
  @Max(52)
  interval!: number;

  @ValidateIf((o) => o.frequency === "WEEKLY")
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number | null;

  @ValidateIf((o) => o.frequency === "MONTHLY")
  @IsInt()
  @Min(1)
  @Max(31)
  monthDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  dueInDays?: number | null;

  // First run on or after this day (YYYY-MM-DD).
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Укажите дату начала" })
  startDate!: string;
}

export class ToggleRecurringDto {
  @IsBoolean()
  active!: boolean;
}
