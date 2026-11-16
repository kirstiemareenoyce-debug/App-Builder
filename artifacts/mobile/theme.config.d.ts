export type KairosThemeToken =
  | "primary"
  | "secondary"
  | "background"
  | "backgroundSecondary"
  | "surface"
  | "surfaceElevated"
  | "foreground"
  | "muted"
  | "tertiary"
  | "border"
  | "focus"
  | "success"
  | "warning"
  | "error";

export type KairosThemeSwatch = { readonly light: string; readonly dark: string };

export const themeColors: Record<KairosThemeToken, KairosThemeSwatch>;
