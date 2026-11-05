import type { ThemePreset } from "../types/theme";
import presets from "./tweakcn-theme-presets.json";

// The preset colours are data, kept as JSON; this module only gives them their type.
export const tweakcnPresets: Record<string, ThemePreset> = presets;
