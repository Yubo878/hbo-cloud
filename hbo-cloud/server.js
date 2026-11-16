const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASSWORD;
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || "./data";
const DATA_FILE = path.join(DATA_DIR, "store.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const VPN_HEALTH_URL = process.env.VPN_HEALTH_URL || "";
const startedAt = Date.now();
let previousCpu = process.cpuUsage();
let previousCpuAt = Date.now();

if (!PASS || PASS.length < 16) {
  console.error("Set ADMIN_PASSWORD to a random password of at least 16 characters.");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

function freshStore() {
  return {
    links: [
      { id: crypto.randomUUID(), title: "Railway 控制台", url: "https://railway.com/dashboard", category: "管理" },
      { id: crypto.randomUUID(), title: "GitHub", url: "https://github.com", category: "开发" },
      { id: crypto.randomUUID(), title: "ChatGPT", url: "https://chatgpt.com", category: "工具" }
    ],
    notes: [],
    shortlinks: []
  };
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      links: Array.isArray(parsed.links) ? parsed.links : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      shortlinks: Array.isArray(parsed.shortlinks) ? parsed.shortlinks : []
    };
  } catch {
    const initial = freshStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
}

let store = loadStore();
let saveQueue = Promise.resolve();

function saveStore() {
  const snapshot = JSON.stringify(store, null, 2);
  saveQueue = saveQueue.then(async () => {
    const temp = DATA_FILE + ".tmp";
    await fs.promises.writeFile(temp, snapshot, "utf8");
    await fs.promises.rename(temp, DATA_FILE);
  });
  return saveQueue;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function authorized(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try { decoded = Buffer.from(header.slice(6), "base64").toString("utf8"); }
  catch { return false; }
  const split = decoded.indexOf(":");
  if (split < 0) return false;
  return safeEqual(decoded.slice(0, split), USER) && safeEqual(decoded.slice(split + 1), PASS);
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 100_000) {
        reject(new Error("请求内容太大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("JSON 格式不正确")); }
    });
    req.on("error", reject);
  });
}

function cleanText(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}

function validWebUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch { return false; }
}

