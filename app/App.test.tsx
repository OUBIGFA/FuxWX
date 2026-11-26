import { expect, open, test } from "nsh/test";

test("starts with safe cleanup mode and a clear empty state", async () => {
  const app = await open("./App.tsx", { width: 1160, height: 780 });
  expect(app.texts()).not.toContain("关于");
  expect(app.texts()).not.toContain("重复文件清理");
  expect(app.texts()).toContain("github.com/OUBIGFA/FuxWX");
  await app.press("id:repository");
  expect(app.openedUrls()).toEqual(["https://github.com/OUBIGFA/FuxWX"]);
  expect(app.texts()).toContain("选择文件夹，开始查找重复文件");
  expect(app.enabled("id:clean")).toBe(false);
  expect(app.texts()).toContain("移到回收站");
});

const latest = "GET https://api.github.com/repos/OUBIGFA/FuxWX/releases/latest";
for (const [name, response, expected] of [
  ["no release", { status: 404 }, "暂无正式发布版本"],
  ["current", { body: { tag_name: "0.1.0", prerelease: false, draft: false } }, "已是最新正式版本 0.1.0"],
  ["current with v prefix", { body: { tag_name: "v0.1.0", prerelease: false, draft: false } }, "已是最新正式版本 0.1.0"],
  ["older release", { body: { tag_name: "0.0.9", prerelease: false, draft: false } }, "当前版本 0.1.0 高于最新正式版本 0.0.9"],
  ["new release", { body: { tag_name: "0.2.0", prerelease: false, draft: false } }, "发现新版本 0.2.0"],
  ["prerelease", { body: { tag_name: "0.2.0-beta.1", prerelease: true, draft: false } }, "发布版本号无法识别，请到仓库查看"],
  ["rate limited", { status: 403 }, "检查失败（HTTP 403），请稍后重试"],
  ["offline", { error: "offline" }, "无法检查更新，请检查网络后重试"],
  ["invalid version", { body: { tag_name: "nightly", prerelease: false, draft: false } }, "发布版本号无法识别，请到仓库查看"],
] as const) {
  test(`checks updates: ${name}`, async () => {
    const app = await open("./App.tsx", { width: 1160, height: 780, network: { [latest]: response } });
    await app.press("id:check-update");
    await app.waitFor(`text:${expected}`);
    expect(app.requests().length).toBe(1);
    if (name === "new release") {
      await app.press("id:view-release");
      expect(app.openedUrls()).toEqual(["https://github.com/OUBIGFA/FuxWX/releases/tag/0.2.0"]);
    }
  });
}

test("rejects an empty scan path and explains permanent removal", async () => {
  const app = await open("./App.tsx", { width: 1160, height: 780 });
  await app.clear("id:folder-path");
  await app.press("id:scan");
  expect(app.texts()).toContain("请选择或输入需要扫描的文件夹");
  await app.press("id:permanent");
  expect(app.texts()).toContain("彻底删除后无法从回收站恢复");
});

test("supports sidebar category switching and collapse toggle", async () => {
  const app = await open("./App.tsx", { width: 1160, height: 780 });
  await app.press("id:nav-image");
  expect(app.texts()).toContain("重复的图片与截图文件");
  await app.press("id:nav-document");
  expect(app.texts()).toContain("重复的文档与压缩文件");
  await app.press("id:toggle-sidebar");
  expect(app.texts()).not.toContain("文件类型");
  await app.press("id:toggle-sidebar");
  expect(app.texts()).toContain("文件类型");
});
