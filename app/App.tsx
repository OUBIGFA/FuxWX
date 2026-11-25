import { cleanup, computed, Image, List, mount, signal, Text, View } from "nsh";
import { AlertDialog, Button, Checkbox, Input } from "nsh/base";
import { Window } from "nsh/desktop";
import { Cleaner } from "fuxwx-native";
import { Action, displayPath, Icon, size } from "./ui";
import type { FileEntry, Group, Row, Scan, Status } from "./types";
import logo from "../assets/branding/FuxWX_logo.png";

async function request<T>(route: string, payload: unknown = null): Promise<T> {
  return JSON.parse(await Cleaner.request(route, JSON.stringify(payload)));
}

function App() {
  const path = signal("");
  const query = signal("");
  const result = signal<Scan | null>(null);
  const selected = signal<Set<number>>(new Set());
  const focused = signal<FileEntry | null>(null);
  const preview = signal<string | null>(null);
  const previewNote = signal("");
  const mode = signal<"recycle" | "permanent">("recycle");
  const message = signal("");
  const status = signal<Status>({ busy: false, phase: "准备就绪", done: 0, total: 0, revision: 0, error: null, summary: null });
  const waiting = signal(false);
  const busy = computed(() => status().busy || waiting());
  const groups = computed(() => result()?.groups ?? []);
  const allRows = computed<Row[]>(() => groups().flatMap((g, i) => g.files.map((f, n) => ({ ...f, group: g.hash, groupIndex: i + 1, first: n === 0 }))));
  const rows = computed(() => {
    const search = query().trim().toLowerCase();
    return search ? allRows().filter(f => f.path.toLowerCase().includes(search)) : allRows();
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
      await AlertDialog.show({ title: "处理详情", description: failures.length ? failures.slice(0, 15).map(f => `${displayPath(f.path)}\n${f.reason}`).join("\n\n") + (failures.length > 15 ? `\n另有 ${failures.length - 15} 项` : "") : "没有失败项目",
        actions: [{ id: "ok", label: "知道了" }] });
    } catch (e) { message.set(String(e)); }
  }
  const about = () => AlertDialog.show({ title: "关于 FuxWX", description: "FuxWX 0.1.0\n基于 WxCleaner · 原作者 yqxie\n原生界面 nsh · Apache-2.0\nSolar Linear 图标 · Solar Icons by 480 Design\n图标 CC BY 4.0 · 包装 Hakim Saoudi / MIT\nFuxWX · MIT 许可",
    actions: [{ id: "ok", label: "知道了" }] });

  return <View class="text-[#26332c]" style={{ flex: 1, backgroundColor: "#ffffff" }}>
    <View class="flex-row items-center justify-between px-7" style={{ height: 68, backgroundColor: "#eef2ef", borderBottomWidth: 1, borderBottomColor: "#cbd1cd" }}>
      <View class="flex-row items-center gap-3"><Image src={logo} style={{ width: 34, height: 34 }} /><Text style={{ fontSize: 24, fontWeight: "500" }}>FuxWX</Text><Text style={{ marginLeft: 12, color: "#5a665e" }}>重复文件清理</Text></View>
      <Action label="关于" icon="info" onPress={about} />
    </View>

    <View class="px-7 pt-5 pb-4 gap-3">
      <Text style={{ fontSize: 15, fontWeight: "500" }}>扫描文件夹</Text>
      <View class="flex-row items-center gap-3">
        <Input testID="folder-path" value={path()} onChange={({ value }) => { pathTouched = true; path.set(value); }} disabled={busy()}
          placeholder="选择微信文件夹，或粘贴文件夹路径" class="flex-1 rounded-md border px-3 py-2"
          style={{ height: 40, borderColor: "#bac5bd", fontSize: 14, backgroundColor: "#ffffff" }} />
        <Action label="选择文件夹" icon="folder" onPress={chooseFolder} disabled={busy()} />
        <Action label="开始扫描" id="scan" icon="search" onPress={startScan} disabled={busy()} primary />
      </View>
    </View>

    <View class="flex-row items-center justify-between px-7 pb-4" style={{ borderBottomWidth: 1, borderBottomColor: "#d6dcd7" }}>
      <View class="flex-row items-center gap-7">
        <View><Text style={{ color: "#5a665e", fontSize: 13 }}>重复组</Text><Text style={{ fontSize: 24 }}>{groups().length}</Text></View>
        <View><Text style={{ color: "#5a665e", fontSize: 13 }}>可清理</Text><Text style={{ fontSize: 24, color: "#2d5141" }}>{size(reclaimable())}</Text></View>
        <Text style={{ color: "#5a665e", marginLeft: 8 }}>每组保留一份，先核对再清理</Text>
      </View>
      <Input testID="filter" value={query()} onChange={({ value }) => query.set(value)} placeholder="筛选名称或路径"
        class="rounded-md border px-3 py-2" style={{ width: 230, height: 36, borderColor: "#cbd1cd", fontSize: 13 }} />
    </View>

    <View class="flex-row flex-1" style={{ minHeight: 0 }}>
      <View class="flex-1" style={{ minWidth: 0 }}>
        <View class="flex-row items-center justify-between px-7 py-3">
          <Text style={{ fontSize: 16, fontWeight: "500" }}>重复文件</Text>
          <View class="flex-row gap-2"><Action id="select-duplicates" label="选择重复项" onPress={selectDuplicates} disabled={busy() || !groups().length} /><Action label="清空选择" onPress={() => selected.set(new Set())} disabled={busy() || !selected().size} /></View>
        </View>
        <View class="flex-row items-center px-7 pb-2" style={{ gap: 12 }}>
          <Text style={{ width: 30, color: "#5a665e", fontSize: 13 }}>选择</Text>
          <Text style={{ flex: 1, color: "#5a665e", fontSize: 13 }}>文件名称 / 位置</Text>
          <Text style={{ width: 90, textAlign: "right", color: "#5a665e", fontSize: 13 }}>大小</Text>
          <Text style={{ width: 92, textAlign: "right", color: "#5a665e", fontSize: 13 }}>操作</Text>
        </View>
        {rows().length ? <List testID="files" each={rows()} estimatedItemSize={76} style={{ flex: 1 }}>
          {(row) => <View class="flex-row items-center px-7" style={{ height: 76, gap: 12, borderTopWidth: 1, borderTopColor: "#e0e4e1", backgroundColor: focused()?.id === row().id ? "#eef3ef" : "#ffffff" }}>
            <Checkbox testID={`select-${row().id}`} checked={selected().has(row().id)} disabled={busy()} onChange={() => toggle(row())}
              indicatorClass="size-5 rounded border items-center justify-center checked:bg-[#2d5141] checked:border-[#2d5141]" style={{ width: 30 }}
              indicator={selected().has(row().id) ? <Icon name="check" color="#ffffff" size={17} /> : null} />
            <Button testID={`file-${row().id}`} onPress={() => focusFile(row())} class="flex-1 gap-1" style={{ minWidth: 0, alignItems: "flex-start" }}>
              <View class="flex-row items-center gap-2"><Text style={{ color: "#6a746d", fontSize: 12 }}>{`组 ${row().groupIndex}`}</Text><Text style={{ fontSize: 14, numberOfLines: 1, flex: 1 }}>{row().name}</Text></View>
              <Text style={{ color: "#627068", fontSize: 12, numberOfLines: 1, textOverflow: "ellipsis-middle", width: "100%" }}>{displayPath(row().path)}</Text>
            </Button>
            <Text style={{ width: 90, textAlign: "right", fontSize: 13 }}>{size(row().size)}</Text>
            <Button onPress={() => keep(row())} disabled={busy()} style={{ width: 92, alignItems: "flex-end", paddingVertical: 10 }}>
              <Text style={{ color: selected().has(row().id) ? "#647268" : "#2d5141", fontSize: 13 }}>{selected().has(row().id) ? "保留这份" : "保留"}</Text>
            </Button>
          </View>}
        </List> : <View class="flex-1 items-center justify-center gap-4 px-7">
          <Icon name={result() ? "shield" : "copy"} size={46} color="#84978b" />
          <Text style={{ fontSize: 19, color: "#36483d" }}>{busy() ? "正在检查文件，请稍候" : result() ? (query() ? "没有符合筛选条件的文件" : "没有需要清理的重复文件") : "选择文件夹，开始查找重复文件"}</Text>
          <Text style={{ color: "#68756c", fontSize: 14 }}>{result() ? `已检查 ${result()!.scanned} 个文件` : "仅在你确认后清理文件"}</Text>
        </View>}
      </View>
      {focused() ? <View class="p-5 gap-4" style={{ width: 280, backgroundColor: "#f3f5f3", borderLeftWidth: 1, borderLeftColor: "#d6dcd7" }}>
        <View class="flex-row justify-between"><Text style={{ fontSize: 16, fontWeight: "500" }}>文件详情</Text><Button onPress={() => focused.set(null)}><Text style={{ color: "#5a665e" }}>收起</Text></Button></View>
        <View class="items-center justify-center" style={{ height: 150, backgroundColor: "#e5ebe6", borderRadius: 6 }}>
          {preview() ? <Image testID="image-preview" src={preview()!} onError={() => previewNote.set("无法显示此图片，请打开文件位置查看")} style={{ width: 230, height: 145, objectFit: "contain" }} /> : <Icon name="file" size={52} color="#768c7d" />}
        </View>
        <Text style={{ fontSize: 15, numberOfLines: 3 }}>{focused()!.name}</Text>
        {previewNote() ? <Text style={{ fontSize: 12, color: "#843c37" }}>{previewNote()}</Text> : null}
        <Text style={{ color: "#5a665e", fontSize: 13 }}>{size(focused()!.size)}</Text>
        <Text style={{ color: "#5a665e", fontSize: 13 }}>{new Date(focused()!.modified_ms).toLocaleString()}</Text>
        <Text style={{ color: "#5a665e", fontSize: 12, numberOfLines: 5 }}>{displayPath(focused()!.path)}</Text>
        <Action label="打开文件位置" icon="folder" onPress={() => request("reveal", focused()!.id).catch(e => message.set(String(e)))} />
      </View> : null}
    </View>

    <View class="px-7 py-4 gap-3" style={{ borderTopWidth: 1, borderTopColor: "#cbd1cd", backgroundColor: "#f3f5f3" }}>
      {message() || status().error ? <Text style={{ fontSize: 13, color: "#963c37", numberOfLines: 2 }}>{message() || status().error}</Text> : null}
      {status().summary ? <View class="flex-row items-center justify-between"><Text style={{ fontSize: 13 }}>{`成功 ${status().summary!.succeeded} 个 · 失败 ${status().summary!.failed} 个 · 未处理 ${status().summary!.pending} 个`}</Text><Button onPress={showDetails}><Text style={{ color: "#2d5141", fontSize: 13 }}>查看详情</Text></Button></View> : null}
      <View class="flex-row items-center justify-between gap-4">
        <View class="gap-1"><Text style={{ fontSize: 16 }}>{`已选 ${selected().size} 个文件 · ${size(selectedBytes())}`}</Text>
          <Text style={{ fontSize: 12, color: mode() === "permanent" ? "#963c37" : "#5a665e" }}>{mode() === "permanent" ? "彻底删除后无法从回收站恢复" : "回收站中的文件仍占用磁盘空间，可随时恢复"}</Text></View>
        <View class="flex-row items-center gap-3">
          <View class="flex-row rounded-md border" style={{ borderColor: "#bdc8c0", padding: 3 }}>
            <Button testID="recycle" disabled={busy()} onPress={() => mode.set("recycle")} class="rounded px-3 py-2" style={{ backgroundColor: mode() === "recycle" ? "#dce6df" : "transparent" }}><Text style={{ fontSize: 13 }}>移到回收站</Text></Button>
            <Button testID="permanent" disabled={busy()} onPress={() => mode.set("permanent")} class="rounded px-3 py-2" style={{ backgroundColor: mode() === "permanent" ? "#f0dfdd" : "transparent" }}><Text style={{ fontSize: 13, color: "#843c37" }}>彻底删除</Text></Button>
          </View>
          <Action id="clean" label={mode() === "recycle" ? "移到回收站" : "彻底删除"} icon="trash" primary danger={mode() === "permanent"} disabled={busy() || !selected().size} onPress={clean} />
        </View>
      </View>
      <View class="flex-row items-center justify-between">
        <Text style={{ fontSize: 12, color: "#5a665e" }}>{`${status().phase || "准备就绪"}${status().busy ? ` · ${status().done}${status().total ? ` / ${status().total}` : " 个文件"}` : ""}`}</Text>
        {busy() ? <Button testID="cancel" onPress={() => request("cancel").catch(e => message.set(String(e)))} class="flex-row items-center gap-2"><Icon name="stop" size={16} /><Text style={{ fontSize: 13 }}>停止任务</Text></Button> : result()?.skipped.length ? <Button onPress={showDetails}><Text style={{ fontSize: 12, color: "#843c37" }}>{`跳过 ${result()!.skipped.length} 项 · 查看原因`}</Text></Button> : <Text style={{ fontSize: 12, color: "#5a665e" }}>文件只在本机处理</Text>}
      </View>
      {status().busy && status().total > 0 ? <View style={{ height: 3, backgroundColor: "#d8e1da" }}><View style={{ height: 3, width: `${Math.min(100, status().done / status().total * 100)}%`, backgroundColor: "#467459" }} /></View> : null}
    </View>
  </View>;
}

mount(() => <Window id="main" title="FuxWX" defaultSize={{ width: 1160, height: 780 }} minSize={{ width: 920, height: 640 }}>{App}</Window>);
