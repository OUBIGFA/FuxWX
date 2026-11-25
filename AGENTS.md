# FuxWX 项目工作约定

## 产品与授权

- 产品名固定为 FuxWX，基于 WxCleaner 的重复文件识别与清理流程二次开发，采用 nsh 原生界面，首版面向 Windows
- 图标按需采用 Solar Linear；保留 Solar Icons / 480 Design 署名与第三方许可
- 品牌图固定为 assets/branding/FuxWX_logo.png，来自用户提供的原图；保留 dist/FuxWX_logo.png，派生 PNG、ICO、ICNS 用 tools/generate_icons.py 生成到 dist/icons/
- Windows ICO 从原图一次缩放生成 17 个尺寸，透明边缘必须按预乘透明度过滤；打包通过 tools/windows_icons.py 写入并回读验证程序资源，不使用 nsh 再次缩放生成的图标
- 标题栏和任务栏图标在窗口打开及屏幕缩放变化后分别按 DPI 选取；nsh 升级时复核是否还需要 crates/fuxwx-native/src/window_icons.rs 的兼容处理
- 本次已授权创建公开仓库并实施迁移、提交项目源码和生成本地测试安装器；创建 tag、Release 和后续对外发布需单独授权
- 采用独立历史、main 分支、MIT 许可；移植来源固定到提交并登记，保留原始版权
- 项目约定随实现更新；不得把计划功能描述成已经实现

## 稳定版与构建

- 每次开始开发、更新依赖和准备打包前联网核对 nsh 官方 Releases，使用最新非 draft、非 prerelease 正式版
- 当前迁移基线为 nsh v0.7.0（2026-11-25 核对）；依赖和工具固定版本，不能用浮动 main 代替稳定版
- 更新版本时同步配置、锁文件、第三方登记与受影响验证；兼容失败记录证据，不静默降级
- 跟进稳定版本是开发约定，不代表授权定时任务或自动发布
- 测试安装器统一写入 dist/releases/FuxWX-<版本>.exe，更新同版本文件；版本号仅在正式发布或明确要求时调整
- 每次完成代码任务后，经检查验证无误后提交并推送到 main，同时更新并验证本地测试安装器（安装器留在 dist/，不入库）
- 版本号唯一来源为 nsh.json 的 version；构建入口为 python tools/build_installer.py，开始前运行 . ./tools/env.ps1

## 删除与界面

- 扫描、哈希和删除在后台执行，界面只显示合并进度，不逐文件排队刷新
- 默认移到回收站；彻底删除必须由用户明确选择并确认，回收失败不得自动转为彻底删除
- 每组至少保留一个文件；删除前校验扫描记录，已变更或不可访问的文件保留并明确报告
- 停止操作后准确报告已处理、失败和未处理数量；不把任务提交等同于删除成功
- 界面保持简洁、文字可读；用户文案聚焦文件、选择和结果，不暴露内部实现术语
- 主界面不显示顶部品牌栏或“关于”；底部提供 GitHub 仓库链接和手动检查更新，更新只检查正式版本并打开对应发布页
- 安装器包含英文、简繁中文和 Inno Setup 自带语言，按 Windows 显示语言自动选择，不沿用旧安装语言；没有匹配翻译时使用英文
- 桌面验收使用私有桌面和本次合成数据，不扫描或删除用户真实文件，不操作用户正在使用的实例

## 文件职责与验证

- 源码、可复现测试、锁文件、构建与 CI、许可、长期文档入库
- .local/ 保存下载、工具链与上游参考；dist/ 保存本地产物；临时文件放在 _temp/<任务>/
- **/_temp/ 必须是 .gitignore 最后一条有效规则；生成本地产物前配置忽略规则
- 不提交凭据、机器绝对路径、真实微信文件、日志、缓存、安装器和截图验收记录
- 项目规划见 docs/repository-plan.md；迁移与验收状态见 docs/migration.md
- 收尾检查暂存内容、跟踪清单、来源许可及受影响功能，运行必要测试和打包；构建成功不能代替界面和删除性能验收
- 统一检查：python tools/check.py、nsh check、nsh test；界面改动用 python tools/desktop_test.py tests/desktop/flow.test.tsx，安装器用 python tools/test_installer.py 验证
- 仓库维护跟踪 crates/fuxwx-native/Cargo.lock、nsh.lock 和 tools/locks/nsh-runtime-Cargo.lock；依赖升级时由工具生成锁文件并同步第三方登记，禁止手改生成内容
