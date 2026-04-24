import type {
  CourtTheme,
  CourtThemeTextOverrides,
  HSL,
} from '../types/domain'

// ---------- HSL / hex helpers ----------

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function hsl(c: HSL): string {
  return `hsl(${Math.round(c.h)} ${Math.round(c.s)}% ${Math.round(c.l)}%)`
}

export function hexToHsl(hex: string): HSL {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    return { h: 0, s: 0, l: 0 }
  }
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let hue = 0
  let sat = 0
  if (max !== min) {
    const d = max - min
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        hue = (b - r) / d + 2
        break
      case b:
        hue = (r - g) / d + 4
        break
    }
    hue *= 60
  }
  return { h: hue, s: sat * 100, l: l * 100 }
}

function hslToRgb({ h, s, l }: HSL): [number, number, number] {
  const sN = s / 100
  const lN = l / 100
  const c = (1 - Math.abs(2 * lN - 1)) * sN
  const hh = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (hh >= 0 && hh < 1) [r1, g1, b1] = [c, x, 0]
  else if (hh < 2) [r1, g1, b1] = [x, c, 0]
  else if (hh < 3) [r1, g1, b1] = [0, c, x]
  else if (hh < 4) [r1, g1, b1] = [0, x, c]
  else if (hh < 5) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]
  const m = lN - c / 2
  return [r1 + m, g1 + m, b1 + m]
}

/** Relative luminance per WCAG. Input: normalized 0..1 rgb. */
function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Black or white text that satisfies contrast over the given background. */
export function contrastTextColor(bg: HSL): 'black' | 'white' {
  return relLuminance(hslToRgb(bg)) > 0.5 ? 'black' : 'white'
}

// ---------- Default theme (pixel-identical to the original hardcoded Ticker) ----------

// The original Ticker used:
//   bg-[#b3b3b3]  header/footer
//   bg-[#636363]  body
//   bg-[#0E8044]  score
//   text-[#c9062a] header/footer text
//   white text in body rows
// We reproduce that exactly by defaulting to **manual** text color with #c9062a
// in the header/footer, and rely on manual color in body (white) via Ticker logic.
// The Overlay Console exposes a single global text color override — the body
// always renders white (it's the only color that looks right on #636363).

const DEFAULT_HEADER_HSL = hexToHsl('#b3b3b3')
const DEFAULT_BODY_HSL = hexToHsl('#636363')
const DEFAULT_BADGE_HSL = { h: 0, s: 0, l: 100 } // white, matches old bg-white
const DEFAULT_SCORE_HSL = hexToHsl('#0E8044')
const DEFAULT_PAGE_HSL = { h: 222, s: 47, l: 11 } // slate-900 (used when backgroundMode=color)
const DEFAULT_TEXT_HSL = hexToHsl('#c9062a')

export const DEFAULT_TEXT_OVERRIDES: CourtThemeTextOverrides = {
  leagueName: '',
  tournamentName: '',
  headerExtra: '',
  team1Name: '',
  team1Players: '',
  team1Score: '',
  team2Name: '',
  team2Players: '',
  team2Score: '',
  matchInfo: '',
  footerExtra: '',
}

export const DEFAULT_THEME: CourtTheme = {
  version: 1,
  colors: {
    headerFooter: DEFAULT_HEADER_HSL,
    body: DEFAULT_BODY_HSL,
    badge: DEFAULT_BADGE_HSL,
    score: DEFAULT_SCORE_HSL,
    pageBackground: DEFAULT_PAGE_HSL,
    text: {
      mode: 'manual',
      value: DEFAULT_TEXT_HSL,
    },
  },
  backgroundMode: 'transparent',
  backgroundImage: null,
  teamLogoScale: 1,
  badgeLogoScale: 1,
  badgeLogoPosition: { x: 0, y: 0 },
  images: {
    associationLogo: null,
    hideDefaultAssociationLogo: false,
  },
  textOverrides: { ...DEFAULT_TEXT_OVERRIDES },
  showBorder: false,
  useFullAssociationName: false,
}

// ---------- Theme resolution ----------

// Runtime may hand us deeply-partial themes (legacy rows, typos, etc.) so we
// type-erase here then reconstruct a safe full theme.
type AnyRecord = Record<string, unknown>

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null
}

/**
 * Deep-merge a partial theme (from backend) onto DEFAULT_THEME, preserving any
 * structure gaps so legacy/empty themes still render safely.
 */
