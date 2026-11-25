# 第三方来源

FuxWX 保留实际移植的源码、运行依赖和图标的来源与许可。下载包和参考检出放在被忽略的 .local/，不随源码提交。

| 来源 | 固定版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| [WxCleaner](https://github.com/yqxie1991/WxCleaner) | 414dd2ed24492b90b017aff5611c6843f42d8059 | MIT | 扫描算法与清理交互的迁移基线 |
| [nsh](https://github.com/longbridge/nsh) | v0.7.0 | Apache-2.0 | 原生应用框架 |
| [Solar Icons](https://github.com/saoudi-h/solar-icons) | ab241e1bf578dcfe45b0197aee59bd9a08b5fe68 | MIT / CC-BY-4.0 | 按需使用的 Linear 图标 |

Solar Icons Set 由 [480 Design](https://www.figma.com/community/file/1166831539721848736) 设计，包装由 Hakim Saoudi 维护。图标按 CC BY 4.0 使用，并在应用关于信息中署名。

固定输入、校验值和修改范围记录于 manifests/sources.json，许可证正文保存在 licenses/。依赖安装后依据锁文件更新传递依赖登记，打包时一并附带 notices。
