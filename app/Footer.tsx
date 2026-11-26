import { cleanup, openUrl, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import config from "../nsh.json";
import type { Status } from "./types";
import { Icon, metrics, palette } from "./ui";

const repository = "https://github.com/OUBIGFA/FuxWX";
const latestRelease = "https://api.github.com/repos/OUBIGFA/FuxWX/releases/latest";

type FooterProps = {
  status: Status;
  busy: boolean;
  skippedCount: number;
  onCancel: () => void;
  onShowDetails: () => void;
};

/** Compact desktop status and repository utility bar. */
export function Footer(p: FooterProps) {
  const checking = signal(false);
  const note = signal("");
  const releaseUrl = signal("");
  let controller: AbortController | undefined;
  let closed = false;
  cleanup(() => {
    closed = true;
    controller?.abort();
  });

  async function visit(url: string) {
    try {
      if (!(await openUrl(url)).opened) note.set("无法打开浏览器，请复制仓库地址访问");
    } catch {
      note.set("无法打开浏览器，请复制仓库地址访问");
    }
  }

  async function checkUpdate() {
    if (checking()) return;
    checking.set(true);
    note.set("");
    releaseUrl.set("");
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 10000);
    try {
      const response = await fetch(latestRelease, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": `FuxWX/${config.version}` },
        signal: controller.signal,
      });
      if (closed) return;
      if (response.status === 404) {
        note.set("暂无正式发布版本");
        return;
      }
      if (!response.ok) {
        note.set(`检查失败（HTTP ${response.status}），请稍后重试`);
        return;
      }
      const release = await response.json();
      if (closed) return;
      // Only stable x.y.z releases count; prereleases never replace the test build.
      const match = typeof release.tag_name === "string" && /^v?(\d+)\.(\d+)\.(\d+)$/.exec(release.tag_name);
      if (!match || release.draft || release.prerelease) {
        note.set("发布版本号无法识别，请到仓库查看");
        return;
      }
      const newer = match.slice(1).map(Number);
      const current = config.version.split(".").map(Number);
      let comparison = 0;
      for (let i = 0; i < 3; i++) {
        if (newer[i] !== current[i]) {
          comparison = newer[i] - current[i];
          break;
        }
      }
      const version = newer.join(".");
      if (comparison > 0) {
        note.set(`发现新版本 ${version}`);
        // Build the link from the fixed repository, never from an untrusted response URL.
        releaseUrl.set(`${repository}/releases/tag/${encodeURIComponent(release.tag_name)}`);
      } else if (comparison === 0) note.set(`已是最新正式版本 ${config.version}`);
      else note.set(`当前版本 ${config.version} 高于最新正式版本 ${version}`);
    } catch {
      if (!closed) note.set("无法检查更新，请检查网络后重试");
    } finally {
      clearTimeout(timeout);
      if (!closed) checking.set(false);
    }
  }

  const statusText = () => {
    const phase = p.status.phase || "准备就绪";
    if (!p.status.busy) return phase;
    return `${phase} · ${p.status.done}${p.status.total ? ` / ${p.status.total}` : " 个文件"}`;
  };

  return (
    <View
      class="px-4 py-1.5 gap-1.5"
      style={{
        backgroundColor: palette.chrome,
        borderTopWidth: 1,
        borderTopColor: palette.border,
      }}
    >
      <View class="flex-row items-center justify-between gap-4" style={{ minHeight: 22 }}>
        <View class="flex-row items-center gap-2.5 flex-1" style={{ minWidth: 0 }}>
          <Button
            testID="repository"
            onPress={() => visit(repository)}
            class="flex-row items-center gap-1.5 px-1.5 py-0.5"
            style={{ borderRadius: metrics.radiusSmall }}
            hoverStyle={{ backgroundColor: palette.navActive }}
            activeStyle={{ opacity: 0.72 }}
            accessibilityLabel="打开 GitHub 仓库"
          >
            <Icon name="github" size={14} color={palette.inkSecondary} />
            <Text style={{ fontSize: 12, color: palette.inkSecondary }}>github.com/OUBIGFA/FuxWX</Text>
          </Button>
          <Text style={{ fontSize: 12, color: palette.borderControl }}>·</Text>
          <Text style={{ fontSize: 12, color: palette.inkMuted, numberOfLines: 1, fontVariant: ["tabular-nums"] }}>
            {statusText()}
          </Text>
          {p.busy ? (
            <Button
              testID="cancel"
              onPress={p.onCancel}
              class="flex-row items-center gap-1 px-1.5 py-0.5"
              style={{ borderRadius: metrics.radiusSmall }}
              hoverStyle={{ backgroundColor: palette.dangerSoft }}
              activeStyle={{ opacity: 0.75 }}
            >
              <Icon name="stop" size={14} color={palette.danger} />
              <Text style={{ fontSize: 12, color: palette.danger, fontWeight: "500" }}>停止任务</Text>
            </Button>
          ) : p.skippedCount > 0 ? (
            <Button
              onPress={p.onShowDetails}
              class="px-1.5 py-0.5"
              style={{ borderRadius: metrics.radiusSmall }}
              hoverStyle={{ backgroundColor: palette.dangerSoft }}
              activeStyle={{ opacity: 0.75 }}
            >
              <Text style={{ fontSize: 12, color: palette.danger }}>{`跳过 ${p.skippedCount} 项`}</Text>
            </Button>
          ) : null}
        </View>

        <View class="flex-row items-center gap-3">
          <Text style={{ fontSize: 12, color: palette.inkMuted, fontVariant: ["tabular-nums"] }}>{`v${config.version}`}</Text>
          <Button
            testID="check-update"
            disabled={checking()}
            onPress={checkUpdate}
            class="flex-row items-center gap-1 px-2 py-0.5"
            style={{ borderRadius: metrics.radiusSmall }}
            hoverStyle={checking() ? undefined : { backgroundColor: palette.navActive }}
            activeStyle={checking() ? undefined : { opacity: 0.72 }}
            disabledStyle={{ opacity: 0.5 }}
          >
            <Icon name="refresh" size={14} color={palette.accent} />
            <Text style={{ fontSize: 12, color: palette.accent, fontWeight: "500" }}>
              {checking() ? "正在检查…" : "检查更新"}
            </Text>
          </Button>
        </View>
      </View>

      {note() ? (
        <View
          class="flex-row items-center justify-between gap-3 pt-1.5"
          style={{ borderTopWidth: 1, borderTopColor: palette.border }}
        >
          <Text style={{ fontSize: 12, color: palette.inkSecondary, flex: 1, numberOfLines: 2 }}>{note()}</Text>
          {releaseUrl() ? (
            <Button
              testID="view-release"
              onPress={() => visit(releaseUrl())}
              class="px-2 py-0.5"
              style={{ borderRadius: metrics.radiusSmall }}
              hoverStyle={{ backgroundColor: palette.navActive }}
              activeStyle={{ opacity: 0.72 }}
            >
              <Text style={{ fontSize: 12, color: palette.accent, fontWeight: "500" }}>查看新版本</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
