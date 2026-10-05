import { readFile } from "fs/promises";
import { join } from "path";
import { ImageResponse } from "next/og";

export const alt = "Plano — канбан и таск-трекер для команд и агентств";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// DejaVu has Cyrillic; the default OG font does not.
const fonts = join(process.cwd(), "node_modules/dejavu-fonts-ttf");

// Social preview: brand, headline and a small board in the app's colours.
export default async function OpengraphImage() {
  const [regular, bold, logo] = await Promise.all([
    readFile(join(fonts, "ttf/DejaVuSans.ttf")),
    readFile(join(fonts, "ttf/DejaVuSans-Bold.ttf")),
    readFile(join(process.cwd(), "public/plano.svg"), "utf8"),
  ]);
  const cols = [
    ["В работе", "#3D8BF2", ["Интеграция с сайтом", "Обучение команды"]],
    ["Готово", "#2FA36B", ["Бриф и требования"]],
  ] as const;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#2B2F33", color: "white", fontFamily: "DejaVu", padding: 72 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 700 }}>
            <img src={`data:image/svg+xml;base64,${Buffer.from(logo).toString("base64")}`} width={64} height={64} style={{ borderRadius: 14 }} />
            Plano
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.12 }}>Задачи команды в одном спокойном месте</div>
            <div style={{ fontSize: 26, color: "#CDD0D4" }}>Канбан для небольших команд и агентств · 14 дней бесплатно</div>
          </div>
          <div style={{ fontSize: 24, color: "#979CA2" }}>plano.team</div>
        </div>
        <div style={{ display: "flex", gap: 14, marginLeft: 48, marginTop: 70 }}>
          {cols.map(([title, color, cards], ci) => (
            <div key={title} style={{ display: "flex", flexDirection: "column", width: 196, background: "rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ height: 5, background: color }} />
              <div style={{ padding: "14px 16px", fontSize: 20, color: "rgba(255,255,255,0.8)" }}>{title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 10px 10px" }}>
                {cards.map((t, i) => (
                  <div key={t} style={{ display: "flex", flexDirection: "column", background: "white", color: "#1B1C1F", borderRadius: 10, padding: "12px 14px", fontSize: 18 }}>
                    <span style={{ fontSize: 14, color: "#9A9CA3" }}>P-{21 + ci * 2 + i}</span>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "DejaVu", data: regular, weight: 400 },
        { name: "DejaVu", data: bold, weight: 700 },
      ],
    },
  );
}
