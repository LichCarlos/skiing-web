export const defaultTheme = {
  primary: "#1d4ed8",
  primaryForeground: "#ffffff",
  background: "#ffffff",
  foreground: "#172033",
  muted: "#f1f5f9",
  mutedForeground: "#526176",
  border: "#d9e1eb",
  radius: 8,
  fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
};
export type ThemeTokens = typeof defaultTheme;
export function createTheme(overrides: Partial<ThemeTokens> = {}): ThemeTokens {
  return { ...defaultTheme, ...overrides };
}
export function toCssVariables(
  theme: ThemeTokens,
): Record<`--${string}`, string> {
  return {
    "--primary": theme.primary,
    "--primary-foreground": theme.primaryForeground,
    "--background": theme.background,
    "--foreground": theme.foreground,
    "--muted": theme.muted,
    "--muted-foreground": theme.mutedForeground,
    "--border": theme.border,
    "--ring": theme.primary,
    "--radius": `${theme.radius}px`,
    "--font-sans": theme.fontFamily,
  };
}
