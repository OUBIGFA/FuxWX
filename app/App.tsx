import { cleanup, computed, List, mount, signal, Text, View } from "nsh";
import { AlertDialog, Button, Checkbox, Input, TitleBar } from "nsh/base";
import { Window } from "nsh/desktop";
import { Cleaner } from "fuxwx-native";
import { Footer } from "./Footer";
import { Inspector } from "./Inspector";
import { Sidebar, type SidebarCounts } from "./Sidebar";
import type { Group, Row, Scan, SortKey, Status, ViewFilter } from "./types";
import {
  ActionButton,
  Banner,
  categoryIcon,
  displayPath,
  fileCategory,
  Icon,
  IconButton,
  metrics,
  palette,
  relativeDir,
  shortDate,
  size,
} from "./ui";

async function request<T>(route: string, payload: unknown = null): Promise<T> {
  return JSON.parse(await Cleaner.request(route, JSON.stringify(payload)));
}

const viewMeta: Record<ViewFilter, { title: string; subtitle: string }> = {
  all: { title: "全部重复", subtitle: "按内容完整校验的重复文件分组" },
  selected: { title: "待清理", subtitle: "已标记待移除的重复副本" },
  unselected: { title: "未选择", subtitle: "尚未决定保留哪一份的重复组" },
  image: { title: "图片", subtitle: "重复的图片与截图文件" },
  document: { title: "文档", subtitle: "重复的文档与压缩文件" },
  media: { title: "音视频", subtitle: "重复的音频与视频文件" },
  other: { title: "其他", subtitle: "其他类型的重复文件" },
};

const sortLabels: Record<SortKey, string> = {
  reclaimable: "按可释放空间",
  count: "按副本数量",
  name: "按文件名称",
};

const sortOrder: SortKey[] = ["reclaimable", "count", "name"];