export function resolveTheme(
  raw: Partial<CourtTheme> | null | undefined,
): CourtTheme {
  if (!isRecord(raw)) return DEFAULT_THEME
  const base = DEFAULT_THEME
  const rc: AnyRecord = isRecord(raw.colors) ? raw.colors : {}
  const rcText: AnyRecord = isRecord(rc.text) ? rc.text : {}
  const rImages: AnyRecord = isRecord(raw.images) ? raw.images : {}
  const rOverrides: AnyRecord = isRecord(raw.textOverrides)
    ? raw.textOverrides
    : {}
  const rBadgePos: AnyRecord = isRecord(raw.badgeLogoPosition)
    ? raw.badgeLogoPosition
    : {}

  const pick = <T>(value: unknown, fallback: T): T =>
    (value as T | undefined) ?? fallback

  return {
    version: 1,
    colors: {
      headerFooter: pick<HSL>(rc.headerFooter, base.colors.headerFooter),
      body: pick<HSL>(rc.body, base.colors.body),
      badge: pick<HSL>(rc.badge, base.colors.badge),
      score: pick<HSL>(rc.score, base.colors.score),
      pageBackground: pick<HSL>(
        rc.pageBackground,
        base.colors.pageBackground,
      ),
      text: {
        mode: pick(rcText.mode, base.colors.text.mode),
        value: pick<HSL>(rcText.value, base.colors.text.value),
      },
    },
    backgroundMode: pick(raw.backgroundMode, base.backgroundMode),
    backgroundImage: pick(raw.backgroundImage, base.backgroundImage),
    teamLogoScale: clamp(
      pick(raw.teamLogoScale, base.teamLogoScale),
      0.5,
      10,
    ),
    badgeLogoScale: clamp(
      pick(raw.badgeLogoScale, base.badgeLogoScale),
      0.5,
      10,
    ),
    badgeLogoPosition: {
      x: pick(rBadgePos.x, base.badgeLogoPosition.x),
      y: pick(rBadgePos.y, base.badgeLogoPosition.y),
    },
    images: {
      associationLogo: pick(
        rImages.associationLogo,
        base.images.associationLogo,
      ),
      hideDefaultAssociationLogo: pick(
        rImages.hideDefaultAssociationLogo,
        base.images.hideDefaultAssociationLogo,
      ),
    },
    textOverrides: {
      ...base.textOverrides,
      ...(rOverrides as Partial<typeof base.textOverrides>),
    },
    showBorder: pick(raw.showBorder, base.showBorder),
    useFullAssociationName: pick(
      raw.useFullAssociationName,
      base.useFullAssociationName,
    ),
  }
}

/** Choose override if non-empty (trimmed), otherwise fall back to live value. */
export function resolveOverride(
  override: string | undefined,
  live: string | null | undefined,
): string {
  const trimmed = (override ?? '').trim()
  if (trimmed.length > 0) return trimmed
  return live ?? ''
}

// ---------- Presets ----------

export interface ThemePreset {
  id: string
  label: string
  description: string
  theme: CourtTheme
}

export const PRESETS: Array<ThemePreset> = [
  {
    id: 'default',
    label: 'Default',
    description: 'The classic CourtCommand look — grey bars, red text, green scores.',
    theme: DEFAULT_THEME,
  },
  {
    id: 'broadcast-chroma',
    label: 'Broadcast (Chroma)',
    description:
      'Default colors with a transparent page background for OBS / vMix chroma keying.',
    theme: {
      ...DEFAULT_THEME,
      backgroundMode: 'transparent',
    },
  },
  {
    id: 'broadcast-solid',
    label: 'Broadcast (Solid)',
    description:
      'Default colors on a solid dark page background — for live non-chroma displays.',
    theme: {
      ...DEFAULT_THEME,
      backgroundMode: 'color',
      colors: {
        ...DEFAULT_THEME.colors,
        pageBackground: { h: 222, s: 47, l: 11 },
      },
    },
  },
  {
    id: 'minimal-dark',
    label: 'Minimal Dark',
    description: 'Near-black bars, dark grey body, bright score accent, white text.',
    theme: {
      ...DEFAULT_THEME,
      colors: {
        headerFooter: { h: 220, s: 15, l: 10 },
        body: { h: 220, s: 12, l: 18 },
        badge: { h: 220, s: 15, l: 10 },
        score: { h: 162, s: 72, l: 40 },
        pageBackground: { h: 220, s: 20, l: 6 },
        text: { mode: 'manual', value: { h: 0, s: 0, l: 100 } },
      },
    },
  },
  {
    id: 'minimal-light',
    label: 'Minimal Light',
    description: 'White bars, light grey body, dark text.',
    theme: {
      ...DEFAULT_THEME,
      colors: {
        headerFooter: { h: 0, s: 0, l: 100 },
        body: { h: 210, s: 12, l: 92 },
        badge: { h: 0, s: 0, l: 100 },
        score: { h: 222, s: 47, l: 25 },
        pageBackground: { h: 210, s: 12, l: 96 },
        text: { mode: 'manual', value: { h: 222, s: 47, l: 14 } },
      },
    },
  },
]

// ---------- URL helpers (images are relative like /uploads/abc.png) ----------

/** Prefix relative backend paths (e.g. `/uploads/foo.png`) with the API base URL. */
export function resolveImageUrl(
  path: string | null | undefined,
  apiBaseUrl: string,
): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path
  if (path.startsWith('/')) return `${apiBaseUrl}${path}`
  return path
}
