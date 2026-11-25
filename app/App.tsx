import { cleanup, computed, List, mount, signal, Text, View } from "nsh";
import { AlertDialog, Button, Checkbox, Input } from "nsh/base";
import { Window } from "nsh/desktop";
import { Cleaner } from "fuxwx-native";
import { Action, displayPath, Icon, palette, relativeDir, size } from "./ui";
import type { Row, Scan, Status } from "./types";
import { Footer } from "./Footer";
import { Inspector } from "./Inspector";

async function request<T>(route: string, payload: unknown = null): Promise<T> {
  return JSON.parse(await Cleaner.request(route, JSON.stringify(payload)));
}

function App() {
  const path = signal("");
  const query = signal("");
  const result = signal<Scan | null>(null);
  const selected = signal<Set<number>>(new Set());
  const focused = signal<Row | null>(null);
  const preview = signal<string | null>(null);
  const previewNote = signal("");
  const mode = signal<"recycle" | "permanent">("recycle");
  const message = signal("");
  const status = signal<Status>({ busy: false, phase: "准备就绪", done: 0, total: 0, revision: 0, error: null, summary: null });
  const waiting = signal(false);
  const busy = computed(() => status().busy || waiting());
  const groups = computed(() => result()?.groups ?? []);
  const allRows = computed<Row[]>(() =>
    groups().flatMap((g, i) => g.files.map((f, n) => ({
      ...f,
      group: g.hash,
      groupIndex: i + 1,
      groupCount: g.files.length,
      first: n === 0,
    }))),
  );
  const rows = computed<Row[]>(() => {
    const search = query().trim().toLowerCase();
    const list = search ? allRows().filter(f => f.path.toLowerCase().includes(search)) : allRows();
    return list.map((item, idx) => ({ ...item, first: idx === 0 || list[idx - 1].group !== item.group }));
  });
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
  const selectedBytes = computed(() => allRows().reduce((sum, f) => sum + (selected().has(f.id) ? f.size : 0), 0));
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
        result.set(scan); revision = next.revision;
        selected.set(new Set()); focused.set(null);
      }
    } catch (e) { if (!disposed) message.set(String(e)); }
    finally { polling = false; }
  }
  // A fixed polling rate bounds UI updates independently of the number of files.
  const timer = setInterval(poll, 150);
  cleanup(() => { disposed = true; clearInterval(timer); });
  request<string | null>("default").then(value => { if (value && !disposed && !pathTouched && !path()) path.set(value); }).catch(e => message.set(String(e)));
  poll();
  // Initial window creation does not emit a bounds-change event in nsh 0.7.0.
  // This native action runs on the UI thread after the mount commit.
  Cleaner.syncWindowIcons();

  async function run(action: () => Promise<void>) {
    if (busy()) return;
    waiting.set(true); message.set("");
    try { await action(); await poll(); }
    catch (e) { message.set(String(e)); }
    finally { waiting.set(false); }
  }
  const chooseFolder = () => run(async () => {
    const chosen = await request<string | null>("folder");
    if (chosen) { pathTouched = true; path.set(chosen); }
  });
  const startScan = () => run(async () => {
    if (!path().trim()) { message.set("请选择或输入需要扫描的文件夹"); return; }
    result.set(null);
    await request("scan", path().trim());
    status.set({ ...status(), busy: true, phase: "正在读取文件夹", summary: null, error: null });
    selected.set(new Set()); focused.set(null);
  });
  function toggle(row: Row) {
    if (busy()) return;
    const next = new Set(selected());
    if (next.has(row.id)) next.delete(row.id);
    else {
      const group = groups().find(g => g.hash === row.group)!;
      if (group.files.filter(f => !next.has(f.id)).length <= 1) {
        message.set("每组至少保留一个文件，可点击其他文件的“保留这份”更换"); return;
      }
      next.add(row.id);
    }
    selected.set(next); message.set("");
  }
  function keep(row: Row) {
    if (busy()) return;
    const group = groups().find(g => g.hash === row.group)!;
    const next = new Set(selected());
    group.files.forEach(f => f.id === row.id ? next.delete(f.id) : next.add(f.id));
    selected.set(next); message.set("");
  }
  function selectDuplicates() {
    selected.set(new Set(groups().flatMap(g => g.files.slice(1).map(f => f.id))));
    message.set("");
  }
  async function focusFile(row: Row) {
    focused.set(row); preview.set(null); previewNote.set("");
    if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(row.name)) return;
    previewNote.set("正在读取预览");
    try {
      const data = await request<string>("preview", row.id);
      if (focused()?.id === row.id) { preview.set(data); previewNote.set(""); }
    } catch (e) { if (focused()?.id === row.id) previewNote.set(String(e)); }
  }
  const clean = () => run(async () => {
    const ids = [...selected()];
    if (!ids.length) return;
    // Capture the mode and selection before showing the system confirmation.
    const chosen = mode();
    const label = chosen === "recycle" ? "移到回收站" : "彻底删除";
    const answer = await AlertDialog.show({
      title: `${label} ${ids.length} 个文件？`,
      description: `共 ${size(selectedBytes())}\n${chosen === "recycle" ? "可以从系统回收站恢复，每组仍保留至少一份" : "此操作不经过回收站，删除后无法从回收站恢复"}`,
      actions: [{ id: "cancel", label: "取消", role: "cancel" }, { id: "clean", label, role: "destructive" }],
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
        description: failures.length ? failures.slice(0, 15).map(f => `${displayPath(f.path)}\n${f.reason}`).join("\n\n") + (failures.length > 15 ? `\n另有 ${failures.length - 15} 项` : "") : "没有失败项目",
        actions: [{ id: "ok", label: "知道了" }],
      });
    } catch (e) { message.set(String(e)); }
  }

  return <View style={{ flex: 1, backgroundColor: palette.bg }}>
    {/* Zone 1: Top command bar */}
    <View class="px-6 py-3.5" style={{ backgroundColor: palette.bg, borderBottomWidth: 1, borderBottomColor: palette.border }}>
      <View class="flex-row items-center gap-2.5">
        <Input testID="folder-path" value={path()} onChange={({ value }) => { pathTouched = true; path.set(value); }} onSubmit={startScan}
          autoCorrect={false} disabled={busy()} placeholder="选择微信文件夹，或粘贴文件夹路径"
          class="flex-1 rounded-md border px-3" style={{ height: 36, borderColor: palette.borderControl, fontSize: 13.5, backgroundColor: palette.bg, color: palette.ink }} />
        <Action label="选择文件夹" icon="folder" onPress={chooseFolder} disabled={busy()} />
        <Action label="开始扫描" id="scan" icon="search" onPress={startScan} disabled={busy()} primary />
      </View>
    </View>

    {/* Conditional progress or feedback banner directly under command bar */}
    {status().busy && status().total > 0
      ? <View style={{ height: 3, backgroundColor: palette.progressTrack }}>
          <View style={{ height: 3, width: `${Math.min(100, status().done / status().total * 100)}%`, backgroundColor: palette.accent }} />
        </View>
      : null}
    {message() || status().error
      ? <View class="px-6 py-2" style={{ backgroundColor: palette.infoErrorBg, borderBottomWidth: 1, borderBottomColor: palette.dangerSoft }}>
          <Text style={{ fontSize: 13, color: palette.danger, numberOfLines: 2 }}>{message() || status().error}</Text>
        </View>
      : null}
    {status().summary
      ? <View class="flex-row items-center justify-between px-6 py-2" style={{ backgroundColor: palette.infoSuccessBg, borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}>
          <Text style={{ fontSize: 13, color: palette.ink }}>{`成功 ${status().summary!.succeeded} 个 · 失败 ${status().summary!.failed} 个 · 未处理 ${status().summary!.pending} 个`}</Text>
          <Button onPress={showDetails} class="hover:opacity-75"><Text style={{ color: palette.accent, fontSize: 13, fontWeight: "500" }}>查看详情</Text></Button>
        </View>
      : null}

    {/* Zone 2: Main workspace */}
    <View class="flex-row flex-1" style={{ minHeight: 0 }}>
      <View class="flex-1" style={{ minWidth: 0 }}>
        {groups().length ? <View class="flex-row items-center justify-between gap-3 px-6" style={{ height: 46, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.bg }}>
          <View class="flex-row items-center gap-2">
            <Text style={{ fontSize: 13.5, fontWeight: "500", color: palette.ink }}>{`共 ${groups().length} 组重复`}</Text>
            <Text style={{ fontSize: 13.5, color: palette.borderControl }}>·</Text>
            <Text style={{ fontSize: 13.5, fontWeight: "500", color: palette.accent }}>{`可释放 ${size(reclaimable())}`}</Text>
          </View>
          <View class="flex-row items-center gap-2">
            <Input testID="filter" value={query()} onChange={({ value }) => query.set(value)} autoCorrect={false}
              placeholder="筛选名称或路径" class="rounded-md border px-2.5"
              style={{ width: 180, height: 32, borderColor: palette.borderControl, fontSize: 13, backgroundColor: palette.bg, color: palette.ink }} />
            <Action id="select-duplicates" label="选择重复项" compact onPress={selectDuplicates} disabled={busy()} />
            <Action label="清空选择" compact onPress={() => selected.set(new Set())} disabled={busy() || !selected().size} />
          </View>
        </View> : null}

        {rows().length ? <List testID="files" each={rows()} estimatedItemSize={64} style={{ flex: 1 }}>
          {(row) => {
            const isSelected = () => selected().has(row().id);
            const isFocused = () => focused()?.id === row().id;
            const groupSel = () => groupSelectedCounts().get(row().group) ?? 0;
            const rowBg = () => isFocused()
              ? palette.surfaceFocus
              : isSelected()
                ? (mode() === "permanent" ? palette.surfaceDangerTint : palette.surfaceSelected)
                : palette.bg;

            return <View>
              {row().first ? <View class="flex-row items-center justify-between px-6"
                style={{
                  height: 32,
                  backgroundColor: palette.surface,
                  borderTopWidth: row().groupIndex > 1 ? 1 : 0,
                  borderBottomWidth: 1,
                  borderColor: palette.borderSubtle,
                }}>
                <View class="flex-row items-center gap-2">
                  <Text style={{ fontSize: 12, fontWeight: "500", color: palette.ink }}>{`第 ${row().groupIndex} 组`}</Text>
                  <Text style={{ fontSize: 12, color: palette.inkMuted }}>{`${row().groupCount} 份相同 · 单份 ${size(row().size)}`}</Text>
                </View>
                <Text style={{ fontSize: 12, color: groupSel() > 0 ? palette.accent : palette.inkMuted }}>
                  {groupSel() > 0 ? `待清理 ${groupSel()} 份 · 保留 ${row().groupCount - groupSel()} 份` : "未选择"}
                </Text>
              </View> : null}

              <View class="flex-row items-center px-6"
                style={{
                  height: 58,
                  gap: 12,
                  borderTopWidth: row().first ? 0 : 1,
                  borderTopColor: palette.borderSubtle,
                  backgroundColor: rowBg(),
                }}>
                <Checkbox testID={`select-${row().id}`} checked={isSelected()} disabled={busy()} onChange={() => toggle(row())}
                  indicatorClass={`size-5 rounded border items-center justify-center ${mode() === "permanent" ? "checked:bg-[#9e3a33] checked:border-[#9e3a33]" : "checked:bg-[#244c3b] checked:border-[#244c3b]"}`}
                  style={{ width: 24 }}
                  indicator={isSelected() ? <Icon name="check" color="#ffffff" size={16} /> : null} />

                <Button testID={`file-${row().id}`} onPress={() => focusFile(row())} class="flex-1 gap-0.5" style={{ minWidth: 0, alignItems: "flex-start" }}>
                  <Text style={{ fontSize: 14, color: palette.ink, fontWeight: isFocused() ? "500" : "400", numberOfLines: 1, width: "100%" }}>{row().name}</Text>
                  <Text style={{ fontSize: 12, color: palette.inkMuted, numberOfLines: 1, textOverflow: "ellipsis-middle", width: "100%" }}>
                    {relativeDir(row().path, result()?.root ?? "")}
                  </Text>
                </Button>

                <View style={{ width: 84, alignItems: "flex-end" }}>
                  {isSelected()
                    ? <Button onPress={() => keep(row())} disabled={busy()} class="hover:opacity-75" style={{ paddingVertical: 6, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 12.5, color: palette.inkSecondary }}>保留这份</Text>
                      </Button>
                    : groupSel() > 0
                      ? <View class="rounded px-2.5 py-1" style={{ backgroundColor: palette.accentSoft }}>
                          <Text style={{ fontSize: 12, fontWeight: "500", color: palette.accent }}>已保留</Text>
                        </View>
                      : <Button onPress={() => keep(row())} disabled={busy()} class="hover:opacity-75" style={{ paddingVertical: 6, paddingHorizontal: 4 }}>
                          <Text style={{ fontSize: 12.5, color: palette.accent, fontWeight: "500" }}>仅留此份</Text>
                        </Button>}
                </View>
              </View>
            </View>;
          }}
        </List> : <View class="flex-1 items-center justify-center gap-3 px-6">
          <Icon name={result() && !query() ? "shield" : "copy"} size={42} color={palette.inkMuted} />
          <Text style={{ fontSize: 17, fontWeight: "500", color: palette.ink }}>
            {busy() ? "正在检查文件，请稍候" : result() ? (query() ? "没有符合筛选条件的文件" : "没有需要清理的重复文件") : "选择文件夹，开始查找重复文件"}
          </Text>
          <Text style={{ fontSize: 13, color: palette.inkMuted }}>
            {busy()
              ? `${status().phase || "准备中"}${status().total ? ` · ${status().done} / ${status().total}` : ""}`
              : result()
                ? (query() ? "尝试更换或清空筛选关键词" : `已检查 ${result()!.scanned} 个文件`)
                : "每组至少保留一份文件，仅在你确认后执行清理"}
          </Text>
          {result() && query() ? <Action label="清除筛选" compact onPress={() => query.set("")} /> : null}
        </View>}
      </View>

      {focused() ? <Inspector
        file={focused()!}
        preview={preview()}
        previewNote={previewNote()}
        onClose={() => focused.set(null)}
        onReveal={(id) => request("reveal", id).catch(e => message.set(String(e)))}
      /> : null}
    </View>

    {/* Zone 3: Bottom action bar + compact status footer */}
    <View style={{ borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.bg }}>
      <View class="flex-row items-center justify-between gap-4 px-6 py-3">
        <View class="gap-0.5 flex-1" style={{ minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: selected().size ? "500" : "400", color: selected().size ? palette.ink : palette.inkSecondary }}>
            {selected().size ? `已选 ${selected().size} 个文件 · ${size(selectedBytes())}` : "未选择待清理文件"}
          </Text>
          {mode() === "permanent"
            ? <Text style={{ fontSize: 12, color: palette.danger }}>彻底删除后无法从回收站恢复</Text>
            : null}
        </View>

        <View class="flex-row items-center gap-2.5">
          <View class="flex-row rounded-md border" style={{ borderColor: palette.border, backgroundColor: palette.surface, padding: 3, gap: 2 }}>
            <Button testID="recycle" disabled={busy()} onPress={() => mode.set("recycle")} class="rounded px-3 py-1.5"
              style={{ backgroundColor: mode() === "recycle" ? palette.bg : "transparent" }}>
              <Text style={{ fontSize: 13, fontWeight: mode() === "recycle" ? "500" : "400", color: mode() === "recycle" ? palette.ink : palette.inkSecondary }}>移到回收站</Text>
            </Button>
            <Button testID="permanent" disabled={busy()} onPress={() => mode.set("permanent")} class="rounded px-3 py-1.5"
              style={{ backgroundColor: mode() === "permanent" ? palette.dangerSoft : "transparent" }}>
              <Text style={{ fontSize: 13, fontWeight: mode() === "permanent" ? "500" : "400", color: mode() === "permanent" ? palette.danger : palette.inkSecondary }}>彻底删除</Text>
            </Button>
          </View>
          <Action id="clean" label={selected().size ? `清理 ${selected().size} 个文件` : "清理所选"} icon="trash" primary danger={mode() === "permanent"}
            disabled={busy() || !selected().size} onPress={clean} />
        </View>
      </View>

      <Footer
        status={status()}
        busy={busy()}
        skippedCount={result()?.skipped.length ?? 0}
        onCancel={() => request("cancel").catch(e => message.set(String(e)))}
        onShowDetails={showDetails}
      />
    </View>
  </View>;
}

mount(() => <Window id="main" title="FuxWX" defaultSize={{ width: 1160, height: 780 }} minSize={{ width: 920, height: 640 }}
  onBoundsChange={() => Cleaner.syncWindowIcons()} onDisplayChange={() => Cleaner.syncWindowIcons()}>{App}</Window>);
