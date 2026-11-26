# FuxWX 仓库规划

## 来源与历史

- 公开仓库目标：<https://github.com/OUBIGFA/FuxWX>，默认分支 main
- 独立历史，移植 WxCleaner 当前快照；上游只作读取参考，不设上游推送目标
- WxCleaner 基线：`414dd2ed24492b90b017aff5611c6843f42d8059`，MIT，<https://github.com/yqxie1991/WxCleaner>
- nsh：v0.7.1，Apache-2.0，<https://github.com/longbridge/nsh>
- Solar Icons 基线：`ab241e1bf578dcfe45b0197aee59bd9a08b5fe68`；包 MIT，图标 CC-BY-4.0，作者 480 Design
- 保留扫描的大小分组、首段哈希、完整 SHA-256 校验流程；使用 nsh / Rust 重建界面和后台清理
- 独立历史可以清晰区分新应用与上游 Python 工程；不携带旧打包脚本、品牌资源或上游发布历史

## 跟踪边界

| 路径 | 跟踪 | 职责 |
| --- | --- | --- |
| 根配置、锁文件、README、LICENSE、AGENTS.md | 是 | 可复现入口、产品说明和项目约定 |
| app/、crates/ | 是 | nsh 界面、后台扫描与清理 |
| assets/ | 是 | 实际使用的 Solar Linear 图标与品牌源文件 |
| tests/、tools/、.github/workflows/ | 是 | 可复现验证、构建和只读 CI |
| docs/、third_party/ | 是 | 长期设计、来源、许可和修改记录 |
| .local/ | 否 | 下载、工具链与固定版本上游参考 |
| dist/、output/ | 否 | 安装器、构建结果与验收报告 |
| 任意层级 _temp/ | 否 | 一次性实验与临时文件 |

只创建有实际内容的目录。提交和推送前检查暂存区，不用工作区的干净文件掩盖已暂存内容。

## 实施顺序

1. 确定边界、项目约定和来源许可，创建公开仓库
2. 固定 nsh 稳定版与工具链，建立原生应用和统一构建入口
3. 移植扫描流程；增加取消、稳定文件记录和每组保留规则
4. 实现后台清理、回收站与彻底删除选择、批量进度和失败报告
5. 完成界面、Solar Linear 图标和 FuxWX 品牌
6. 执行功能、批量清理和私有桌面验证，生成本地测试安装器

本次创建公开源码仓库已获授权；本地测试安装器不等于正式 Release。
