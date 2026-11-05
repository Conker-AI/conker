import type { ThemePreset } from "../types/theme";
import presets from "./shadcn-ui-theme-presets.json";

// The preset colours are data, kept as JSON; this module only gives them their type.
export const shadcnThemePresets: Record<string, ThemePreset> = presets;
