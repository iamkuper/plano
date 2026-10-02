// Design tokens — single source of truth (Tailwind theme is generated from
// this file). Standard: Linear-like light UI, see /.ux-profile.md.
// The only bold colour is the stage palette (sales-pipeline vernacular);
// everything else is neutral.

export const color = {
  // Surfaces
  bg: "#FFFFFF", // main work area
  surface: "#FFFFFF", // cards, inputs, overlays
  "surface-soft": "#F6F6F7", // sidebar, board lanes, table header, hover
  "surface-sunken": "#EFEFF1", // active nav item, selected segment, skeleton
  overlay: "rgba(27, 28, 31, 0.32)", // scrim behind sheets and dialogs

  // Lines
  border: "#E6E6E9",
  "border-strong": "#D3D4D9",

  // Text
  ink: "#1B1C1F",
  "ink-soft": "#3C3D42",
  "ink-faint": "#6C6E75", // secondary text, 5.0:1 on white
  "ink-ghost": "#8B8D94", // meta and placeholders, 3.5:1 — short labels only

  // Interactive — brand colour, also the app chrome (sidebar + frame).
  accent: "#2B2F33",
  "accent-hover": "#43484E",
  "accent-soft": "#ECEDEE",
  // App chrome: sidebar and the frame around the white work area.
  chrome: "#2B2F33",
  "chrome-hover": "#373C41", // hovered nav item
  "chrome-active": "#43484E", // current nav item
  "chrome-line": "#3D4247", // dividers and control borders on chrome
  "chrome-ink": "#FFFFFF",
  "chrome-ink-soft": "#CDD0D4", // nav labels (9.6:1 on chrome)
  "chrome-ink-faint": "#979CA2", // section labels, counters (5.0:1)

  dark: "#1B1C1F", // tooltips only
  "dark-hover": "#2C2D31",

  // Signals
  success: "#22865A",
  "success-soft": "#E7F4EE",
  warning: "#B26B00",
  "warning-soft": "#FBF1E1",
  danger: "#D23F3F",
  "danger-soft": "#FCECEC",
} as const;

// Board stages, in column order (cycled for long boards).
export const stagePalette = ["#9CA0A8", "#3D8BF2", "#8A6CE8", "#E8A23A", "#1EA7A0", "#E26AA0", "#2FA36B"] as const;

// Colour for column `index` of `count`: first stage grey, last stage green,
// the rest walk the palette.
export function stageColor(index: number, count: number) {
  if (count > 1 && index === count - 1) return "#2FA36B";
  return stagePalette[index % (stagePalette.length - 1)];
}

// Kept for components that speak in workflow terms.
export const statusColor = {
  todo: stagePalette[0],
  progress: stagePalette[1],
  done: "#2FA36B",
} as const;

export const priorityColor = {
  HIGH: "#D23F3F",
  MEDIUM: "#B26B00",
  LOW: "#8B8D94",
} as const;

// Muted categorical hues for people/projects and card types.
export const series = ["#4A5BDC", "#C2562F", "#1E8F7A", "#9A6B00", "#B04A85", "#3F7F2E"] as const;

// Label colours, keyed like LABEL_COLORS in @amo-kanban/shared.
export const labelColor = {
  gray: "#8B8D94",
  red: "#D23F3F",
  orange: "#C2562F",
  amber: "#B26B00",
  green: "#2FA36B",
  teal: "#1E8F7A",
  blue: "#3D8BF2",
  violet: "#8A6CE8",
  pink: "#E26AA0",
} as const;

export const cardTypeColor = {
  SETUP: "#4A5BDC",
  INTEGRATION: "#C2562F",
  WIDGET: "#1E8F7A",
  TRAINING: "#3F7F2E",
  BUG: "#D23F3F",
  OTHER: "#6C6E75",
} as const;

// Type scale [size, line-height]. Nothing below 12px; 12px is meta only.
export const fontSize = {
  "2xs": ["12px", "16px"], // alias of xs — legacy name, same size
  xs: ["12px", "16px"], // meta: keys, dates, counts, helper text
  sm: ["13px", "18px"], // controls, nav, dense secondary text
  base: ["14px", "20px"], // primary content: card titles, rows, body
  md: ["16px", "24px"], // section titles
  lg: ["18px", "26px"], // dialog titles
  xl: ["20px", "28px"], // page titles
  "2xl": ["24px", "30px"], // sheet titles, KPI values
} as const;

export const radius = {
  sm: "4px", // checkboxes, kbd, small chips
  md: "6px", // buttons, inputs, cards on the board, menu items
  lg: "8px", // board lanes, popovers, panels
  xl: "10px", // dialogs
  "2xl": "12px", // large panels
  pill: "9999px",
} as const;

export const shadow = {
  card: "none", // resting surfaces separate by hairline, not shadow
  raised: "0 4px 16px rgba(27, 28, 31, 0.07), 0 1px 3px rgba(27, 28, 31, 0.05)", // popovers, sheets, dragged cards
} as const;

export const layout = {
  sidebar: 232,
  column: 288,
  sheet: 960,
} as const;
