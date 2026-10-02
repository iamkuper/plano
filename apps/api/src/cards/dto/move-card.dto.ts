import { IsNumber, IsOptional, IsString } from "class-validator";

export class MoveCardDto {
  @IsString()
  columnId!: string;

  // Omitted → append to the end of the target column (e.g. status change
  // from the card modal, where neighbours aren't known).
  @IsOptional()
  @IsNumber()
  position?: number;
}
