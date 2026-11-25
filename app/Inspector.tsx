import { Image, Text, View } from "nsh";
import { Button } from "nsh/base";
import { Action, displayPath, Icon, palette, size } from "./ui";
import type { Row } from "./types";

type InspectorProps = {
  file: Row;
  preview: string | null;
  previewNote: string;
  onClose: () => void;
  onReveal: (id: number) => void;
};

function MetaField(p: { label: string; value: string; lines?: number }) {
  return <View class="gap-1">
    <Text style={{ fontSize: 12, color: palette.inkMuted }}>{p.label}</Text>
    <Text style={{ fontSize: 13, color: palette.ink, numberOfLines: p.lines ?? 1 }}>{p.value}</Text>
  </View>;
}

/** Side drawer showing thumbnail preview and structured metadata for the focused file. */
export function Inspector(p: InspectorProps) {
  return <View class="p-5 gap-4" style={{ width: 300, backgroundColor: palette.surface, borderLeftWidth: 1, borderLeftColor: palette.border }}>
    <View class="flex-row items-center justify-between">
      <Text style={{ fontSize: 14, fontWeight: "500", color: palette.ink }}>文件详情</Text>
      <Button onPress={p.onClose} class="hover:opacity-70" style={{ paddingVertical: 2, paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 13, color: palette.inkSecondary }}>收起</Text>
      </Button>
    </View>

    <View class="items-center justify-center rounded-md" style={{ height: 168, backgroundColor: palette.previewBg }}>
      {p.preview
        ? <Image testID="image-preview" src={p.preview} style={{ width: 248, height: 156, objectFit: "contain" }} />
        : <Icon name="file" size={48} color={palette.inkMuted} />}
    </View>

    <View class="gap-1">
      <Text style={{ fontSize: 14, fontWeight: "500", color: palette.ink, numberOfLines: 2 }}>{p.file.name}</Text>
      {p.previewNote ? <Text style={{ fontSize: 12, color: palette.danger }}>{p.previewNote}</Text> : null}
    </View>

    <View class="gap-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: palette.borderSubtle }}>
      <View class="flex-row gap-4">
        <View class="flex-1"><MetaField label="大小" value={size(p.file.size)} /></View>
        <View class="flex-1"><MetaField label="分组" value={`第 ${p.file.groupIndex} 组 · 共 ${p.file.groupCount} 份`} /></View>
      </View>
      <MetaField label="修改时间" value={new Date(p.file.modified_ms).toLocaleString()} />
      <MetaField label="位置" value={displayPath(p.file.path)} lines={4} />
    </View>

    <View style={{ marginTop: "auto" }}>
      <Action label="打开文件位置" icon="folder" fullWidth onPress={() => p.onReveal(p.file.id)} />
    </View>
  </View>;
}
