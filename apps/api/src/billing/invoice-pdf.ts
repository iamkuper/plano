import PDFDocument from "pdfkit";
import { dirname, join } from "path";
import { plural, rublesInWords } from "./amount-words";

// The seller's details come from the environment (SELLER_*), so the platform
// owner sets them once. Without SELLER_NAME/INN/ACCOUNT/BIK no PDF is made.
export interface Seller {
  name: string;
  inn: string;
  kpp?: string;
  address: string;
  bank: string;
  bik: string;
  account: string;
  corrAccount?: string;
  director?: string;
  accountant?: string;
  // "none" (default, e.g. УСН) or a VAT rate in percent included in the price.
  vat: "none" | number;
}

export function sellerFromEnv(env = process.env): Seller | null {
  if (!env.SELLER_NAME || !env.SELLER_INN || !env.SELLER_ACCOUNT || !env.SELLER_BIK) return null;
  const vat = env.SELLER_VAT && env.SELLER_VAT !== "none" ? Number(env.SELLER_VAT) : "none";
  return {
    name: env.SELLER_NAME,
    inn: env.SELLER_INN,
    kpp: env.SELLER_KPP || undefined,
    address: env.SELLER_ADDRESS ?? "",
    bank: env.SELLER_BANK ?? "",
    bik: env.SELLER_BIK,
    account: env.SELLER_ACCOUNT,
    corrAccount: env.SELLER_CORR_ACCOUNT || undefined,
    director: env.SELLER_DIRECTOR || undefined,
    accountant: env.SELLER_ACCOUNTANT || undefined,
    vat: typeof vat === "number" && Number.isFinite(vat) ? vat : "none",
  };
}

export interface InvoiceData {
  number: number;
  // Account to activate on payment; printed on the invoice.
  workspaceId: string;
  date: Date;
  payer: { name: string; inn: string; kpp?: string | null; address: string };
  item: string;
  amount: number; // kopecks
}

