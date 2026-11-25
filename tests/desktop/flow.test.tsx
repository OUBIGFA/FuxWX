// Real nsh controls + real Rust operations, with exclusively generated files.
import { expect, open, test } from "nsh/test";
import fixture from "../../.local/desktop-fixture.json";

test("scans, virtualizes, cancels confirmation, then removes only duplicate copies", async () => {
  const folder = fixture.folder;
  const app = await open("../../app/App.tsx", { width: 1160, height: 780 });
  await app.clear("id:folder-path");
  await app.type("id:folder-path", folder);
  await app.press("id:scan");
  await app.waitFor("id:select-duplicates", { timeout: 20000 });
  await app.waitUntil(() => app.enabled("id:select-duplicates"), { timeout: 20000 });
  expect(app.count("role:checkbox")).toBeLessThan(50);
  await app.press("text:示例图片.png");
  await app.waitFor("id:image-preview", { timeout: 10000 });
  await app.screenshot(`${fixture.reports}/FuxWX-preview.png`);
  await app.press("text:收起");
  await app.press("id:select-duplicates");
  expect(app.enabled("id:clean")).toBe(true);
  await app.screenshot(`${fixture.reports}/FuxWX-main.png`);
  await app.setViewport(960, 660);
  await app.screenshot(`${fixture.reports}/FuxWX-compact.png`);
  await app.setViewport(1160, 780);
  await app.press("id:permanent");
  app.onDialog(() => "取消");
  await app.press("id:clean");
  expect(app.enabled("id:clean")).toBe(true);
  app.onDialog(dialog => {
    expect(dialog.title).toBe("彻底删除 81 个文件？");
    return "彻底删除";
  });
  await app.press("id:clean");
  await app.waitFor("text:成功 81 个 · 失败 0 个 · 未处理 0 个", { timeout: 20000 });
  expect(app.enabled("id:clean")).toBe(false);
  await app.screenshot(`${fixture.reports}/FuxWX-complete.png`);
}, 60000);

test("shows a clean empty state after successful cleanup", async () => {
  const app = await open("../../app/App.tsx", { width: 1160, height: 780 });
  await app.clear("id:folder-path");
  await app.type("id:folder-path", fixture.preview);
  await app.press("id:scan");
  await app.waitUntil(() => app.enabled("id:scan"), { timeout: 20000 });
  // The preceding cleanup keeps one image, so the scan has no duplicate group.
  expect(app.texts()).toContain("github.com/OUBIGFA/FuxWX");
  expect(app.texts()).not.toContain("关于");
  await app.clear("id:folder-path");
  await app.screenshot(`${fixture.reports}/FuxWX-empty.png`);
});
