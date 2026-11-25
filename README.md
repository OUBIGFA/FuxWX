<div align="center">

<img src="assets/branding/FuxWX_logo.png" width="128" alt="FuxWX 标志">

# FuxWX

**找出微信文件夹中的重复文件，确认后清理**

简体中文 · [English](README.en.md)

<a href="https://github.com/OUBIGFA/FuxWX/releases"><img src="https://img.shields.io/badge/version-0.1.0-526B60" alt="版本 0.1.0"></a>
<a href="https://github.com/OUBIGFA/FuxWX/releases"><img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-526B60?logo=windows&amp;logoColor=white" alt="Windows 10 和 11"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-526B60" alt="MIT 许可证"></a>

</div>

---

## 界面预览

[![FuxWX 扫描后列出重复文件](assets/screenshots/FuxWX-main.png)](assets/screenshots/FuxWX-main.png)

<p align="center">
  <a href="assets/screenshots/FuxWX-complete.png"><img src="assets/screenshots/FuxWX-complete.png" width="80%" alt="FuxWX 清理完成后的结果"></a>
</p>

[扫描结果原图](assets/screenshots/FuxWX-main.png) · [清理完成原图](assets/screenshots/FuxWX-complete.png)

## 项目说明

FuxWX 是一个清理重复文件的 Windows 应用。微信会把同一张图片、同一份文件保存多次，FuxWX 帮你找出这些副本。你先核对每组文件，选好要保留的那一份，再确认清理。文件只在本机处理，不会上传。

## 可以用来做什么

- **找出重复文件。** 扫描你选择的文件夹，按完整内容比较文件。大小相同但内容不同的文件不会被当成重复。
- **核对每组文件。** 每组列出文件名称、所在位置和大小。点击文件名称可查看详情，图片可以直接预览。
- **选择要保留的文件。** 点“选择重复项”后，每组默认保留路径较短的一份。点“保留这份”可以换成同组的其他文件。每组至少保留一个文件。
- **安全清理。** 默认移到回收站，可以随时恢复。彻底删除需要你单独选择并确认。
- **随时停止。** 扫描和清理在后台进行，界面保持可用。点“停止任务”后，FuxWX 会分别说明已处理、失败和未处理的数量。
- **筛选结果。** 按名称或路径筛选重复文件，或打开文件所在位置。
- **检查新版本。** 点底部的“检查更新”，查询是否有新的正式版本。

## 下载与上手

### 安装 FuxWX

1. 打开 [FuxWX 下载页](https://github.com/OUBIGFA/FuxWX/releases)。
2. 下载 `FuxWX-0.1.0.exe`。
3. 打开下载的文件，按屏幕上的提示安装。

当前版本是 0.1.0。它支持 64 位 Windows 10（1809 及更新版本）和 Windows 11。

安装程序为当前用户安装 FuxWX，不需要管理员权限。安装程序自动使用 Windows 的显示语言；没有对应翻译时使用英文。安装后，从开始菜单打开 FuxWX。

要卸载 FuxWX，请打开“设置”，选择“应用”，选择“已安装的应用”，然后选择 FuxWX。

### 清理重复文件

1. 打开 FuxWX，点“选择文件夹”，选择要检查的微信文件夹。你也可以直接粘贴文件夹路径。
2. 点“开始扫描”。
3. 核对结果，点“选择重复项”。
4. 选择“移到回收站”或“彻底删除”，然后点清理按钮。
5. 核对确认窗口中的文件数量和大小，再确认清理。

## 按需使用

- **更换保留的文件。** 在要保留的文件上点“保留这份”，同组其他文件会被选为待清理。
- **取消选择。** 点“清空选择”，或逐个取消勾选。
- **查看文件详情。** 点击文件名称，右侧显示大小、修改时间和位置。点“打开文件位置”可在文件资源管理器中查看。
- **停止任务。** 扫描或清理时点底部的“停止任务”。已完成的操作不会撤销。
- **查看失败项目。** 清理结束后点“查看详情”，查看没有处理的文件和原因。
- **检查更新。** 点底部的“检查更新”。发现新版本时，点“查看新版本”打开下载页。FuxWX 不会自动下载或安装。

## 注意

- 这个版本的安装程序没有数字签名。第一次运行时，Windows 可能显示“Windows 已保护你的电脑”。点“更多信息”，再点“仍要运行”。
- 彻底删除不经过回收站，无法从回收站恢复。重要文件请先备份。
- 回收站中的文件仍占用磁盘空间，清空回收站后才释放空间。
- 扫描后被修改、移动或无法访问的文件会保留，并在结果中说明。移到回收站失败时，不会改为彻底删除。
- 图片预览上限为 16 MB。其他文件可以打开所在位置查看。

## 来源与许可

FuxWX 是开源软件，使用 [MIT](LICENSE) 许可证，源代码在 [GitHub 仓库](https://github.com/OUBIGFA/FuxWX)。FuxWX 基于 [WxCleaner](https://github.com/yqxie1991/WxCleaner) 二次开发，保留原作者版权。界面基于 [nsh](https://github.com/longbridge/nsh)。图标采用 [Solar Linear](https://github.com/saoudi-h/solar-icons)，由 [480 Design](https://www.figma.com/community/file/1166831539721848736) 设计，按 CC BY 4.0 署名使用。

[MIT 许可证](LICENSE) · [第三方组件](third_party/README.md)
