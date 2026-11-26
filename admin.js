
const $ = (id) => document.getElementById(id);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let token = store.get("herald_token");
let repo = store.get("herald_repo") || guessRepo();

const files = {
  posts: { path: "posts.json", data: [], sha: null, render: () => renderPosts() },
  ticker: { path: "ticker.json", data: [], sha: null, render: () => renderAnnouncements() },
};
let editingId = null; 

function guessRepo() {
  const host = location.hostname;
  if (!host.endsWith(".github.io")) return "";
  const owner = host.split(".")[0];
  const first = location.pathname.split("/").filter(Boolean)[0];
  return first && !first.endsWith(".html") ? `${owner}/${first}` : `${owner}/${host}`;
}

// ---------- GitHub API ----------

async function resolveRepo(name) {
  try {
    const res = await fetch(`https://api.github.com/repos/${name}`, { cache: "no-store" });
    if (res.ok) return (await res.json()).full_name;
  } catch {}
  return name;
}

async function gh(path, options = {}) {
  try {
    return await ghFetch(path, options);
  } catch (err) {
    throw new Error(await diagnose(err));
  }
}

async function diagnose(err) {
  const detail = `(${err.name}: ${err.message})`;
  try {
    await fetch(`https://api.github.com/repos/${repo}`, { cache: "no-store" });
  } catch {
    return `This page can't reach GitHub at all ${detail}. A content blocker or browser setting is probably blocking it. Try another browser, or turn blockers off for this site.`;
  }
  return `GitHub is reachable, but the browser refused to send the request with your token to ${repo} ${detail}. Paste the token again; if it still fails, note this message.`;
}

