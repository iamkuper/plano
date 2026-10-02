// Russian amount in words for invoices: 1470.50 → "Одна тысяча четыреста семьдесят рублей 50 копеек".
const ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function triad(n: number, feminine: boolean) {
  const words = [HUNDREDS[Math.floor(n / 100)]];
  const rest = n % 100;
  if (rest >= 10 && rest < 20) words.push(TEENS[rest - 10]);
  else words.push(TENS[Math.floor(rest / 10)], (feminine ? ONES_F : ONES_M)[rest % 10]);
  return words.filter(Boolean).join(" ");
}

const SCALES: [string, string, string, boolean][] = [
  ["", "", "", false],
  ["тысяча", "тысячи", "тысяч", true],
  ["миллион", "миллиона", "миллионов", false],
  ["миллиард", "миллиарда", "миллиардов", false],
];

export function numberInWords(n: number) {
  if (n === 0) return "ноль";
  const parts: string[] = [];
  for (let i = 0; n > 0 && i < SCALES.length; i++, n = Math.floor(n / 1000)) {
    const t = n % 1000;
    if (!t) continue;
    const [one, few, many, fem] = SCALES[i];
    parts.unshift([triad(t, fem), i ? plural(t, one, few, many) : ""].filter(Boolean).join(" "));
  }
  return parts.join(" ");
}

export function rublesInWords(kopecks: number) {
  const rub = Math.floor(kopecks / 100);
  const kop = kopecks % 100;
  const text = `${numberInWords(rub)} ${plural(rub, "рубль", "рубля", "рублей")} ${String(kop).padStart(2, "0")} ${plural(kop, "копейка", "копейки", "копеек")}`;
  return text[0].toUpperCase() + text.slice(1);
}
