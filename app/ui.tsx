import { Image, Text } from "nsh";
import { Button } from "nsh/base";
import folder from "../assets/icons/solar/folder-open.svg";
import search from "../assets/icons/solar/magnifier.svg";
import copy from "../assets/icons/solar/copy.svg";
import shield from "../assets/icons/solar/shield-check.svg";
import trash from "../assets/icons/solar/trash-bin-minimalistic.svg";
import stop from "../assets/icons/solar/stop-circle.svg";
import info from "../assets/icons/solar/info-circle.svg";
import file from "../assets/icons/solar/file-text.svg";
import check from "../assets/icons/solar/check-circle.svg";

const icons = { folder, search, copy, shield, trash, stop, info, file, check };
export type IconName = keyof typeof icons;
export function Icon(p: { name: IconName; color?: string; size?: number }) {
  return <Image src={icons[p.name]} style={{ width: p.size ?? 20, height: p.size ?? 20, tintColor: p.color ?? "#52645b" }} />;
}

/** Shared buttons keep focus, hover and disabled states visible in native controls. */
export function Action(p: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean; id?: string }) {
  return <Button testID={p.id} onPress={p.onPress} disabled={p.disabled}
    class="flex-row items-center justify-center gap-2 rounded-md px-4 py-2 hover:opacity-80 active:opacity-60 disabled:opacity-40"
    style={{ minHeight: 38, borderWidth: p.primary ? 0 : 1, borderColor: "#cbd1cd", backgroundColor: p.primary ? (p.danger ? "#963c37" : "#2d5141") : "#ffffff" }}>
    {p.icon ? <Icon name={p.icon} color={p.primary ? "#ffffff" : "#52645b"} size={18} /> : null}
    <Text style={{ fontSize: 14, color: p.primary ? "#ffffff" : "#26332c", fontWeight: "500" }}>{p.label}</Text>
  </Button>;
}

export function size(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (bytes >= 1024 && index < 4) { bytes /= 1024; index++; }
  return `${bytes.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
export function displayPath(path: string) { return path.replace(/^\\\\\?\\/, ""); }
