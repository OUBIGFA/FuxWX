# 第三方来源

FuxWX 保留实际移植的源码、运行依赖和图标的来源与许可。下载包和参考检出放在被忽略的 .local/，不随源码提交。

| 来源 | 固定版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| [WxCleaner](https://github.com/yqxie1991/WxCleaner) | 414dd2ed24492b90b017aff5611c6843f42d8059 | MIT | 扫描算法与清理交互的迁移基线 |
| [nsh](https://github.com/longbridge/nsh) | v0.7.0 | Apache-2.0 | 原生应用框架 |
| [Solar Icons](https://github.com/saoudi-h/solar-icons) | ab241e1bf578dcfe45b0197aee59bd9a08b5fe68 | MIT / CC-BY-4.0 | 按需使用的 Linear 图标 |

Solar Icons Set 由 [480 Design](https://www.figma.com/community/file/1166831539721848736) 设计，包装由 Hakim Saoudi 维护。图标按 CC BY 4.0 使用，署名保留于 README、本文和安装目录中的 THIRD_PARTY_NOTICES.txt。

底部 GitHub 品牌图标使用 GitHub 官方 [Octicons](https://github.com/primer/octicons) 的 mark-github（MIT），不属于 Solar 图标集。安装器中文翻译来自 [Inno Setup 官方源码](https://github.com/jrsoftware/issrc)，其余语言使用本机 Inno Setup 6.7.2 自带的翻译；来源提交和许可保存在 sources.json 与 licenses/。

固定输入、校验值和修改范围记录于 manifests/sources.json，实际使用的图标在 manifests/icons.json。Rust 传递依赖在 manifests/rust-dependencies.json，许可证正文保存在 licenses/，打包时汇集为 THIRD_PARTY_NOTICES.txt。

品牌图由用户于 2026-11-25 提供用于 FuxWX，属于项目品牌资源（LicenseRef-FuxWX-Brand），不属于 Solar 图标集。源文件和公开截图在 binaries.json 中登记；派生图标只写入 dist/icons/。
