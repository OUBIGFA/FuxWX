export const palette = {
  // Surfaces (WinOne-inspired cool neutral light hierarchy)
  canvas: "#ffffff",
  sidebar: "#f7f8fa",
  chrome: "#f3f4f6",
  subtle: "#f9fafb",
  inset: "#f2f4f7",
  navActive: "#e9ecf0",
  navHover: "#eff1f5",
  rowHover: "#f8f9fb",
  rowSelected: "#f7faff",
  rowDanger: "#fff7f7",
  rowFocused: "#eff6ff",

  // Borders (lifted contrast on white)
  border: "#e5e7eb",
  borderSubtle: "#eef0f4",
  borderControl: "#d1d5db",
  borderControlHover: "#9ca3af",

  // Inks
  ink: "#111318",
  inkSecondary: "#4b5563",
  inkMuted: "#6b7280",

  // Accent & semantics
  accent: "#2563eb",
  accentHover: "#1d4ed8",
  accentSoft: "#eff6ff",
  accentBorder: "#bfdbfe",
  accentText: "#1d4ed8",

  danger: "#dc2626",
  dangerHover: "#b91c1c",
  dangerSoft: "#fef2f2",
  dangerBorder: "#fecaca",
  dangerText: "#b91c1c",

  bannerBg: "#f3f4f6",
  disabledBg: "#eef0f4",
  disabledInk: "#6b7280",
  progressTrack: "#e5e7eb",
} as const;

export const metrics = {
  radiusCard: 10,
  radiusControl: 7,
  radiusSmall: 5,
  radiusBanner: 10,
  shadowControl: "0 1px 2px rgba(16, 24, 40, 0.05)",
} as const;
