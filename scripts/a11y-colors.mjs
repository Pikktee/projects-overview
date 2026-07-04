/** WCAG-Kontrast-Helfer: explizite Hex-Farben statt color-mix() — für Tools wie SilkTide. */

const CARD_BG = '#171a1f';
const BTN_TEXT = '#0f1114';
const LIGHTEN_WITH = '#ece8e1';

function parseHex(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function luminance([r, g, b]) {
  const channel = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2];
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

function mixColors(c1, c2, c1Percent) {
  const p = c1Percent / 100;
  return c1.map((v, i) => v * p + c2[i] * (1 - p));
}

/** Lesbare Akzentfarbe auf Kartenhintergrund (--bg-elevated). */
export function accessibleCtaColor(accent, background = CARD_BG, minRatio = 4.5) {
  const fg = parseHex(accent);
  const bg = parseHex(background);
  if (contrast(fg, bg) >= minRatio) return accent.toLowerCase();

  for (let accentPct = 95; accentPct >= 40; accentPct -= 5) {
    const mixed = mixColors(fg, parseHex(LIGHTEN_WITH), accentPct);
    if (contrast(mixed, bg) >= minRatio) return toHex(mixed);
  }
  return LIGHTEN_WITH.toLowerCase();
}

/** Heller Button-Hintergrund für dunklen Text (#0f1114). */
export function accessibleButtonBg(accent, text = BTN_TEXT, minRatio = 4.5) {
  const fg = parseHex(text);
  const accentRgb = parseHex(accent);
  if (contrast(fg, accentRgb) >= minRatio) return accent.toLowerCase();

  for (let accentPct = 95; accentPct >= 35; accentPct -= 5) {
    const mixed = mixColors(accentRgb, parseHex(LIGHTEN_WITH), accentPct);
    if (contrast(fg, mixed) >= minRatio) return toHex(mixed);
  }
  return LIGHTEN_WITH.toLowerCase();
}
