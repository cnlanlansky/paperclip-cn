# 📎 Paperclip 中文补丁

> 给 Paperclip npm 安装版用的中文补丁包。  
> 支持 `npx paperclipai ...` 和 `npm install -g paperclipai` 两种安装方式。  
> 本仓库只保存补丁文件，不包含 Paperclip 官方完整源码。

官方项目：

```text
https://github.com/paperclipai/paperclip
```

## 🧭 版本对应

先确认当前安装的 Paperclip 版本：

```bash
paperclipai --version
```

补丁目录和 Paperclip 版本一一对应：


## 🚀 使用方式

在本仓库根目录运行对应版本的补丁脚本：

```bash
node <版本号>/apply-npx-patch.mjs
```

目录通用结构：

```text
<版本号>/
├── apply-npx-patch.mjs             # npm 安装版补丁脚本
├── locales/
│   └── zh-CN/
│       └── common.json             # 中文词表
└── runtime/
    └── paperclip-cn-runtime.js     # 浏览器运行时汉化脚本
```

运行后重启 Paperclip，并刷新浏览器。

## 🪄 脚本会做什么

补丁脚本会自动处理三件事：

- 查找当前 npm 安装的 `@paperclipai/server` 包。
- 复制中文词表到 Paperclip 用户目录。
- 给编译后的后端和前端入口加入中文补丁。

## 🔁 更新补丁

以下情况重新运行补丁脚本即可：

- 中文词表更新后。
- Paperclip 更新或重装后。
- Paperclip 补丁脚本更新后。

## ⚠️ 注意

- 版本要对应，不建议跨版本混用。
- 本仓库只提供 npm 安装版补丁，不提供源码覆盖补丁。
- 本仓库不写 Paperclip 官方安装和使用说明。
- 不要把密钥、Token、数据库密码等敏感信息写进仓库。
