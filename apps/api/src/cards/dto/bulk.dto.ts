import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDate, IsEnum, IsIn, IsOptional, IsString, ValidateIf } from "class-validator";
import { CardPriority } from "@prisma/client";

export const BULK_ACTIONS = ["move", "assign", "unassign", "priority", "due", "delete"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export class BulkCardsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];

  @IsIn(BULK_ACTIONS)
  action!: BulkAction;

  @ValidateIf((o) => o.action === "move")
  @IsString()
  columnId?: string;

  @ValidateIf((o) => o.action === "assign" || o.action === "unassign")
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @ValidateIf((o) => o.action === "priority")
  @IsEnum(CardPriority)
  priority?: CardPriority;

  // null clears the due date.
  @ValidateIf((o) => o.action === "due" && o.dueDate !== null)
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date | null;
}
