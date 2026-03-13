// @hashdo/core — Color palette
//
// 9 color ramps, each with 7 stops from lightest (50) to darkest (900).
// Adapted from Anthropic's generative UI design system.
//
// Usage in card templates:
//   import { colors } from '@hashdo/core';
//   colors.purple[50]   // '#EEEDFE' (lightest fill)
//   colors.purple[800]  // '#3C3489' (text on light fills)
//   colors.positive     // alias for green.600
//   colors.negative     // alias for red.600

// ---------------------------------------------------------------------------
// Ramp type
// ---------------------------------------------------------------------------

export type ColorStop = 50 | 100 | 200 | 400 | 600 | 800 | 900;

export type ColorRamp = Record<ColorStop, string>;

export type RampName =
  | 'purple'
  | 'teal'
  | 'coral'
  | 'pink'
  | 'gray'
  | 'blue'
  | 'green'
  | 'amber'
  | 'red';

// ---------------------------------------------------------------------------
// Ramps
// ---------------------------------------------------------------------------

const purple: ColorRamp = {
  50: '#EEEDFE',
  100: '#CECBF6',
  200: '#AFA9EC',
  400: '#7F77DD',
  600: '#534AB7',
  800: '#3C3489',
  900: '#26215C',
};

const teal: ColorRamp = {
  50: '#E1F5EE',
  100: '#9FE1CB',
  200: '#5DCAA5',
  400: '#1D9E75',
  600: '#0F6E56',
  800: '#085041',
  900: '#04342C',
};

const coral: ColorRamp = {
  50: '#FAECE7',
  100: '#F5C4B3',
  200: '#F0997B',
  400: '#D85A30',
  600: '#993C1D',
  800: '#712B13',
  900: '#4A1B0C',
};

const pink: ColorRamp = {
  50: '#FBEAF0',
  100: '#F4C0D1',
  200: '#ED93B1',
  400: '#D4537E',
  600: '#993556',
  800: '#72243E',
  900: '#4B1528',
};

const gray: ColorRamp = {
  50: '#F1EFE8',
  100: '#D3D1C7',
  200: '#B4B2A9',
  400: '#888780',
  600: '#5F5E5A',
  800: '#444441',
  900: '#2C2C2A',
};

const blue: ColorRamp = {
  50: '#E6F1FB',
  100: '#B5D4F4',
  200: '#85B7EB',
  400: '#378ADD',
  600: '#185FA5',
  800: '#0C447C',
  900: '#042C53',
};

const green: ColorRamp = {
  50: '#EAF3DE',
  100: '#C0DD97',
  200: '#97C459',
  400: '#639922',
  600: '#3B6D11',
  800: '#27500A',
  900: '#173404',
};

const amber: ColorRamp = {
  50: '#FAEEDA',
  100: '#FAC775',
  200: '#EF9F27',
  400: '#BA7517',
  600: '#854F0B',
  800: '#633806',
  900: '#412402',
};

const red: ColorRamp = {
  50: '#FCEBEB',
  100: '#F7C1C1',
  200: '#F09595',
  400: '#E24B4A',
  600: '#A32D2D',
  800: '#791F1F',
  900: '#501313',
};

// ---------------------------------------------------------------------------
// Combined palette
// ---------------------------------------------------------------------------

export const colors = {
  purple,
  teal,
  coral,
  pink,
  gray,
  blue,
  green,
  amber,
  red,

  // Semantic aliases — use for positive/negative indicators (stock changes, etc.)
  positive: green[600],
  negative: red[600],
  info: blue[600],
  warning: amber[600],
  success: green[600],
  danger: red[600],
} as const;

// ---------------------------------------------------------------------------
// Ordered rotation — use for categorical coloring (poll options, chart series)
// Prefer purple/teal/coral/pink for general categories.
// Reserve blue/green/amber/red for semantic meaning (info/success/warning/error).
// ---------------------------------------------------------------------------

export const categoricalColors: readonly string[] = [
  purple[400],
  teal[400],
  coral[400],
  pink[400],
  blue[400],
  green[400],
  amber[400],
  red[400],
  gray[400],
];

// ---------------------------------------------------------------------------
// Gradient helpers — for card header backgrounds
// ---------------------------------------------------------------------------

/** Build a 135deg linear gradient from stop 400 → 600 of a ramp. */
export function rampGradient(ramp: ColorRamp): string {
  return `linear-gradient(135deg, ${ramp[400]} 0%, ${ramp[600]} 100%)`;
}

/** Pre-built gradients keyed by ramp name. */
export const gradients: Record<RampName, string> = {
  purple: rampGradient(purple),
  teal: rampGradient(teal),
  coral: rampGradient(coral),
  pink: rampGradient(pink),
  gray: rampGradient(gray),
  blue: rampGradient(blue),
  green: rampGradient(green),
  amber: rampGradient(amber),
  red: rampGradient(red),
};