function App() {
  const path = signal("");
  const query = signal("");
  const activeView = signal<ViewFilter>("all");
  const sortKey = signal<SortKey>("reclaimable");
  const sidebarOpen = signal(true);
  const result = signal<Scan | null>(null);
  const selected = signal<Set<number>>(new Set());
  const focused = signal<Row | null>(null);
  const preview = signal<string | null>(null);
  const previewNote = signal("");
  const mode = signal<"recycle" | "permanent">("recycle");
  const message = signal("");
  const status = signal<Status>({
    busy: false,
    phase: "准备就绪",
    done: 0,
    total: 0,
    revision: 0,
    error: null,
    summary: null,
  });
  const waiting = signal(false);
  const busy = computed(() => status().busy || waiting());
  const groups = computed(() => result()?.groups ?? []);

  const groupSelectedCounts = computed(() => {
    const counts = new Map<string, number>();
    const sel = selected();
    for (const g of groups()) {
      let n = 0;
      for (const f of g.files) {
        if (sel.has(f.id)) n++;
      }
      if (n > 0) counts.set(g.hash, n);
    }
    return counts;
  });

  const sortedGroups = computed<Group[]>(() => {
    const list = [...groups()];
    const key = sortKey();
    if (key === "count") {
      list.sort(
        (a, b) =>
          b.files.length - a.files.length ||
          b.size * (b.files.length - 1) - a.size * (a.files.length - 1),
      );
    } else if (key === "name") {
      list.sort((a, b) => (a.files[0]?.name ?? "").localeCompare(b.files[0]?.name ?? ""));
    }
    return list;
  });

  const sidebarCounts = computed<SidebarCounts>(() => {
    const list = groups();
    const selCounts = groupSelectedCounts();
    let unselectedGroups = 0;
    let image = 0;
    let document = 0;
    let media = 0;
    let other = 0;
    for (const g of list) {
      if ((selCounts.get(g.hash) ?? 0) === 0) unselectedGroups++;
      const cat = fileCategory(g.files[0]?.name ?? "");
      if (cat === "image") image++;
      else if (cat === "document") document++;
      else if (cat === "media") media++;
      else other++;
    }
    return {
      all: list.length,
      selectedFiles: selected().size,
      unselectedGroups,
      image,
      document,
      media,
      other,
    };
  });

  const rows = computed<Row[]>(() => {
    const search = query().trim().toLowerCase();
    const view = activeView();
    const sel = selected();
    const selCounts = groupSelectedCounts();
    const list = sortedGroups();

    const flattened: Row[] = [];
    let visibleGroupCount = 0;

    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (view === "unselected" && (selCounts.get(g.hash) ?? 0) > 0) continue;
      if (view === "selected" && (selCounts.get(g.hash) ?? 0) === 0) continue;
      if (view === "image" || view === "document" || view === "media" || view === "other") {
        const cat = fileCategory(g.files[0]?.name ?? "");
        if (cat !== view) continue;
      }

      const matchedFiles = g.files.filter((f) => {
        if (view === "selected" && !sel.has(f.id)) return false;
        if (search && !f.path.toLowerCase().includes(search) && !f.name.toLowerCase().includes(search)) return false;
        return true;
      });
      if (!matchedFiles.length) continue;

      const isFirstGroup = visibleGroupCount === 0;
      visibleGroupCount++;

      for (let idx = 0; idx < matchedFiles.length; idx++) {
        const f = matchedFiles[idx];
        flattened.push({
          ...f,
          group: g.hash,
          groupIndex: i + 1,
          groupCount: g.files.length,
          first: idx === 0,
          last: idx === matchedFiles.length - 1,
          isFirstGroup,
          isVeryLast: false,
          category: fileCategory(f.name),
        });
      }
    }

    if (flattened.length > 0) {
      flattened[flattened.length - 1].isVeryLast = true;
    }
    return flattened;
  });

  const selectedBytes = computed(() => {
    const sel = selected();
    let sum = 0;
    for (const g of groups()) {
      for (const f of g.files) {
        if (sel.has(f.id)) sum += f.size;
      }
    }
    return sum;
  });

  const reclaimable = computed(() => groups().reduce((sum, g) => sum + g.size * (g.files.length - 1), 0));

  let revision = -1;
  let polling = false;
  let disposed = false;
  let pathTouched = false;

  async function poll() {
    if (polling || disposed) return;
    polling = true;
    try {
      const next = await request<Status>("status");
      if (disposed) return;
      status.set(next);
      if (next.revision !== revision && !next.busy) {
        const scan = await request<Scan | null>("results");
        if (disposed) return;
        result.set(scan);
        revision = next.revision;
        selected.set(new Set());
        focused.set(null);
        if (scan && scan.groups.length > 0 && activeView() === "selected") {
          activeView.set("all");
        }
      }
    } catch (e) {
      if (!disposed) message.set(String(e));
    } finally {
      polling = false;
    }
  }

  // A fixed polling rate bounds UI updates independently of the number of files.
  const timer = setInterval(poll, 150);
  cleanup(() => {
    disposed = true;
    clearInterval(timer);
  });
  request<string | null>("default")
    .then((value) => {
      if (value && !disposed && !pathTouched && !path()) path.set(value);
    })
    .catch((e) => message.set(String(e)));
  poll();
  // Initial window creation does not emit a bounds-change event in nsh.
  // This native action runs on the UI thread after the mount commit.
  Cleaner.syncWindowIcons();

  async function run(action: () => Promise<void>) {
    if (busy()) return;
    waiting.set(true);
    message.set("");
    try {
      await action();
      await poll();
    } catch (e) {
      message.set(String(e));
    } finally {
      waiting.set(false);
    }
  }

  const chooseFolder = () =>
    run(async () => {
      const chosen = await request<string | null>("folder");
      if (chosen) {
        pathTouched = true;
        path.set(chosen);
      }
    });

  const startScan = () =>
    run(async () => {
      if (!path().trim()) {
        message.set("请选择或输入需要扫描的文件夹");
        return;
      }
      result.set(null);
      await request("scan", path().trim());
      status.set({ ...status(), busy: true, phase: "正在读取文件夹", summary: null, error: null });
      selected.set(new Set());
      focused.set(null);
    });

  function toggle(row: Row) {
    if (busy()) return;
    const next = new Set(selected());
    if (next.has(row.id)) next.delete(row.id);
    else {
      const group = groups().find((g) => g.hash === row.group)!;
      if (group.files.filter((f) => !next.has(f.id)).length <= 1) {
        message.set("每组至少保留一个文件，可点击其他文件的“保留这份”更换");
        return;
      }
      next.add(row.id);
    }
    selected.set(next);
    message.set("");
  }

  function keep(row: Row) {
    if (busy()) return;
    const group = groups().find((g) => g.hash === row.group)!;
    const next = new Set(selected());
    group.files.forEach((f) => (f.id === row.id ? next.delete(f.id) : next.add(f.id)));
    selected.set(next);
    message.set("");
  }

  function selectDuplicates() {
    selected.set(new Set(groups().flatMap((g) => g.files.slice(1).map((f) => f.id))));
    message.set("");
  }

  function cycleSort() {
    const idx = sortOrder.indexOf(sortKey());
    sortKey.set(sortOrder[(idx + 1) % sortOrder.length]);
  }

  async function focusFile(row: Row) {
    focused.set(row);
    preview.set(null);
    previewNote.set("");
    if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(row.name)) return;
    previewNote.set("正在读取预览");
    try {
      const data = await request<string>("preview", row.id);
      if (focused()?.id === row.id) {
        preview.set(data);
        previewNote.set("");
      }
    } catch (e) {
      if (focused()?.id === row.id) previewNote.set(String(e));
    }
  }

  const clean = () =>
    run(async () => {
      const ids = [...selected()];
      if (!ids.length) return;
      const chosen = mode();
      const label = chosen === "recycle" ? "移到回收站" : "彻底删除";
      const answer = await AlertDialog.show({
        title: `${label} ${ids.length} 个文件？`,
        description: `共 ${size(selectedBytes())}\n${
          chosen === "recycle" ? "可以从系统回收站恢复，每组仍保留至少一份" : "此操作不经过回收站，删除后无法从回收站恢复"
        }`,
        actions: [
          { id: "cancel", label: "取消", role: "cancel" },
          { id: "clean", label, role: "destructive" },
        ],
      });
      if (answer.action !== "clean") return;
      await request("clean", { ids, mode: chosen });
      status.set({ ...status(), busy: true, phase: "准备清理", summary: null, error: null });
    });

  async function showDetails() {
    try {
      const report = await request<{ failed: { path: string; reason: string }[] } | null>("report");
      const failures = report?.failed ?? result()?.skipped ?? [];
      await AlertDialog.show({
        title: "处理详情",
        description: failures.length
          ? failures
              .slice(0, 15)
              .map((f) => `${displayPath(f.path)}\n${f.reason}`)
              .join("\n\n") + (failures.length > 15 ? `\n另有 ${failures.length - 15} 项` : "")
          : "没有失败项目",
        actions: [{ id: "ok", label: "知道了" }],
      });
    } catch (e) {
      message.set(String(e));
    }
  }

  const hasFilters = () => Boolean(query().trim()) || activeView() !== "all";
  const currentMeta = () => viewMeta[activeView()];

  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      {/* Integrated custom window title bar keeping clear of native caption controls */}
      <TitleBar
        style={{
          height: 38,
          backgroundColor: palette.chrome,
          borderBottomWidth: 1,
          borderBottomColor: palette.border,
        }}
      >
        <View class="flex-1 flex-row items-center px-3 gap-2" style={{ minWidth: 0 }}>
          <IconButton
            id="toggle-sidebar"
            icon="panelLeftClose"
            accessibilityLabel="切换侧边栏"
            onPress={() => sidebarOpen.update((v) => !v)}
          />
          <View class="flex-row items-center gap-1.5" style={{ flexShrink: 0 }}>
            <Text style={{ fontSize: 12.5, color: palette.inkMuted }}>扫描工作区</Text>
            <Text style={{ fontSize: 12.5, color: palette.borderControl }}>/</Text>
            <Text style={{ fontSize: 12.5, fontWeight: "500", color: palette.ink }}>{currentMeta().title}</Text>
          </View>
          <View class="flex-1" />
          {busy() ? (
            <Text
              testID="titlebar-status"
              style={{
                fontSize: 12,
                color: palette.inkMuted,
                fontVariant: ["tabular-nums"],
                numberOfLines: 1,
                flexShrink: 1,
                marginRight: 4,
              }}
            >
              {`${status().phase || "正在处理"}${status().total ? ` · ${status().done} / ${status().total}` : ""}`}
            </Text>
          ) : null}
        </View>
      </TitleBar>

      {/* Main split workspace: Sidebar + Content + Optional Inspector */}
      <View class="flex-row flex-1" style={{ minHeight: 0 }}>
        {sidebarOpen() ? (
          <Sidebar
            query={query()}
            onQueryChange={(v) => query.set(v)}
            activeView={activeView()}
            onSelectView={(v) => activeView.set(v)}
            counts={sidebarCounts()}
            scannedCount={result() ? result()!.scanned : null}
            groupCount={groups().length}
            reclaimableBytes={reclaimable()}
          />
        ) : null}

        <View class="flex-1" style={{ minWidth: 0, backgroundColor: palette.canvas }}>
          {/* Workspace Header & Folder Bar */}
          <View
            class="px-6 pt-5 pb-4 gap-3.5"
            style={{ borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}
          >
            <View class="flex-row items-center justify-between gap-3">
              <View class="gap-0.5 flex-1" style={{ minWidth: 0 }}>
                <Text style={{ fontSize: 18, fontWeight: "600", color: palette.ink, numberOfLines: 1 }}>{currentMeta().title}</Text>
                <Text style={{ fontSize: 13, color: palette.inkMuted, fontVariant: ["tabular-nums"], numberOfLines: 1 }}>
                  {groups().length > 0
                    ? `共 ${groups().length} 组重复 · 可释放 ${size(reclaimable())}`
                    : currentMeta().subtitle}
                </Text>
              </View>

              {groups().length > 0 ? (
                <View class="flex-row items-center gap-2" style={{ flexShrink: 0 }}>
                  <ActionButton id="sort-groups" label={sortLabels[sortKey()]} icon="sort" size="sm" onPress={cycleSort} disabled={busy()} />
                  <ActionButton id="select-duplicates" label="选择重复项" size="sm" onPress={selectDuplicates} disabled={busy()} />
                  <ActionButton
                    label="清空选择"
                    size="sm"
                    onPress={() => selected.set(new Set())}
                    disabled={busy() || !selected().size}
                  />
                </View>
              ) : null}
            </View>

            {/* Folder Input + Scan Controls */}
            <View class="flex-row items-center gap-2">
              <View
                class="flex-1 flex-row items-center gap-2 px-3"
                style={{
                  height: 36,
                  minWidth: 0,
                  borderRadius: metrics.radiusControl,
                  borderCurve: "continuous",
                  backgroundColor: palette.canvas,
                  borderWidth: 1,
                  borderColor: palette.borderControl,
                }}
              >
                <Icon name="folder" size={16} color={palette.inkMuted} />
                <Input
                  testID="folder-path"
                  value={path()}
                  onChange={({ value }) => {
                    pathTouched = true;
                    path.set(value);
                  }}
                  onSubmit={startScan}
                  autoCorrect={false}
                  disabled={busy()}
                  placeholder="选择微信文件夹，或粘贴文件夹路径"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    color: palette.ink,
                    placeholderColor: palette.inkMuted,
                  }}
                />
              </View>
              <ActionButton label="选择文件夹" icon="folder" onPress={chooseFolder} disabled={busy()} />
              <ActionButton id="scan" label="开始扫描" icon="search" variant="primary" onPress={startScan} disabled={busy()} />
            </View>

            {status().busy && status().total > 0 ? (
              <View
                class="overflow-hidden"
                style={{ height: 4, borderRadius: 2, backgroundColor: palette.progressTrack }}
              >
                <View
                  style={{
                    height: 4,
                    width: `${Math.min(100, (status().done / status().total) * 100)}%`,
                    backgroundColor: palette.accent,
                    borderRadius: 2,
                  }}
                />
              </View>
            ) : null}

            {message() || status().error ? <Banner tone="danger" message={message() || status().error!} /> : null}

            {status().summary ? (
              <Banner
                tone="info"
                message={`成功 ${status().summary!.succeeded} 个 · 失败 ${status().summary!.failed} 个 · 未处理 ${status().summary!.pending} 个`}
                actionLabel="查看详情"
                onAction={showDetails}
              />
            ) : null}
          </View>

          {/* Virtualized Grouped-Card List or Empty State */}
          {rows().length ? (
            <List
              testID="files"
              each={rows()}
              keyExtractor={(item) => String(item.id)}
              estimatedItemSize={70}
              style={{ flex: 1 }}
            >
              {(row) => {
                const isSelected = () => selected().has(row().id);
                const isFocused = () => focused()?.id === row().id;
                const groupSel = () => groupSelectedCounts().get(row().group) ?? 0;
                const rowBg = () =>
                  isFocused()
                    ? palette.rowFocused
                    : isSelected()
                      ? mode() === "permanent"
                        ? palette.rowDanger
                        : palette.rowSelected
                      : palette.canvas;

                return (
                  <View style={{ paddingHorizontal: 24 }}>
                    {row().first ? (
                      <View
                        class="flex-row items-center justify-between px-4"
                        style={{
                          marginTop: row().isFirstGroup ? 16 : 12,
                          height: 36,
                          backgroundColor: palette.subtle,
                          borderTopLeftRadius: metrics.radiusCard,
                          borderTopRightRadius: metrics.radiusCard,
                          borderWidth: 1,
                          borderBottomWidth: 0,
                          borderColor: palette.border,
                        }}
                      >
                        <View class="flex-row items-center gap-2">
                          <Text style={{ fontSize: 12.5, fontWeight: "600", color: palette.ink }}>
                            {`第 ${row().groupIndex} 组`}
                          </Text>
                          <Text style={{ fontSize: 12, color: palette.inkMuted, fontVariant: ["tabular-nums"] }}>
                            {`${row().groupCount} 份相同 · 单份 ${size(row().size)}`}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: groupSel() > 0 ? "500" : "400",
                            color: groupSel() > 0 ? palette.accentText : palette.inkMuted,
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {groupSel() > 0
                            ? `待清理 ${groupSel()} 份 · 保留 ${row().groupCount - groupSel()} 份`
                            : "未选择"}
                        </Text>
                      </View>
                    ) : null}

                    <View
                      class="flex-row items-center px-4 py-2.5"
                      style={{
                        minHeight: 56,
                        gap: 12,
                        backgroundColor: rowBg(),
                        borderLeftWidth: 1,
                        borderRightWidth: 1,
                        borderTopWidth: 1,
                        borderBottomWidth: row().last ? 1 : 0,
                        borderColor: palette.border,
                        borderTopColor: row().first ? palette.border : palette.borderSubtle,
                        borderBottomLeftRadius: row().last ? metrics.radiusCard : 0,
                        borderBottomRightRadius: row().last ? metrics.radiusCard : 0,
                        marginBottom: row().isVeryLast ? 16 : 0,
                      }}
                    >
                      <Checkbox
                        testID={`select-${row().id}`}
                        checked={isSelected()}
                        disabled={busy()}
                        onChange={() => toggle(row())}
                        indicatorClass="items-center justify-center"
                        indicatorStyle={{
                          width: 18,
                          height: 18,
                          borderRadius: metrics.radiusSmall,
                          borderWidth: 1,
                          borderColor: isSelected()
                            ? mode() === "permanent"
                              ? palette.danger
                              : palette.accent
                            : palette.borderControl,
                          backgroundColor: isSelected()
                            ? mode() === "permanent"
                              ? palette.danger
                              : palette.accent
                            : palette.canvas,
                        }}
                        indicator={isSelected() ? <Icon name="check" color="#ffffff" size={14} /> : null}
                      />

                      <View
                        class="items-center justify-center"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          borderCurve: "continuous",
                          backgroundColor: palette.inset,
                        }}
                      >
                        <Icon name={categoryIcon(row().category)} size={16} color={palette.inkSecondary} />
                      </View>

                      <Button
                        testID={`file-${row().id}`}
                        onPress={() => focusFile(row())}
                        class="flex-1 gap-0.5"
                        style={{ minWidth: 0, alignItems: "flex-start" }}
                        hoverStyle={{ opacity: 0.85 }}
                      >
                        <Text
                          style={{
                            fontSize: 13.5,
                            color: palette.ink,
                            fontWeight: isFocused() ? "600" : "500",
                            numberOfLines: 1,
                            width: "100%",
                          }}
                        >
                          {row().name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: palette.inkMuted,
                            numberOfLines: 1,
                            textOverflow: "ellipsis-middle",
                            width: "100%",
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {`${relativeDir(row().path, result()?.root ?? "")} · ${shortDate(row().modified_ms)}`}
                        </Text>
                      </Button>

                      <View style={{ width: 88, alignItems: "flex-end" }}>
                        {isSelected() ? (
                          <Button
                            onPress={() => keep(row())}
                            disabled={busy()}
                            class="px-2.5 py-1"
                            style={{ borderRadius: metrics.radiusSmall }}
                            hoverStyle={{ backgroundColor: palette.navHover }}
                            activeStyle={{ opacity: 0.7 }}
                          >
                            <Text style={{ fontSize: 12.5, color: palette.inkSecondary, fontWeight: "500" }}>保留这份</Text>
                          </Button>
                        ) : groupSel() > 0 ? (
                          <View
                            class="px-2.5 py-1"
                            style={{
                              borderRadius: metrics.radiusSmall,
                              borderCurve: "continuous",
                              backgroundColor: palette.accentSoft,
                              borderWidth: 1,
                              borderColor: palette.accentBorder,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: "500", color: palette.accentText }}>已保留</Text>
                          </View>
                        ) : (
                          <Button
                            onPress={() => keep(row())}
                            disabled={busy()}
                            class="px-2.5 py-1"
                            style={{ borderRadius: metrics.radiusSmall }}
                            hoverStyle={{ backgroundColor: palette.accentSoft }}
                            activeStyle={{ opacity: 0.7 }}
                          >
                            <Text style={{ fontSize: 12.5, color: palette.accent, fontWeight: "500" }}>仅留此份</Text>
                          </Button>
                        )}
                      </View>
                    </View>
                  </View>
                );
              }}
            </List>
          ) : (
            <View class="flex-1 items-center justify-center gap-3.5 px-6">
              <View
                class="items-center justify-center"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  borderCurve: "continuous",
                  backgroundColor: palette.inset,
                  borderWidth: 1,
                  borderColor: palette.border,
                }}
              >
                <Icon name={result() && !hasFilters() ? "shield" : "copy"} size={28} color={palette.inkMuted} />
              </View>
              <View class="items-center gap-1">
                <Text style={{ fontSize: 16, fontWeight: "600", color: palette.ink }}>
                  {busy()
                    ? "正在检查文件，请稍候"
                    : result()
                      ? hasFilters()
                        ? "没有符合筛选条件的文件"
                        : "没有需要清理的重复文件"
                      : "选择文件夹，开始查找重复文件"}
                </Text>
                <Text style={{ fontSize: 13, color: palette.inkMuted, fontVariant: ["tabular-nums"] }}>
                  {busy()
                    ? `${status().phase || "准备中"}${status().total ? ` · ${status().done} / ${status().total}` : ""}`
                    : result()
                      ? hasFilters()
                        ? "尝试更换视图分类或清空筛选关键词"
                        : `已检查 ${result()!.scanned} 个文件`
                      : "每组至少保留一份文件，仅在你确认后执行清理"}
                </Text>
              </View>
              {result() && hasFilters() ? (
                <ActionButton
                  label="清除筛选"
                  size="sm"
                  onPress={() => {
                    query.set("");
                    activeView.set("all");
                  }}
                />
              ) : null}
            </View>
          )}

          {/* Bottom Cleanup Action Dock */}
          <View
            class="flex-row items-center justify-between gap-4 px-6 py-3"
            style={{
              borderTopWidth: 1,
              borderTopColor: palette.border,
              backgroundColor: palette.canvas,
            }}
          >
            <View class="gap-0.5 flex-1" style={{ minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 13.5,
                  fontWeight: selected().size ? "600" : "400",
                  color: selected().size ? palette.ink : palette.inkSecondary,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {selected().size ? `已选 ${selected().size} 个文件 · ${size(selectedBytes())}` : "未选择待清理文件"}
              </Text>
              {mode() === "permanent" ? (
                <Text style={{ fontSize: 12, color: palette.danger }}>彻底删除后无法从回收站恢复</Text>
              ) : null}
            </View>

            <View class="flex-row items-center gap-2.5">
              <View
                class="flex-row items-center"
                style={{
                  borderRadius: metrics.radiusControl,
                  borderCurve: "continuous",
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: palette.inset,
                  padding: 3,
                  gap: 2,
                }}
              >
                <Button
                  testID="recycle"
                  disabled={busy()}
                  onPress={() => mode.set("recycle")}
                  class="px-3"
                  style={{
                    height: 28,
                    justifyContent: "center",
                    borderRadius: metrics.radiusSmall,
                    borderCurve: "continuous",
                    backgroundColor: mode() === "recycle" ? palette.canvas : "transparent",
                    boxShadow: mode() === "recycle" ? metrics.shadowControl : "none",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: mode() === "recycle" ? "500" : "400",
                      color: mode() === "recycle" ? palette.ink : palette.inkSecondary,
                    }}
                  >
                    移到回收站
                  </Text>
                </Button>
                <Button
                  testID="permanent"
                  disabled={busy()}
                  onPress={() => mode.set("permanent")}
                  class="px-3"
                  style={{
                    height: 28,
                    justifyContent: "center",
                    borderRadius: metrics.radiusSmall,
                    borderCurve: "continuous",
                    backgroundColor: mode() === "permanent" ? palette.dangerSoft : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: mode() === "permanent" ? "500" : "400",
                      color: mode() === "permanent" ? palette.danger : palette.inkSecondary,
                    }}
                  >
                    彻底删除
                  </Text>
                </Button>
              </View>

              <ActionButton
                id="clean"
                label={selected().size ? `清理 ${selected().size} 个文件` : "清理所选"}
                icon="trash"
                variant={mode() === "permanent" ? "danger" : "primary"}
                disabled={busy() || !selected().size}
                onPress={clean}
              />
            </View>
          </View>
        </View>

        {focused() ? (
          <Inspector
            file={focused()!}
            preview={preview()}
            previewNote={previewNote()}
            onClose={() => focused.set(null)}
            onReveal={(id) => request("reveal", id).catch((e) => message.set(String(e)))}
          />
        ) : null}
      </View>

      <Footer
        status={status()}
        busy={busy()}
        skippedCount={result()?.skipped.length ?? 0}
        onCancel={() => request("cancel").catch((e) => message.set(String(e)))}
        onShowDetails={showDetails}
      />
    </View>
  );
}

mount(() => (
  <Window
    id="main"
    title="FuxWX"
    defaultSize={{ width: 1160, height: 780 }}
    minSize={{ width: 920, height: 640 }}
    restoreBounds
    titleBar={{ style: "hidden", height: 38 }}
    onBoundsChange={() => Cleaner.syncWindowIcons()}
    onDisplayChange={() => Cleaner.syncWindowIcons()}
  >
    {App}
  </Window>
));
