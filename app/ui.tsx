import { Image, Text } from "nsh";
import { Button } from "nsh/base";
import folder from "../assets/icons/solar/folder-open.svg";
import search from "../assets/icons/solar/magnifier.svg";
import copy from "../assets/icons/solar/copy.svg";
import shield from "../assets/icons/solar/shield-check.svg";
import trash from "../assets/icons/solar/trash-bin-minimalistic.svg";
import stop from "../assets/icons/solar/stop-circle.svg";
import file from "../assets/icons/solar/file-text.svg";
import check from "../assets/icons/solar/check-circle.svg";

export const palette = {
  bg: "#ffffff",
  surface: "#f5f7f6",
  surfaceFocus: "#eaf1ec",
  surfaceSelected: "#f6faf7",
  surfaceDangerTint: "#fdf5f4",
  border: "#d3dbd6",
  borderSubtle: "#e5eae7",
  borderControl: "#bcc7c0",
  ink: "#1b241f",
  inkSecondary: "#4c5a52",
  inkMuted: "#627068",
  accent: "#244c3b",
  accentSoft: "#e4efe8",
  danger: "#9e3a33",
  dangerSoft: "#f6e5e3",
  infoSuccessBg: "#f0f6f2",
  infoErrorBg: "#fdf3f2",
  previewBg: "#e8eeea",
  progressTrack: "#dbe3de",
} as const;

const icons = { folder, search, copy, shield, trash, stop, file, check };
export type IconName = keyof typeof icons;
export function Icon(p: { name: IconName; color?: string; size?: number }) {
  return <Image src={icons[p.name]} style={{ width: p.size ?? 18, height: p.size ?? 18, tintColor: p.color ?? palette.inkSecondary }} />;
}

/** Shared buttons keep focus, hover and disabled states visible in native controls. */
export function Action(p: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean; compact?: boolean; fullWidth?: boolean; id?: string }) {
  const height = p.compact ? 32 : 36;
  const fontSize = p.compact ? 13 : 13.5;
  const iconSize = p.compact ? 16 : 17;
  const paddingX = p.compact ? 12 : 14;
  return <Button testID={p.id} onPress={p.onPress} disabled={p.disabled}
    class="flex-row items-center justify-center gap-2 rounded-md hover:opacity-80 active:opacity-65 disabled:opacity-40"
    style={{
      minHeight: height,
      paddingHorizontal: paddingX,
      width: p.fullWidth ? "100%" : undefined,
      borderWidth: p.primary ? 0 : 1,
      borderColor: palette.borderControl,
      backgroundColor: p.primary ? (p.danger ? palette.danger : palette.accent) : palette.bg,
    }}>
    {p.icon ? <Icon name={p.icon} color={p.primary ? "#ffffff" : palette.inkSecondary} size={iconSize} /> : null}
    <Text style={{ fontSize, color: p.primary ? "#ffffff" : palette.ink, fontWeight: "500" }}>{p.label}</Text>
  </Button>;
}

export function size(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (bytes >= 1024 && index < 4) { bytes /= 1024; index++; }
  return `${bytes.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function displayPath(path: string) { return path.replace(/^\\\\\?\\/, ""); }

/** Show the parent directory relative to the scanned root to reduce repetitive prefixes in rows. */
export function relativeDir(filePath: string, root: string): string {
  const cleanFile = displayPath(filePath);
  const sepIndex = Math.max(cleanFile.lastIndexOf("\\"), cleanFile.lastIndexOf("/"));
  const dir = sepIndex >= 0 ? cleanFile.slice(0, sepIndex) : "";
  if (!dir) return "扫描根目录";
  const cleanRoot = displayPath(root).replace(/[\\/]+$/, "");
  if (!cleanRoot) return dir;
  const dirLower = dir.toLowerCase();
  const rootLower = cleanRoot.toLowerCase();
  if (dirLower === rootLower) return "扫描根目录";
  if (dirLower.startsWith(rootLower + "\\") || dirLower.startsWith(rootLower + "/")) {
    return dir.slice(cleanRoot.length + 1) || "扫描根目录";
  }
  return dir;
}
