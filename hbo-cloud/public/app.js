const $ = (s) => document.querySelector(s);
let data = { links: [], notes: [], shortlinks: [] };

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 401) {
    alert("登录状态失效，请刷新页面并重新登录。");
    throw new Error("未授权");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "操作失败");
  return result;
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function hostLabel(url) {
  try { return new URL(url).hostname; } catch { return url; }
}
function renderLinks(target, items, canDelete) {
  target.innerHTML = items.length ? items.map(item => `
    <div class="link-card">
      <div class="link-icon">${escapeHtml((item.title || "站").slice(0,1).toUpperCase())}</div>
      <div class="link-info"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.category || "网站")} · ${escapeHtml(hostLabel(item.url))}</small></a></div>
      ${canDelete ? `<button class="delete" title="删除" data-delete-link="${escapeHtml(item.id)}">×</button>` : ""}
    </div>`).join("") : '<p class="muted">还没有内容，添加一个网站试试。</p>';
}
function render() {
  $("#link-count").textContent = data.links.length;
  $("#note-count").textContent = data.notes.length;
  $("#short-count").textContent = data.shortlinks.length;
  renderLinks($("#quick-links"), data.links.slice(0,6), false);
  renderLinks($("#all-links"), data.links, true);

  $("#note-list").innerHTML = data.notes.length ? data.notes.map(n => `
    <article class="note-card"><div class="note-meta"><span>${new Date(n.createdAt).toLocaleString()}</span><button class="delete" data-delete-note="${escapeHtml(n.id)}">删除</button></div><h4>${escapeHtml(n.title)}</h4><p>${escapeHtml(n.content)}</p></article>`).join("") : '<p class="muted">还没有笔记。</p>';

  const base = location.origin;
  $("#short-list").innerHTML = data.shortlinks.length ? data.shortlinks.map(s => `
    <tr><td><a href="${base}/s/${encodeURIComponent(s.slug)}" target="_blank" rel="noopener"> ${base}/s/${escapeHtml(s.slug)}</a></td><td>${escapeHtml(s.url)}</td><td><button class="delete" data-delete-short="${escapeHtml(s.id)}">删除</button></td></tr>`).join("") : '<tr><td colspan="3">还没有短链接</td></tr>';
}
async function refresh() { data = await api("/api/data"); render(); }

document.querySelectorAll(".nav").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-goto]").forEach(button => button.addEventListener("click", () => showView(button.dataset.goto)));
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  $("#view-" + name).classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(n => n.classList.toggle("active", n.dataset.view === name));
  const titles = { overview:"云平台总览", links:"网站导航", notes:"私人笔记", shortlinks:"短链接", services:"服务状态" };
  $("#page-title").textContent = titles[name] || "HBO CLOUD";
}

$("#link-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  try {
    await api("/api/links", { method:"POST", body:JSON.stringify({ title:f.get("title"), url:f.get("url"), category:f.get("category") }) });
    e.currentTarget.reset(); await refresh(); toast("网站已添加");
  } catch(err) { toast(err.message); }
});
$("#note-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  try {
    await api("/api/notes", { method:"POST", body:JSON.stringify({ title:f.get("title"), content:f.get("content") }) });
    e.currentTarget.reset(); await refresh(); toast("笔记已保存");
  } catch(err) { toast(err.message); }
});
$("#short-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  try {
    await api("/api/shortlinks", { method:"POST", body:JSON.stringify({ url:f.get("url"), slug:f.get("slug") }) });
    e.currentTarget.reset(); await refresh(); toast("短链接已创建");
  } catch(err) { toast(err.message); }
});
document.addEventListener("click", async e => {
  const link = e.target.closest("[data-delete-link]");
  const note = e.target.closest("[data-delete-note]");
  const short = e.target.closest("[data-delete-short]");
  try {
    if (link && confirm("确定删除这个网站？")) await api("/api/links/" + encodeURIComponent(link.dataset.deleteLink), { method:"DELETE" });
    else if (note && confirm("确定删除这条笔记？")) await api("/api/notes/" + encodeURIComponent(note.dataset.deleteNote), { method:"DELETE" });
    else if (short && confirm("确定删除这个短链接？")) await api("/api/shortlinks/" + encodeURIComponent(short.dataset.deleteShort), { method:"DELETE" });
    else return;
    await refresh(); toast("已删除");
  } catch(err) { toast(err.message); }
});
refresh().catch(err => toast(err.message));
