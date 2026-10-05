import { ogImage, OG_SIZE } from "@/lib/og-image";
import { makeTr } from "@/lib/marketing";

export const alt = makeTr("en")("mk.og.alt");
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return ogImage("en");
}
