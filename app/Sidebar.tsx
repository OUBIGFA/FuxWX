import { Scroll, Text, View, windowSize } from "nsh";
import { Button, Input } from "nsh/base";
import type { ViewFilter } from "./types";
import { Icon, metrics, NavItem, palette, size } from "./ui";

export type SidebarCounts = {
  all: number;
  selectedFiles: number;
  unselectedGroups: number;
  image: number;
  document: number;
  media: number;
  other: number;
};

type SidebarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  activeView: ViewFilter;
  onSelectView: (view: ViewFilter) => void;
  counts: SidebarCounts;
  scannedCount: number | null;
  groupCount: number;
  reclaimableBytes: number;
};

function SectionLabel(p: { title: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "500", color: palette.inkMuted, paddingHorizontal: 10, marginBottom: 4 }}>
      {p.title}
    </Text>
  );
}

function SummaryStat(p: { label: string; value: string; accent?: boolean }) {
  return (
    <View class="flex-row items-center justify-between">
      <Text style={{ fontSize: 12, color: palette.inkMuted }}>{p.label}</Text>
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: "500",
          color: p.accent ? palette.accentText : palette.ink,
          fontVariant: ["tabular-nums"],
        }}
      >
        {p.value}
      </Text>
    </View>
  );
}

/** Left navigation and filtering sidebar inspired by modern desktop settings/workspace shells. */
export function Sidebar(p: SidebarProps) {
  const width = () => (windowSize().width >= 1020 ? 240 : 216);

  return (
    <View
      style={{
        width: width(),
        backgroundColor: palette.sidebar,
        borderRightWidth: 1,
        borderRightColor: palette.border,
      }}
    >
      {/* Search well */}
      <View class="p-3 pb-2">
        <View
          class="flex-row items-center gap-2 px-2.5"
          style={{
            height: 32,
            borderRadius: metrics.radiusControl,
            borderCurve: "continuous",
            backgroundColor: palette.canvas,
            borderWidth: 1,
            borderColor: palette.borderControl,
          }}
        >
          <Icon name="search" size={14} color={palette.inkMuted} />
          <Input
            testID="filter"
            value={p.query}
            onChange={({ value }) => p.onQueryChange(value)}
            autoCorrect={false}
            placeholder="筛选名称或路径"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12.5,
              color: palette.ink,
              placeholderColor: palette.inkMuted,
            }}
          />
          {p.query ? (
            <Button
              onPress={() => p.onQueryChange("")}
              accessibilityLabel="清空筛选"
              class="items-center justify-center"
              style={{ width: 18, height: 18, borderRadius: 4 }}
              hoverStyle={{ backgroundColor: palette.navHover }}
              activeStyle={{ opacity: 0.7 }}
            >
              <Text style={{ fontSize: 12, color: palette.inkMuted, fontWeight: "500" }}>×</Text>
            </Button>
          ) : null}
        </View>
      </View>

      {/* Navigation groups */}
      <Scroll class="flex-1 px-3 py-2" style={{ minHeight: 0 }}>
        <View class="gap-5">
          <View class="gap-0.5">
            <SectionLabel title="视图" />
            <NavItem
              id="nav-all"
              label="全部重复"
              icon="layers"
              count={p.counts.all}
              active={p.activeView === "all"}
              onPress={() => p.onSelectView("all")}
            />
            <NavItem
              id="nav-selected"
              label="待清理"
              icon="trash"
              count={p.counts.selectedFiles}
              active={p.activeView === "selected"}
              onPress={() => p.onSelectView("selected")}
            />
            <NavItem
              id="nav-unselected"
              label="未选择"
              icon="copy"
              count={p.counts.unselectedGroups}
              active={p.activeView === "unselected"}
              onPress={() => p.onSelectView("unselected")}
            />
          </View>

          <View class="gap-0.5">
            <SectionLabel title="文件类型" />
            <NavItem
              id="nav-image"
              label="图片"
              icon="gallery"
              count={p.counts.image}
              active={p.activeView === "image"}
              onPress={() => p.onSelectView("image")}
            />
            <NavItem
              id="nav-document"
              label="文档"
              icon="file"
              count={p.counts.document}
              active={p.activeView === "document"}
              onPress={() => p.onSelectView("document")}
            />
            <NavItem
              id="nav-media"
              label="音视频"
              icon="video"
              count={p.counts.media}
              active={p.activeView === "media"}
              onPress={() => p.onSelectView("media")}
            />
            <NavItem
              id="nav-other"
              label="其他"
              icon="archive"
              count={p.counts.other}
              active={p.activeView === "other"}
              onPress={() => p.onSelectView("other")}
            />
          </View>
        </View>
      </Scroll>

      {/* Bottom scan summary */}
      <View
        class="px-4 py-3.5 gap-2"
        style={{ borderTopWidth: 1, borderTopColor: palette.border }}
      >
        {p.scannedCount !== null ? (
          <View class="gap-1.5">
            <SummaryStat label="已扫描" value={`${p.scannedCount} 个文件`} />
            <SummaryStat label="重复组" value={`${p.groupCount} 组`} />
            <SummaryStat label="可释放" value={size(p.reclaimableBytes)} accent={p.reclaimableBytes > 0} />
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: palette.inkMuted, lineHeight: 18 }}>
            每组至少保留一份文件，清理前可核对并确认。
          </Text>
        )}
      </View>
    </View>
  );
}
