import { Image } from "nsh";
import archive from "../../assets/icons/solar/archive-minimalistic.svg";
import copy from "../../assets/icons/solar/copy.svg";
import danger from "../../assets/icons/solar/danger-triangle.svg";
import file from "../../assets/icons/solar/file-text.svg";
import video from "../../assets/icons/solar/file-video-camera.svg";
import folder from "../../assets/icons/solar/folder-open.svg";
import gallery from "../../assets/icons/solar/gallery.svg";
import info from "../../assets/icons/solar/info-circle.svg";
import layers from "../../assets/icons/solar/layers-minimalistic.svg";
import search from "../../assets/icons/solar/magnifier.svg";
import panelLeftClose from "../../assets/icons/solar/panel-left-close.svg";
import panelRightClose from "../../assets/icons/solar/panel-right-close.svg";
import refresh from "../../assets/icons/solar/refresh.svg";
import shield from "../../assets/icons/solar/shield-check.svg";
import sort from "../../assets/icons/solar/sort-vertical.svg";
import stop from "../../assets/icons/solar/stop-circle.svg";
import trash from "../../assets/icons/solar/trash-bin-minimalistic.svg";
import check from "../../assets/icons/solar/unread.svg";
import { palette } from "./tokens";

const icons = {
  archive,
  check,
  copy,
  danger,
  file,
  folder,
  gallery,
  info,
  layers,
  panelLeftClose,
  panelRightClose,
  refresh,
  search,
  shield,
  sort,
  stop,
  trash,
  video,
};

export type IconName = keyof typeof icons;

export function Icon(p: { name: IconName; color?: string; size?: number }) {
  const side = p.size ?? 16;
  return (
    <Image
      src={icons[p.name]}
      style={{ width: side, height: side, tintColor: p.color ?? palette.inkSecondary }}
    />
  );
}
