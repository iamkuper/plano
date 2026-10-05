import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { t } from "@plano/shared";
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: () => t("common.enterAName2") })
  @MaxLength(40, { message: () => t("common.nameMustBeUpTo") })
  workspaceName?: string;

  @IsOptional()
  @Matches(/^[A-Za-zА-Яа-яЁё0-9]{1,6}$/, { message: () => t("api.settings.prefixMustBe1To") })
  cardPrefix?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: () => t("common.atLeastOneStageIs") })
  @ArrayMaxSize(12, { message: () => t("api.settings.atMost12Stages") })
  @IsString({ each: true })
  @MaxLength(40, { each: true, message: () => t("api.settings.stageNameMustBeUp") })
  defaultColumns?: string[];

}
