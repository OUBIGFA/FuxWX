import { Text, View } from "nsh";
import { Button } from "nsh/base";
import type { FileCategory } from "../types";
import { Icon, type IconName } from "./icons";
import { metrics, palette } from "./tokens";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export function ActionButton(p: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  id?: string;
}) {
  const variant = () => p.variant ?? "secondary";
  const sm = () => p.size === "sm";
  const height = () => (sm() ? 30 : 36);
  const fontSize = () => (sm() ? 12.5 : 13);
  const iconSize = () => (sm() ? 14 : 16);
  const paddingHorizontal = () => (sm() ? 10 : 14);
  const isFilled = () => variant() === "primary" || variant() === "danger";

  const bg = () => {
    if (p.disabled && isFilled()) return palette.disabledBg;
    switch (variant()) {
      case "primary":
        return palette.accent;
      case "danger":
        return palette.danger;
      case "ghost":
        return "transparent";
      default:
        return palette.canvas;
    }
  };

  const borderColor = () => {
    if (p.disabled && isFilled()) return palette.border;
    if (variant() === "ghost" || isFilled()) return "transparent";
    return palette.borderControl;
  };

  const fg = () => {
    if (p.disabled) return isFilled() ? palette.disabledInk : palette.inkMuted;
    return isFilled() ? "#ffffff" : palette.ink;
  };

  const hoverBg = () => {
    if (p.disabled) return undefined;
    switch (variant()) {
      case "primary":
        return palette.accentHover;
      case "danger":
        return palette.dangerHover;
      case "ghost":
        return palette.navHover;
      default:
        return palette.subtle;
    }
  };

  return (
    <Button
      testID={p.id}
      onPress={p.onPress}
      disabled={p.disabled}
      class="flex-row items-center justify-center gap-1.5"
      style={{
        height: height(),
        paddingHorizontal: paddingHorizontal(),
        width: p.fullWidth ? "100%" : undefined,
        borderRadius: metrics.radiusControl,
        borderCurve: "continuous",
        borderWidth: (isFilled() && !p.disabled) || variant() === "ghost" ? 0 : 1,
        borderColor: borderColor(),
        backgroundColor: bg(),
        boxShadow: variant() === "secondary" && !p.disabled ? metrics.shadowControl : "none",
        transitionProperty: "background-color, border-color, opacity",
        transitionDuration: 150,
        transitionTimingFunction: "ease-out",
      }}
      hoverStyle={hoverBg() ? { backgroundColor: hoverBg() } : undefined}
      activeStyle={p.disabled ? undefined : { opacity: 0.85 }}
      disabledStyle={isFilled() ? { opacity: 1 } : { opacity: 0.48 }}
    >
      {p.icon ? <Icon name={p.icon} color={fg()} size={iconSize()} /> : null}
      <Text style={{ fontSize: fontSize(), color: fg(), fontWeight: "500", numberOfLines: 1 }}>{p.label}</Text>
    </Button>
  );
}

export function IconButton(p: {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  active?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const box = () => p.size ?? 28;
  return (
    <Button
      testID={p.id}
      onPress={p.onPress}
      disabled={p.disabled}
      accessibilityLabel={p.accessibilityLabel}
      class="items-center justify-center"
      style={{
        width: box(),
        height: box(),
        borderRadius: metrics.radiusControl,
        borderCurve: "continuous",
        backgroundColor: p.active ? palette.navActive : "transparent",
        transitionProperty: "background-color, opacity",
        transitionDuration: 150,
      }}
      hoverStyle={p.disabled ? undefined : { backgroundColor: palette.navHover }}
      activeStyle={p.disabled ? undefined : { opacity: 0.72 }}
      disabledStyle={{ opacity: 0.4 }}
    >
      <Icon name={p.icon} size={p.iconSize ?? 16} color={p.color ?? palette.inkSecondary} />
    </Button>
  );
}

export function NavItem(p: {
  label: string;
  icon: IconName;
  count?: number;
  active: boolean;
  onPress: () => void;
  id?: string;
}) {
  return (
    <Button
      testID={p.id}
      onPress={p.onPress}
      class="flex-row items-center justify-between px-2.5"
      style={{
        height: 32,
        borderRadius: metrics.radiusControl,
        borderCurve: "continuous",
        backgroundColor: p.active ? palette.navActive : "transparent",
        transitionProperty: "background-color",
        transitionDuration: 150,
      }}
      hoverStyle={p.active ? undefined : { backgroundColor: palette.navHover }}
      activeStyle={{ opacity: 0.78 }}
    >
      <View class="flex-row items-center gap-2 flex-1" style={{ minWidth: 0 }}>
        <Icon name={p.icon} size={15} color={p.active ? palette.ink : palette.inkMuted} />
        <Text
          style={{
            fontSize: 13,
            fontWeight: p.active ? "500" : "400",
            color: p.active ? palette.ink : palette.inkSecondary,
            numberOfLines: 1,
          }}
        >
          {p.label}
        </Text>
      </View>
      {p.count !== undefined ? (
        <Text
          style={{
            fontSize: 12,
            fontWeight: p.active ? "500" : "400",
            color: p.active ? palette.ink : palette.inkMuted,
            fontVariant: ["tabular-nums"],
          }}
        >
          {String(p.count)}
        </Text>
      ) : null}
    </Button>
  );
}

export function Banner(p: {
  tone: "info" | "danger";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const isDanger = () => p.tone === "danger";
  return (
    <View
      class="flex-row items-center justify-between gap-3 px-3.5 py-2.5"
      style={{
        borderRadius: metrics.radiusBanner,
        borderCurve: "continuous",
        backgroundColor: isDanger() ? palette.dangerSoft : palette.bannerBg,
        borderWidth: isDanger() ? 1 : 0,
        borderColor: isDanger() ? palette.dangerBorder : "transparent",
      }}
    >
      <View class="flex-row items-center gap-2.5 flex-1" style={{ minWidth: 0 }}>
        <Icon
          name={isDanger() ? "danger" : "info"}
          size={16}
          color={isDanger() ? palette.danger : palette.inkSecondary}
        />
        <Text
          style={{
            fontSize: 13,
            color: isDanger() ? palette.dangerText : palette.ink,
            flex: 1,
            numberOfLines: 2,
          }}
        >
          {p.message}
        </Text>
      </View>
      {p.actionLabel && p.onAction ? (
        <Button
          onPress={p.onAction}
          class="px-2 py-1"
          style={{ borderRadius: metrics.radiusSmall, borderCurve: "continuous" }}
          hoverStyle={{ backgroundColor: palette.navActive }}
          activeStyle={{ opacity: 0.75 }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: "500", color: palette.accent }}>{p.actionLabel}</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function size(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (bytes >= 1024 && index < 4) {
    bytes /= 1024;
    index++;
  }
  return `${bytes.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function displayPath(path: string) {
  return path.replace(/^\\\\\?\\/, "");
}

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

export function shortDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export function fileCategory(name: string): FileCategory {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (/^(png|jpe?g|webp|gif|bmp|heic|svg|ico)$/.test(ext)) return "image";
  if (/^(mp4|mov|avi|mkv|webm|wmv|mp3|wav|aac|flac|m4a|ogg|silk|amr)$/.test(ext)) return "media";
  if (/^(pdf|docx?|xlsx?|pptx?|txt|md|csv|rtf|wps|zip|rar|7z)$/.test(ext)) return "document";
  return "other";
}

export function categoryIcon(category: FileCategory): IconName {
  switch (category) {
    case "image":
      return "gallery";
    case "media":
      return "video";
    case "document":
      return "file";
    default:
      return "archive";
  }
}
