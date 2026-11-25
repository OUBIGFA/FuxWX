# 开发与验证

## 构建环境

- Windows 10 1809 或 Windows 11，x64
- nsh 0.7.0 正式版，Rust 1.100.0，Visual Studio C++ 工具和 Windows SDK
- Python 3.11 用于仓库检查、许可清单、私有桌面验收和打包
- Inno Setup 6 用于测试安装器

运行项目命令前，在 PowerShell 中执行 `. ./tools/env.ps1`，将本项目工具链和缓存加入当前进程环境。它不修改全局 PATH。

工具链放在 `.local/toolchains/`，下载放在 `.local/downloads/`。nsh 安装包必须与官方同名 `.sha256` 校验文件一致。nsh、Rust 与源码依赖版本写入第三方登记和锁文件。

## 检查入口

1. `python tools/check.py`：暂存区卫生及其回归测试
2. `cargo test --manifest-path crates/fuxwx-native/Cargo.toml --no-default-features`：真实合成文件的扫描、清理和取消测试
3. `nsh check`：原生模块与界面类型检查
4. `nsh test`：无窗口界面交互测试
5. `python tools/desktop_test.py tests/desktop/flow.test.tsx`：私有 Windows 桌面上的真实界面交互；不会切换用户桌面。脚本生成当前测试的数据和配置，再交给 nsh 的真实界面测试驱动
6. `python tools/test_installer.py`：将本地测试安装器安装到本次临时目录，在私有桌面启动、检查响应并卸载。若发现已有 FuxWX 安装，保留它并停止此验收
7. `python tools/test_installer_languages.py`：在私有桌面读取实际安装器语言和窗口，覆盖系统自动选择、英文、简体中文和繁体中文；只打开向导，不执行安装，可与用户已有安装共存
8. `python tools/test_window_icons.py`：启动打包后的程序并读取实际标题栏与任务栏图标尺寸；验证 100%–300% 缩放下的图标资源及浅色、深色合成。只操作私有桌面中的测试实例

回收站验证是显式测试，用本项目 `_temp/` 下生成的数据验证移入及恢复。运行前设置 `FUXWX_TEST_ROOT`，并将 `FUXWX_RECYCLE_BIN` 设为测试磁盘当前用户的回收站目录，执行 `cargo test --manifest-path crates/fuxwx-native/Cargo.toml --no-default-features windows_recycle_batch_is_restorable -- --ignored --nocapture`。测试仅恢复原路径属于本次临时目录的项目。不得把测试目录变量指向真实微信目录。

`python tools/build_installer.py` 核对 nsh 最新稳定版、生成品牌图标、打包并加入许可，更新 `dist/releases/FuxWX-0.1.0.exe` 和 SHA-256。图标工具的开发依赖在 `requirements-dev.txt`，不属于应用运行依赖。

新机器运行 `tools/setup.ps1 -Downloader <aria2-next程序路径>` 准备本地工具链；Visual Studio C++、Windows SDK 和 Inno Setup 6 需要先安装。应用依赖锁在 `crates/fuxwx-native/Cargo.lock`，nsh 模块在 `nsh.lock`，原生宿主依赖快照在 `tools/locks/nsh-runtime-Cargo.lock`。打包前恢复宿主锁文件；升级后从 nsh 生成结果更新该快照，不手改其中的版本。

应用结果和日志以本次命令实际输出为准。头部相同、尾部不同的文件必须通过完整哈希区分；彻底删除模式只删除选中的普通文件；回收失败不得转为永久删除。

## 设计

浅色平面列表，灰绿色仅强调主要操作和保留状态。字体使用系统中文字体；单文件工具不增加无用侧栏。主界面直接显示重复组、可清理大小、文件路径和选择结果。文件详情在选中文件后显示。

列表使用 nsh List 的原生虚拟化。后台清理每批最多 64 个文件；界面每 150 毫秒读取一次小型状态。清理期间不逐文件重建列表，完成后一次更新结果。

底部更新检查只在点击时访问 GitHub latest Release，按三段版本号比较，10 秒超时；不存在正式版、限流、网络错误均明确显示，不自动下载或安装。版本号读取 nsh.json。安装器通过 tools/installer_languages.py 加入官方语言包，采用 Inno 的 LanguageDetectionMethod=uilanguage、UsePreviousLanguage=no 和 ShowLanguageDialog=no。

## Windows 图标

nsh 0.7.0 打包时会再次缩放 PNG 的直通 RGBA，让透明黑色混入边缘；其打包窗口默认只提供 32px 窗口类图标。本项目保留上游稳定版，通过构建脚本把从原图生成的 17 个 ICO 帧直接写入程序资源，窗口打开和显示变化时显式设置独立的小图标和大图标。程序、安装器和便携 ZIP 使用同一份 ICO。

`tests/icons/` 在每次打包中检查实际 ICO 和 exe 资源，验证尺寸、原图缩放结果和透明边缘。`tools/test_window_icons.py` 验证实际 Windows 取图及绘制结果；真实窗口 DPI 和模拟资源加载的 DPI 分别记录，不把资源测试称为跨显示器验收。