const FONT_DIR = join(dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf");
const money = (kopecks: number) => (kopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ");
const longDate = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" });

// A standard Russian "Счёт на оплату" on one A4 page.
export function renderInvoicePdf(seller: Seller, inv: InvoiceData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: `Счёт № ${inv.number}`, Author: seller.name } });
  doc.registerFont("r", join(FONT_DIR, "DejaVuSans.ttf"));
  doc.registerFont("b", join(FONT_DIR, "DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const L = 40;
  const W = doc.page.width - 80;
  const cell = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h).lineWidth(0.6).stroke();
  const text = (s: string, x: number, y: number, w: number, opts: PDFKit.Mixins.TextOptions & { bold?: boolean; size?: number } = {}) =>
    doc.font(opts.bold ? "b" : "r").fontSize(opts.size ?? 9).text(s, x, y, { width: w, ...opts });

  // Bank block
  let y = 40;
  const c1 = W * 0.55;
  const c2 = W * 0.1;
  const c3 = W - c1 - c2;
  cell(L, y, c1, 40);
  text(seller.bank, L + 4, y + 4, c1 - 8);
  text("Банк получателя", L + 4, y + 28, c1 - 8, { size: 7 });
  cell(L + c1, y, c2, 20);
  text("БИК", L + c1 + 4, y + 5, c2 - 8);
  cell(L + c1 + c2, y, c3, 20);
  text(seller.bik, L + c1 + c2 + 4, y + 5, c3 - 8);
  cell(L + c1, y + 20, c2, 20);
  text("Сч. №", L + c1 + 4, y + 25, c2 - 8);
  cell(L + c1 + c2, y + 20, c3, 20);
  text(seller.corrAccount ?? "", L + c1 + c2 + 4, y + 25, c3 - 8);
  y += 40;
  const half = c1 / 2;
  cell(L, y, half, 18);
  text(`ИНН ${seller.inn}`, L + 4, y + 4, half - 8);
  cell(L + half, y, half, 18);
  text(seller.kpp ? `КПП ${seller.kpp}` : "", L + half + 4, y + 4, half - 8);
  cell(L, y + 18, c1, 40);
  text(seller.name, L + 4, y + 22, c1 - 8);
  text("Получатель", L + 4, y + 46, c1 - 8, { size: 7 });
  cell(L + c1, y, c2, 58);
  text("Сч. №", L + c1 + 4, y + 4, c2 - 8);
  cell(L + c1 + c2, y, c3, 58);
  text(seller.account, L + c1 + c2 + 4, y + 4, c3 - 8);
  y += 74;

  text(`Счёт на оплату № ${inv.number} от ${longDate(inv.date)}`, L, y, W, { bold: true, size: 14 });
  y += 22;
  text(`ID аккаунта Plano: ${inv.workspaceId}`, L, y, W, { size: 9 });
  y += 16;
  doc.moveTo(L, y).lineTo(L + W, y).lineWidth(1.5).stroke();
  y += 10;

  const party = (label: string, value: string) => {
    text(label, L, y, 90);
    text(value, L + 90, y, W - 90, { bold: true });
    y += doc.heightOfString(value, { width: W - 90 }) + 8;
  };
  party("Поставщик:", [seller.name, `ИНН ${seller.inn}`, seller.kpp && `КПП ${seller.kpp}`, seller.address].filter(Boolean).join(", "));
  party("Покупатель:", [inv.payer.name, `ИНН ${inv.payer.inn}`, inv.payer.kpp && `КПП ${inv.payer.kpp}`, inv.payer.address].filter(Boolean).join(", "));
  y += 6;

  // Items table
  const cols = [24, W - 24 - 50 - 40 - 80 - 80, 50, 40, 80, 80];
  const heads = ["№", "Товары (работы, услуги)", "Кол-во", "Ед.", "Цена", "Сумма"];
  const row = (vals: string[], bold: boolean) => {
    const h = Math.max(18, doc.font(bold ? "b" : "r").fontSize(9).heightOfString(vals[1], { width: cols[1] - 8 }) + 8);
    let x = L;
    vals.forEach((v, i) => {
      cell(x, y, cols[i], h);
      text(v, x + 4, y + 4, cols[i] - 8, { bold, align: i >= 2 && i !== 3 ? "right" : i === 3 || i === 0 ? "center" : "left" });
      x += cols[i];
    });
    y += h;
  };
  row(heads, true);
  row(["1", inv.item, "1", "усл.", money(inv.amount), money(inv.amount)], false);
  y += 8;

  const totals: [string, string][] = [["Итого:", money(inv.amount)]];
  if (seller.vat === "none") totals.push(["Без налога (НДС)", "—"]);
  else totals.push([`В том числе НДС (${seller.vat}%):`, money(Math.round((inv.amount * seller.vat) / (100 + seller.vat)))]);
  totals.push(["Всего к оплате:", money(inv.amount)]);
  for (const [k, v] of totals) {
    text(k, L, y, W - 90, { bold: true, align: "right" });
    text(v, L + W - 85, y, 85, { bold: true, align: "right" });
    y += 14;
  }
  y += 6;
  text(`Всего наименований 1, на сумму ${money(inv.amount)} руб.`, L, y, W);
  y += 14;
  text(rublesInWords(inv.amount), L, y, W, { bold: true });
  y += 18;
  text(`В назначении платежа укажите: «Оплата по счёту № ${inv.number}, ID аккаунта ${inv.workspaceId}».`, L, y, W);
  y += 20;
  doc.moveTo(L, y).lineTo(L + W, y).lineWidth(1.5).stroke();
  y += 24;

  const sign = (role: string, name?: string, x = L) => {
    text(role, x, y, 90, { bold: true });
    doc.moveTo(x + 90, y + 10).lineTo(x + 170, y + 10).lineWidth(0.6).stroke();
    text(name ?? "", x + 175, y, 90);
  };
  sign("Руководитель", seller.director);
  sign("Бухгалтер", seller.accountant ?? seller.director, L + W / 2 + 10);
  y += 40;
  text(`Оплата этого счёта означает согласие с условиями оказания услуг. Счёт действителен 10 ${plural(10, "день", "дня", "дней")}.`, L, y, W, { size: 7 });

  doc.end();
  return done;
}
