/**
 * Design tokens — frozen in CLAUDE.md section 4.
 *
 * Do not re-derive these per screen and do not introduce a colour that isn't
 * here. Two rules the palette encodes and that are easy to break by accident:
 *
 *   1. Berry is the ONLY action colour. Every primary button is berry.
 *   2. Violet is an accent only — progress rings, the timer bar, and the icons
 *      of question types already practised. It is never a button.
 */

export const colors = {
  /** Primary action. Every primary button. */
  brand: '#A8305A',
  /** Progress-ring track behind the berry fill. */
  brandDark: '#87264A',
  /** Icon backgrounds, and the fill of a chosen answer. */
  brandSoft: '#F4DCE4',

  /** Accent only — never a button. */
  accent: '#6B4FD8',
  /** Accent sitting on top of berry. */
  accentLight: '#C9A6E8',
  accentSoft: '#E9E1F7',

  /** Cream with a violet lean — chosen over neutral cream deliberately. */
  page: '#F8F3F8',
  surface: '#FFFFFF',
  border: '#E8DEE8',

  textPrimary: '#2E2A3D',
  textSecondary: '#8983A0',
  textBody: '#6A6480',

  /**
   * NOT part of the frozen palette — added for answer feedback, needs sign-off.
   *
   * There is a real problem here worth understanding before changing it: the
   * brand colour is a red-pink, so the usual red-for-wrong convention collides
   * with the action colour and reads as "this is a button" rather than "this is
   * wrong". So only the CORRECT answer gets a colour (green); a wrong pick is
   * de-emphasised in muted ink instead of turned red. That keeps berry meaning
   * exactly one thing.
   */
  correct: '#2E7D5B',
  correctSoft: '#DCEDE4',
} as const;

export const radii = {
  button: 999,
  card: 18,
  screen: 26,
  icon: 10,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Assistant for all Hebrew UI. Frank Ruhl Libre is reserved for English
 * passage text and nothing else — serif in buttons or headers is what made an
 * earlier version read like a printed document instead of an app.
 *
 * Families are null until the fonts are loaded; the system stack is a
 * deliberate stand-in, not a placeholder to forget about.
 */
export const fonts = {
  ui: undefined as string | undefined,
  uiMedium: undefined as string | undefined,
  /** English passages ONLY. */
  passage: undefined as string | undefined,
} as const;

export const type = {
  /** Hebrew UI. */
  title: { fontSize: 26, lineHeight: 34, fontWeight: '600' as const, color: colors.textPrimary },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const, color: colors.textBody },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const, color: colors.textSecondary },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, color: colors.textSecondary },
} as const;

/**
 * English practice content is LTR inside an RTL app. Every piece of English —
 * a question stem, an answer option, a passage — needs this or it renders with
 * punctuation in the wrong place.
 */
export const english = {
  writingDirection: 'ltr' as const,
  textAlign: 'left' as const,
};

/** Hebrew UI text. */
export const hebrew = {
  writingDirection: 'rtl' as const,
  textAlign: 'right' as const,
};
