import { Image, Scroll, Text, View, windowSize } from "nsh";
import { Button } from "nsh/base";
import type { Row } from "./types";
import { ActionButton, categoryIcon, displayPath, Icon, metrics, palette, shortDate, size } from "./ui";

type InspectorProps = {
  file: Row;
  preview: string | null;
  previewNote: string;
  onClose: () => void;
  onReveal: (id: number) => void;
};

function MetaRow(p: { label: string; value: string; lines?: number; first?: boolean }) {
  return (
    <View
      class="px-3.5 py-2.5 gap-1"
      style={{ borderTopWidth: p.first ? 0 : 1, borderTopColor: palette.borderSubtle }}
    >
      <Text style={{ fontSize: 12, color: palette.inkMuted }}>{p.label}</Text>
      <Text style={{ fontSize: 12.5, color: palette.ink, numberOfLines: p.lines ?? 2, fontVariant: ["tabular-nums"] }}>
        {p.value}
      </Text>
    </View>
  );
}

/** Side drawer showing thumbnail preview and structured metadata for the focused file. */
export function Inspector(p: InspectorProps) {
  const width = () => (windowSize().width >= 1020 ? 296 : 268);

  return (
    <View
      style={{
        width: width(),
        backgroundColor: palette.sidebar,
        borderLeftWidth: 1,
        borderLeftColor: palette.border,
      }}
    >
      <View
        class="flex-row items-center justify-between px-4"
        style={{ height: 44, borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}
      >
        <Text style={{ fontSize: 13.5, fontWeight: "600", color: palette.ink }}>文件详情</Text>
        <Button
          onPress={p.onClose}
          class="flex-row items-center gap-1 px-2 py-1"
          style={{ borderRadius: metrics.radiusSmall, borderCurve: "continuous" }}
          hoverStyle={{ backgroundColor: palette.navHover }}
          activeStyle={{ opacity: 0.72 }}
        >
          <Icon name="panelRightClose" size={14} color={palette.inkSecondary} />
          <Text style={{ fontSize: 12.5, color: palette.inkSecondary, fontWeight: "500" }}>收起</Text>
        </Button>
      </View>

      <Scroll class="flex-1 p-4" style={{ minHeight: 0 }}>
        <View class="gap-4">
          <View
            class="items-center justify-center overflow-hidden"
            style={{
              height: 164,
              borderRadius: metrics.radiusCard,
              borderCurve: "continuous",
              backgroundColor: palette.inset,
              borderWidth: 1,
              borderColor: palette.border,
            }}
          >
            {p.preview ? (
              <Image testID="image-preview" src={p.preview} style={{ width: 244, height: 152, objectFit: "contain" }} />
            ) : (
              <Icon name={categoryIcon(p.file.category)} size={40} color={palette.inkMuted} />
            )}
          </View>

          <View class="gap-1">
            <Text style={{ fontSize: 14, fontWeight: "600", color: palette.ink, numberOfLines: 2 }}>{p.file.name}</Text>
            {p.previewNote ? <Text style={{ fontSize: 12, color: palette.danger }}>{p.previewNote}</Text> : null}
          </View>

          <View
            style={{
              backgroundColor: palette.canvas,
              borderRadius: metrics.radiusCard,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: palette.border,
            }}
          >
            <MetaRow first label="大小" value={size(p.file.size)} />
            <MetaRow label="分组" value={`第 ${p.file.groupIndex} 组 · 共 ${p.file.groupCount} 份`} />
            <MetaRow label="修改时间" value={shortDate(p.file.modified_ms)} />
            <MetaRow label="位置" value={displayPath(p.file.path)} lines={5} />
          </View>
        </View>
      </Scroll>

      <View class="px-4 py-3" style={{ borderTopWidth: 1, borderTopColor: palette.border }}>
        <ActionButton label="打开文件位置" icon="folder" fullWidth onPress={() => p.onReveal(p.file.id)} />
      </View>
    </View>
  );
}
