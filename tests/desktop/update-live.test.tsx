// Explicit network smoke test, separate from deterministic checks and cleanup tests.
import { expect, open, test } from "nsh/test";

test("checks the real GitHub endpoint from the native window", async () => {
  const app = await open("../../app/App.tsx", { width: 1160, height: 780, network: "live" });
  await app.press("id:check-update");
  await app.waitUntil(() => app.texts().some(text => /^(暂无正式发布版本|已是最新正式版本 |当前版本 .* 高于最新正式版本|发现新版本 )/.test(text)), { timeout: 15000 });
  expect(app.enabled("id:check-update")).toBe(true);
  expect(app.texts()).not.toContain("关于");
});
