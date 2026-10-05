import { t } from "@plano/shared";
// Square-crops and downsizes an image file in the browser, returning a JPEG
// data: URL small enough to store on the user record (~20–60 KB at 256px).
export async function imageToAvatarDataUrl(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(t("lib.image.chooseAnImageFileJpg"));
  if (file.size > 15 * 1024 * 1024) throw new Error(t("lib.image.theFileIsLargerThan"));

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(t("lib.image.couldNotReadTheImage")));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}