function serveStatic(res, pathname) {
  const map = {
    "/": "index.html",
    "/style.css": "style.css",
    "/app.js": "app.js"
  };
  const file = map[pathname];
  if (!file) return false;
  const full = path.join(PUBLIC_DIR, file);
  const type = file.endsWith(".css") ? "text/css; charset=utf-8" :
               file.endsWith(".js") ? "text/javascript; charset=utf-8" :
               "text/html; charset=utf-8";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
  });
  fs.createReadStream(full).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/health") return sendJson(res, 200, { ok: true });

  // Short-link destinations are public by design; creation and management require login.
  if (req.method === "GET" && pathname.startsWith("/s/")) {
    const slug = pathname.slice(3);
    const item = store.shortlinks.find(x => x.slug === slug);
    if (!item) return sendJson(res, 404, { error: "短链接不存在" });
    res.writeHead(302, { Location: item.url, "Cache-Control": "no-store" });
    return res.end();
  }

  if (!authorized(req)) {
    res.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="HBO CLOUD", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    });
    return res.end("需要登录才能访问 HBO CLOUD");
  }

  if (req.method === "GET" && pathname === "/api/data") {
    return sendJson(res, 200, store);
  }

  if (req.method === "GET" && pathname === "/api/metrics") {
    const mem = process.memoryUsage();
    const now = Date.now();
    const cpuNow = process.cpuUsage();
    const elapsed = Math.max(1, now - previousCpuAt);
    const cpuMicros = (cpuNow.user - previousCpu.user) + (cpuNow.system - previousCpu.system);
    const cpuPercent = Math.min(100, Number((cpuMicros / (elapsed * 1000) * 100).toFixed(2)));
    previousCpu = cpuNow;
    previousCpuAt = now;
    return sendJson(res, 200, {
      app: { status: "online", uptimeSeconds: Math.floor((now - startedAt) / 1000) },
      process: { memoryMb: Number((mem.rss / 1024 / 1024).toFixed(1)), heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(1)), cpuPercent },
      storage: { dataFileBytes: fs.existsSync(DATA_FILE) ? fs.statSync(DATA_FILE).size : 0 },
      vpnConfigured: Boolean(VPN_HEALTH_URL),
      checkedAt: new Date(now).toISOString()
    });
  }

  if (req.method === "POST" && pathname === "/api/check-services") {
    const results = [{ name: "HBO CLOUD 管理面板", status: "online", detail: "本服务已响应" }];
    if (VPN_HEALTH_URL) {
      try {
        const target = new URL(VPN_HEALTH_URL);
        if (!(["https:", "http:"].includes(target.protocol))) throw new Error("仅支持 HTTP/HTTPS 地址");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(target, { method: "GET", signal: controller.signal, redirect: "manual" });
          results.push({ name: "VPN 健康检查地址", status: response.ok ? "online" : "warning", detail: `HTTP ${response.status}` });
        } finally { clearTimeout(timeout); }
      } catch (e) {
        results.push({ name: "VPN 健康检查地址", status: "offline", detail: e.name === "AbortError" ? "检查超时（5 秒）" : "无法连接或地址无效" });
      }
    } else {
      results.push({ name: "VPN 项目", status: "unconfigured", detail: "尚未设置 VPN_HEALTH_URL；不会据此判断 VPN 故障" });
    }
    return sendJson(res, 200, { results, checkedAt: new Date().toISOString() });
  }

  if (req.method === "POST" && pathname === "/api/links") {
    try {
      const body = await readBody(req);
      const title = cleanText(body.title, 60);
      const target = cleanText(body.url, 500);
      const category = cleanText(body.category || "其他", 24);
      if (!title || !validWebUrl(target)) return sendJson(res, 400, { error: "请填写名称和有效的 http/https 网址" });
      const item = { id: crypto.randomUUID(), title, url: target, category };
      store.links.unshift(item);
      await saveStore();
      return sendJson(res, 201, item);
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/links/")) {
    const id = pathname.slice("/api/links/".length);
    store.links = store.links.filter(x => x.id !== id);
    await saveStore();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/notes") {
    try {
      const body = await readBody(req);
      const title = cleanText(body.title, 100);
      const content = cleanText(body.content, 10000);
      if (!title || !content) return sendJson(res, 400, { error: "标题和内容都不能为空" });
      const item = { id: crypto.randomUUID(), title, content, createdAt: new Date().toISOString() };
      store.notes.unshift(item);
      await saveStore();
      return sendJson(res, 201, item);
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/notes/")) {
    const id = pathname.slice("/api/notes/".length);
    store.notes = store.notes.filter(x => x.id !== id);
    await saveStore();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/shortlinks") {
    try {
      const body = await readBody(req);
      const target = cleanText(body.url, 1000);
      const slug = cleanText(body.slug || crypto.randomBytes(4).toString("hex"), 30);
      if (!validWebUrl(target)) return sendJson(res, 400, { error: "请输入有效的 http/https 网址" });
      if (!/^[a-zA-Z0-9_-]{3,30}$/.test(slug)) return sendJson(res, 400, { error: "短码需为 3-30 位字母、数字、下划线或连字符" });
      if (store.shortlinks.some(x => x.slug === slug)) return sendJson(res, 409, { error: "这个短码已经被使用" });
      const item = { id: crypto.randomUUID(), slug, url: target, createdAt: new Date().toISOString() };
      store.shortlinks.unshift(item);
      await saveStore();
      return sendJson(res, 201, item);
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/shortlinks/")) {
    const id = pathname.slice("/api/shortlinks/".length);
    store.shortlinks = store.shortlinks.filter(x => x.id !== id);
    await saveStore();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && serveStatic(res, pathname)) return;
  return sendJson(res, 404, { error: "没有找到这个页面" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`HBO CLOUD listening on ${PORT}; data directory: ${DATA_DIR}`);
});