function ghFetch(path, options) {
  return fetch(`https://api.github.com/repos/${repo}` + (path ? `/${path}` : ""), {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function load(key) {
  const file = files[key];
  const res = await gh(`contents/${file.path}`);
  if (res.status === 404) {
    const repoRes = await gh("");
    if (!repoRes.ok) throw new Error(explain(repoRes.status));
    file.data = []; file.sha = null;
    return;
  }
  if (!res.ok) throw new Error(explain(res.status));
  const json = await res.json();
  file.data = JSON.parse(fromBase64(json.content));
  file.sha = json.sha;
}

async function save(key, newData, message) {
  const file = files[key];
  const res = await gh(`contents/${file.path}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: toBase64(JSON.stringify(newData, null, 2) + "\n"),
      ...(file.sha ? { sha: file.sha } : {}),
    }),
  });
  if (res.status === 409 || res.status === 422) {
    await load(key); 
    file.render();
    throw new Error("This changed elsewhere since the page loaded. The list is refreshed — please try again.");
  }
  if (!res.ok) throw new Error(explain(res.status));
  file.sha = (await res.json()).content.sha;
  file.data = newData;
}

function explain(status) {
  if (status === 401) return "GitHub didn't accept the token (wrong or expired).";
  if (status === 403) return "The token isn't allowed to do this. Check it has Contents: Read and write on this repo.";
  if (status === 404) return "Repository not found, or the token can't see it.";
  return `GitHub returned an error (${status}).`;
}

// ---------- shared UI bits ----------

function message(text, kind = "ok", id = "msg") {
  const el = $(id);
  el.textContent = text;
  el.className = `notice ${kind}`;
  el.hidden = !text;
}

async function busy(fn) {
  const buttons = document.querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));
  try { await fn(); } finally { buttons.forEach((b) => (b.disabled = false)); }
}

function button(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function listRow(main, sub, ...buttons) {
  const li = document.createElement("li");
  const info = document.createElement("div");
  info.className = "info";
  const subEl = document.createElement("span");
  subEl.textContent = sub;
  info.append(main, subEl);
  li.append(info, ...buttons);
  return li;
}

function emptyRow(text) {
  const li = document.createElement("li");
  li.textContent = text;
  return li;
}

// ---------- posts ----------

function makeSlug(title) {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim()
    .replace(/[\s_-]+/g, "-").slice(0, 60) || "post";
  const taken = new Set(files.posts.data.map((p) => p.id));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

function renderPosts() {
  const sorted = newestFirst(files.posts.data);
  if (!sorted.length) return $("list").replaceChildren(emptyRow("Nothing published yet."));
  $("list").replaceChildren(...sorted.map((post) => {
    const a = document.createElement("a");
    a.href = postUrl(post);
    a.textContent = post.title;
    const sub = formatDate(post.createdAt) + (post.pinnedAt ? ` · pinned as “${post.pinLabel}”` : "");
    return listRow(a, sub,
      button(post.pinnedAt ? "Unpin" : "Pin", () => togglePin(post)),
      button("Edit", () => startEditing(post)),
      button("Delete", () => deletePost(post)));
  }));
}

function startEditing(post) {
  editingId = post.id;
  $("title").value = post.title;
  $("body").value = post.body;
  $("form-heading").textContent = "Edit post";
  $("save").textContent = "Save changes";
  $("cancel").hidden = false;
  message("");
  $("form-heading").scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  editingId = null;
  $("post-form").reset();
  $("form-heading").textContent = "New post";
  $("save").textContent = "Publish";
  $("cancel").hidden = true;
}

$("post-form").onsubmit = (e) => {
  e.preventDefault();
  const title = $("title").value.trim();
  const body = $("body").value.trim();
  if (!title || !body) return message("Title and text are both required.", "error");

  busy(async () => {
    try {
      const posts = files.posts.data;
      let next, note;
      if (editingId) {
        if (!posts.some((p) => p.id === editingId)) throw new Error("That post was deleted elsewhere.");
        next = posts.map((p) => p.id === editingId ? { ...p, title, body, updatedAt: new Date().toISOString() } : p);
        note = `Edit: ${title}`;
      } else {
        next = [...posts, { id: makeSlug(title), title, body, createdAt: new Date().toISOString() }];
        note = `New post: ${title}`;
      }
      await save("posts", next, note);
      resetForm();
      renderPosts();
      message("Saved. It will be live on the site in about a minute.");
    } catch (err) {
      message(err.message, "error"); 
    }
  });
};

$("cancel").onclick = () => { resetForm(); message(""); };

function togglePin(post) {
  const posts = files.posts.data;
  let next, note;
  if (post.pinnedAt) {
    next = posts.map((p) => {
      if (p.id !== post.id) return p;
      const { pinnedAt, pinLabel, ...rest } = p;
      return rest;
    });
    note = `Unpin: ${post.title}`;
  } else {
    if (pinnedPosts(posts).length >= MAX_PINS) {
      return message(`You can pin up to ${MAX_PINS} posts. Unpin one first.`, "error");
    }
    const label = prompt("Button text (keep it short):", post.title.slice(0, 30));
    if (label === null) return;
    const pinLabel = label.trim().slice(0, 40) || post.title.slice(0, 40);
    next = posts.map((p) => (p.id === post.id ? { ...p, pinLabel, pinnedAt: new Date().toISOString() } : p));
    note = `Pin: ${post.title}`;
  }
  busy(async () => {
    try {
      await save("posts", next, note);
      renderPosts();
      message(post.pinnedAt ? "Unpinned. The site updates in about a minute." : "Pinned. The button appears on the site in about a minute.");
    } catch (err) {
      message(err.message, "error");
    }
  });
}

function deletePost(post) {
  if (!confirm(`Delete “${post.title}”? This can't be undone from here.`)) return;
  busy(async () => {
    try {
      await save("posts", files.posts.data.filter((p) => p.id !== post.id), `Delete: ${post.title}`);
      if (editingId === post.id) resetForm();
      renderPosts();
      message("Deleted. The site updates in about a minute.");
    } catch (err) {
      message(err.message, "error");
    }
  });
}

// ---------- announcements ----------

function untilLabel(item) {
  if (!item.until) return "no end date";
  const date = formatDate(item.until + "T12:00:00");
  return isActive(item) ? `until ${date}` : `ended ${date} — no longer shown`;
}

function renderAnnouncements() {
  const items = files.ticker.data;
  if (!items.length) return $("ticker-list").replaceChildren(emptyRow("No announcements."));
  $("ticker-list").replaceChildren(...items.map((item) => {
    const text = document.createElement("strong");
    text.textContent = item.text;
    return listRow(text, untilLabel(item), button("Delete", () => deleteAnnouncement(item)));
  }));
}

$("ticker-form").onsubmit = (e) => {
  e.preventDefault();
  const text = $("ticker-text").value.trim();
  const until = $("ticker-until").value; // "" or YYYY-MM-DD
  if (!text) return message("Write the announcement first.", "error", "ticker-msg");

  busy(async () => {
    try {
      const kept = files.ticker.data.filter(isActive);
      const item = { id: crypto.randomUUID(), text, until };
      await save("ticker", [...kept, item], `Announcement: ${text}`);
      $("ticker-form").reset();
      renderAnnouncements();
      message("Added. It will show on the site in about a minute.", "ok", "ticker-msg");
    } catch (err) {
      message(err.message, "error", "ticker-msg");
    }
  });
};

function deleteAnnouncement(item) {
  if (!confirm(`Remove “${item.text}”?`)) return;
  busy(async () => {
    try {
      await save("ticker", files.ticker.data.filter((i) => i.id !== item.id), `Remove announcement: ${item.text}`);
      renderAnnouncements();
      message("Removed. The site updates in about a minute.", "ok", "ticker-msg");
    } catch (err) {
      message(err.message, "error", "ticker-msg");
    }
  });
}

// ---------- login ----------

function showLogin(error = "") {
  $("panel").hidden = true;
  $("nav").hidden = true;
  $("login").hidden = false;
  $("repo").value = repo;
  $("login-msg").textContent = error;
  $("login-msg").hidden = !error;
}

async function showPanel() {
  await Promise.all([load("posts"), load("ticker")]);
  $("login").hidden = true;
  $("panel").hidden = false;
  $("nav").hidden = false;
  renderPosts();
  renderAnnouncements();
}

$("login-form").onsubmit = (e) => {
  e.preventDefault();
  repo = $("repo").value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/+$/, "");
  token = $("token").value.replace(/[^\x21-\x7E]/g, "");
  busy(async () => {
    try {
      repo = await resolveRepo(repo);
      $("repo").value = repo;
      await showPanel();
      store.set("herald_repo", repo);
      store.set("herald_token", token);
      $("token").value = "";
    } catch (err) {
      token = null;
      showLogin(err.message);
    }
  });
};

$("logout").onclick = () => {
  store.del("herald_token");
  token = null;
  for (const f of Object.values(files)) { f.data = []; f.sha = null; }
  resetForm();
  message("");
  message("", "ok", "ticker-msg");
  showLogin();
};

(async () => {
  if (!token || !repo) return showLogin();
  try {
    repo = await resolveRepo(repo);
    await showPanel();
  } catch (err) {
    showLogin(err.message);
  }
})();
