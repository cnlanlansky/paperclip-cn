import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = path.basename(here).replace(/^v/, "");
const LOCALE = "zh-CN";
const sourceLocaleFile = path.join(here, "locales", LOCALE, "common.json");
const runtimeScriptFile = path.join(here, "runtime", "paperclip-cn-runtime.js");

const routeStart = "// PAPERCLIP_CN_LOCALE_ROUTE_START";
const routeEnd = "// PAPERCLIP_CN_LOCALE_ROUTE_END";
const htmlStart = "<!-- PAPERCLIP_CN_RUNTIME_TRANSLATION_START -->";
const htmlEnd = "<!-- PAPERCLIP_CN_RUNTIME_TRANSLATION_END -->";

function expandHomePrefix(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(os.homedir(), value.slice(2));
  return value;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function readNpmPath(args) {
  try {
    const value = execFileSync("npm", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!value || value === "undefined" || value === "null") return null;
    return path.resolve(expandHomePrefix(value));
  } catch {
    return null;
  }
}

function getNpmCacheDirs() {
  const dirs = new Set();
  const npmCache = readNpmPath(["config", "get", "cache"]);
  if (npmCache) dirs.add(npmCache);

  if (process.env.npm_config_cache) dirs.add(path.resolve(expandHomePrefix(process.env.npm_config_cache)));
  if (process.env.NPM_CONFIG_CACHE) dirs.add(path.resolve(expandHomePrefix(process.env.NPM_CONFIG_CACHE)));
  if (process.env.LOCALAPPDATA) dirs.add(path.join(process.env.LOCALAPPDATA, "npm-cache"));
  dirs.add(path.join(os.homedir(), ".npm"));

  return Array.from(dirs);
}

function getNpmGlobalRoots() {
  const roots = new Set();
  const npmRoot = readNpmPath(["root", "-g"]);
  if (npmRoot) roots.add(npmRoot);
  if (process.env.APPDATA) roots.add(path.join(process.env.APPDATA, "npm", "node_modules"));
  roots.add(path.join(os.homedir(), ".npm-global", "lib", "node_modules"));
  roots.add("/usr/local/lib/node_modules");
  roots.add("/opt/homebrew/lib/node_modules");
  return Array.from(roots);
}

async function findServerPackage() {
  const explicit = process.env.PAPERCLIP_SERVER_DIR?.trim();
  const candidates = [];

  if (explicit) candidates.push(path.resolve(expandHomePrefix(explicit)));

  for (const npmCacheDir of getNpmCacheDirs()) {
    const npxRoot = path.join(npmCacheDir, "_npx");
    if (!(await exists(npxRoot))) continue;

    for (const entry of await fs.readdir(npxRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      candidates.push(path.join(npxRoot, entry.name, "node_modules", "@paperclipai", "server"));
    }
  }

  for (const globalRoot of getNpmGlobalRoots()) {
    candidates.push(path.join(globalRoot, "paperclipai", "node_modules", "@paperclipai", "server"));
    candidates.push(path.join(globalRoot, "@paperclipai", "server"));
  }

  const matches = [];
  for (const dir of candidates) {
    const packageFile = path.join(dir, "package.json");
    if (!(await exists(packageFile))) continue;
    const pkg = await readJson(packageFile);
    if (pkg.name !== "@paperclipai/server" || pkg.version !== VERSION) continue;
    const stat = await fs.stat(packageFile);
    matches.push({ dir, mtimeMs: stat.mtimeMs });
  }

  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.dir ?? null;
}

function replaceMarkedBlock(content, start, end, block) {
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return content;
  const afterEnd = endIndex + end.length;
  const lineEnd = content.indexOf("\n", afterEnd);
  return `${content.slice(0, startIndex)}${block}${content.slice(lineEnd === -1 ? afterEnd : lineEnd + 1)}`;
}

function insertAfter(content, needle, block) {
  const index = content.indexOf(needle);
  if (index === -1) throw new Error(`找不到插入位置：${needle}`);
  const insertAt = index + needle.length;
  return `${content.slice(0, insertAt)}${block}${content.slice(insertAt)}`;
}

async function backupOnce(filePath) {
  const backupFile = `${filePath}.paperclip-cn.bak`;
  if (await exists(backupFile)) return;
  await fs.copyFile(filePath, backupFile);
}

async function copyLocaleFile() {
  if (!(await exists(sourceLocaleFile))) throw new Error(`找不到中文词表：${sourceLocaleFile}`);

  const home = path.resolve(expandHomePrefix(process.env.PAPERCLIP_HOME?.trim() || path.join(os.homedir(), ".paperclip")));
  const targetFile = path.join(home, "locales", LOCALE, "common.json");
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  await fs.copyFile(sourceLocaleFile, targetFile);
  return targetFile;
}

async function patchAppJs(serverDir) {
  const appFile = path.join(serverDir, "dist", "app.js");
  let content = await fs.readFile(appFile, "utf8");

  if (!content.includes('import { resolvePaperclipHomeDir } from "./home-paths.js";')) {
    content = insertAfter(content, 'import fs from "node:fs";\n', 'import { resolvePaperclipHomeDir } from "./home-paths.js";\n');
  }

  const constBlock = `const PAPERCLIP_CN_LOCALE_RE = /^[a-zA-Z0-9_-]+$/;\n`;
  if (!content.includes("PAPERCLIP_CN_LOCALE_RE")) {
    content = insertAfter(content, "const FEEDBACK_EXPORT_FLUSH_INTERVAL_MS = 5_000;\n", constBlock);
  }

  const routeBlock = `${routeStart}\n    app.get("/locales/:locale/common.json", (req, res, next) => {\n        const locale = req.params.locale;\n        if (!PAPERCLIP_CN_LOCALE_RE.test(locale)) {\n            res.status(400).json({});\n            return;\n        }\n        const localesRoot = path.resolve(resolvePaperclipHomeDir(), "locales");\n        const localeFile = path.resolve(localesRoot, locale, "common.json");\n        const relativePath = path.relative(localesRoot, localeFile);\n        if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {\n            res.status(400).json({});\n            return;\n        }\n        if (!fs.existsSync(localeFile)) {\n            res.json({});\n            return;\n        }\n        try {\n            res.type("application/json").send(fs.readFileSync(localeFile, "utf-8"));\n        }\n        catch (err) {\n            next(err);\n        }\n    });\n${routeEnd}\n`;

  if (content.includes(routeStart)) {
    content = replaceMarkedBlock(content, routeStart, routeEnd, routeBlock);
  } else {
    content = insertAfter(content, "    app.use(httpLogger);\n", routeBlock);
  }

  await backupOnce(appFile);
  await fs.writeFile(appFile, content, "utf8");
  return appFile;
}

async function runtimeTranslationScript() {
  const script = (await fs.readFile(runtimeScriptFile, "utf8")).trim();
  return `${htmlStart}
<script>
${script}
</script>
${htmlEnd}
`;
}

async function patchIndexHtml(serverDir) {
  const htmlFile = path.join(serverDir, "ui-dist", "index.html");
  let content = await fs.readFile(htmlFile, "utf8");
  const block = await runtimeTranslationScript();

  if (content.includes(htmlStart)) {
    content = replaceMarkedBlock(content, htmlStart, htmlEnd, block);
  } else {
    const needle = "  </body>";
    const index = content.indexOf(needle);
    if (index === -1) throw new Error("找不到 index.html 的 </body> 插入位置");
    content = `${content.slice(0, index)}${block}${content.slice(index)}`;
  }

  await backupOnce(htmlFile);
  await fs.writeFile(htmlFile, content, "utf8");
  return htmlFile;
}

const serverDir = await findServerPackage();
if (!serverDir) {
  console.error(`没有找到 @paperclipai/server ${VERSION}。`);
  console.error("如果安装位置特殊，请设置 PAPERCLIP_SERVER_DIR 后再运行。");
  process.exit(1);
}

const localeFile = await copyLocaleFile();
const appFile = await patchAppJs(serverDir);
const htmlFile = await patchIndexHtml(serverDir);

console.log("Paperclip npm 中文补丁已应用。");
console.log(`服务包：${serverDir}`);
console.log(`中文词表：${localeFile}`);
console.log(`后端入口：${appFile}`);
console.log(`前端入口：${htmlFile}`);
console.log("如果 Paperclip 正在运行，请重启后刷新浏览器。");
