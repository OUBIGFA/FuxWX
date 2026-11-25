import { cleanup, Image, openUrl, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import github from "../assets/icons/github/mark-github.svg";
import config from "../nsh.json";

const repository = "https://github.com/OUBIGFA/FuxWX";
const latestRelease = "https://api.github.com/repos/OUBIGFA/FuxWX/releases/latest";

/** Repository actions stay separate from the scan/delete task state. */
export function Footer() {
  const checking = signal(false);
  const note = signal("");
  const releaseUrl = signal("");
  let controller: AbortController | undefined;
  let closed = false;
  cleanup(() => { closed = true; controller?.abort(); });

  async function visit(url: string) {
    try {
      if (!(await openUrl(url)).opened) note.set("无法打开浏览器，请复制仓库地址访问");
    } catch { note.set("无法打开浏览器，请复制仓库地址访问"); }
  }
  async function checkUpdate() {
    if (checking()) return;
    checking.set(true); note.set(""); releaseUrl.set("");
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 10000);
    try {
      const response = await fetch(latestRelease, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": `FuxWX/${config.version}` },
        signal: controller.signal,
      });
      if (closed) return;
      if (response.status === 404) { note.set("暂无正式发布版本"); return; }
      if (!response.ok) { note.set(`检查失败（HTTP ${response.status}），请稍后重试`); return; }
      const release = await response.json();
      if (closed) return;
      // Only stable x.y.z releases count; prereleases never replace the test build.
      const match = typeof release.tag_name === "string" && /^v?(\d+)\.(\d+)\.(\d+)$/.exec(release.tag_name);
      if (!match || release.draft || release.prerelease) { note.set("发布版本号无法识别，请到仓库查看"); return; }
      const newer = match.slice(1).map(Number);
      const current = config.version.split(".").map(Number);
      let comparison = 0;
      for (let i = 0; i < 3; i++) { if (newer[i] !== current[i]) { comparison = newer[i] - current[i]; break; } }
      const version = newer.join(".");
      if (comparison > 0) {
        note.set(`发现新版本 ${version}`);
        // Build the link from the fixed repository, never from an untrusted response URL.
        releaseUrl.set(`${repository}/releases/tag/${encodeURIComponent(release.tag_name)}`);
      } else if (comparison === 0) note.set(`已是最新正式版本 ${config.version}`);
      else note.set(`当前版本 ${config.version} 高于最新正式版本 ${version}`);
    } catch { if (!closed) note.set("无法检查更新，请检查网络后重试"); }
    finally { clearTimeout(timeout); if (!closed) checking.set(false); }
  }

  return <View class="gap-2" style={{ borderTopWidth: 1, borderTopColor: "#d6dcd7", paddingTop: 10 }}>
    <View class="flex-row items-center justify-between">
      <Button testID="repository" onPress={() => visit(repository)} class="flex-row items-center gap-2 hover:opacity-70" accessibilityLabel="打开 GitHub 仓库">
        <Image src={github} style={{ width: 16, height: 16, tintColor: "#52645b" }} />
        <Text style={{ fontSize: 12, color: "#52645b" }}>github.com/OUBIGFA/FuxWX</Text>
      </Button>
      <View class="flex-row items-center gap-4">
        <Text style={{ fontSize: 12, color: "#68756c" }}>{`v${config.version}`}</Text>
        <Button testID="check-update" disabled={checking()} onPress={checkUpdate} class="hover:opacity-70 disabled:opacity-50">
          <Text style={{ fontSize: 13, color: "#2d5141" }}>{checking() ? "正在检查…" : "检查更新"}</Text>
        </Button>
      </View>
    </View>
    {note() ? <View class="flex-row items-center justify-between gap-3">
      <Text style={{ fontSize: 12, color: "#52645b", flex: 1, numberOfLines: 2 }}>{note()}</Text>
      {releaseUrl() ? <Button testID="view-release" onPress={() => visit(releaseUrl())}><Text style={{ fontSize: 13, color: "#2d5141" }}>查看新版本</Text></Button> : null}
    </View> : null}
  </View>;
}
