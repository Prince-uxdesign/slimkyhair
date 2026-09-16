/**
 * Slimky Hair email design tokens.
 * White/cream base, restrained brown/navy accents, zero gradients.
 * Single source of truth so every template (auth + orders) looks like one system.
 */
export const COLORS = {
  cream: '#FAF8F5',
  white: '#FFFFFF',
  border: '#EAE5DF',
  borderSoft: '#F2EEEA',
  ink: '#2A2421', // deep botanical brown — primary text & header background
  inkSoft: '#4A423D', // body copy
  muted: '#8A817C', // footer / meta text
  sage: '#3B4E43', // forest sage accent
  sageBg: '#EBEFE9',
  sageBorder: '#D5DDD3',
  navy: '#1B242A', // restrained navy accent (used sparingly for links/notices)
  alertBorder: '#3B4E43',
} as const;

export const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const FONT_DISPLAY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
