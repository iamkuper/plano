import { readFile } from "fs/promises";
import { join } from "path";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon for iOS from the logo.
export default async function AppleIcon() {
  const svg = await readFile(join(process.cwd(), "public/plano.svg"), "utf8");
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex" }}>
      <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={180} height={180} />
    </div>,
    size,
  );
}
