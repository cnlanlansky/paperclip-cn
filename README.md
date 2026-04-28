# 📎 Paperclip 中文补丁

> 给 Paperclip 用的中文补丁包。  
> 本仓库只保存补丁文件，不包含 Paperclip 官方完整源码。

官方项目：

```text
https://github.com/paperclipai/paperclip
```

## 🧭 版本对应

| Paperclip 版本 | 使用目录 |
| --- | --- |
| `v2026.427.0` | `v2026.427.0/` |

## 🚀 使用方式

选择与你 Paperclip 版本一致的目录。

### ⚡ npx 安装版

`npx` 安装的是编译后的 Paperclip 包，不是源码目录，所以不能直接复制 `server/src`、`ui/src` 这些源码补丁。

补丁脚本支持 Windows、macOS 和 Linux，会自动处理这些事情：

- 通过 npm 缓存路径查找当前 npx 安装的 Paperclip 包。
- 复制中文词表到 Paperclip 用户目录。
- 给编译后的后端和前端入口加入中文补丁。

在本仓库根目录运行：

```bash
node v2026.427.0/apply-npx-patch.mjs
```

运行后重启 Paperclip，并刷新浏览器。

### 🧩 源码版

源码版可以直接覆盖同名文件。

把对应版本目录里的全部内容复制到 Paperclip 项目根目录：

```text
本仓库/版本目录/*  ->  Paperclip 项目根目录/*
```

复制后按你的源码项目方式重新启动或重新构建。

## 🪄 更新词表

如果已经应用过同版本补丁，后续只补中文词条时：

- npx 安装版：重新运行补丁脚本。
- 源码版：通常只需要覆盖 `locales/zh-CN/common.json`。

## ⚠️ 注意

- 版本要对应，不建议跨版本混用。
- npx 更新或重装 Paperclip 后，请重新运行补丁脚本。
- 源码版首次应用请复制整个版本目录的内容。
- 本仓库不写 Paperclip 官方安装和使用说明。
- 不要把密钥、Token、数据库密码等敏感信息写进仓库。
