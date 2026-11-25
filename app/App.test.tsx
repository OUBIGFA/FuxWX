import { expect, open, test } from "nsh/test";

test("starts with safe cleanup mode and a clear empty state", async () => {
  const app = await open("./App.tsx", { width: 1160, height: 780 });
  expect(app.texts()).toContain("FuxWX");
  expect(app.texts()).toContain("选择文件夹，开始查找重复文件");
  expect(app.enabled("id:clean")).toBe(false);
  expect(app.texts()).toContain("移到回收站");
});

test("rejects an empty scan path and explains permanent removal", async () => {
  const app = await open("./App.tsx", { width: 1160, height: 780 });
  await app.clear("id:folder-path");
  await app.press("id:scan");
  expect(app.texts()).toContain("请选择或输入需要扫描的文件夹");
  await app.press("id:permanent");
  expect(app.texts()).toContain("彻底删除后无法从回收站恢复");
});
