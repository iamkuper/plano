import { t } from "@plano/shared";
import { toast } from "./toast";

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t("common.copied"), "success");
  } catch {
    toast(t("common.copyFailed"), "error");
  }
}
