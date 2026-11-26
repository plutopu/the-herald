// Shared helpers for the public pages and the admin page.
// Everything is rendered with textContent, so post text can never inject HTML.

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function newestFirst(posts) {
  return [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Blank lines separate paragraphs; single newlines become line breaks.
function renderBody(container, text) {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    const p = document.createElement("p");
    para.split("\n").forEach((line, i) => {
      if (i) p.append(document.createElement("br"));
      p.append(line);
    });
    container.append(p);
  }
}

function postUrl(post) {
  return `post.html?id=${encodeURIComponent(post.id)}`;
}

function articleElement(post) {
  const article = document.createElement("article");
  const h1 = document.createElement("h1");
  const link = document.createElement("a");
  link.href = postUrl(post);
  link.textContent = post.title;
  h1.append(link);
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = formatDate(post.createdAt);
  if (post.updatedAt) meta.textContent += ` · updated ${formatDate(post.updatedAt)}`;
  article.append(h1, meta);
  renderBody(article, post.body);
  return article;
}

async function fetchPublishedPosts() {
  const res = await fetch("posts.json", { cache: "no-cache" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Could not load posts (${res.status})`);
  return newestFirst(await res.json());
}

// ---------- announcements (ticker.json) ----------

function todayISO() {
  return new Date().toLocaleDateString("en-CA"); 
}

function isActive(item) {
  return !item.until || item.until >= todayISO(); 
}

async function fetchAnnouncements() {
  const res = await fetch("ticker.json", { cache: "no-cache" });
  if (!res.ok) return []; 
  return (await res.json()).filter(isActive);
}

const TICKER_SPEED = 20;

function renderTicker(el, items) {
  if (!items.length) return;
  const label = document.createElement("span");
  label.className = "ticker-label";
  label.textContent = "important";

  const viewport = document.createElement("div");
  viewport.className = "ticker-viewport";
  const track = document.createElement("div");
  track.className = "ticker-track";
  viewport.append(track);

  const makeGroup = () => {
    const group = document.createElement("div");
    group.className = "ticker-group";
    for (const item of items) {
      const span = document.createElement("span");
      span.className = "ticker-item";
      span.textContent = item.text;
      group.append(span);
    }
    return group;
  };

  const group = makeGroup();
  track.append(group);
  el.append(label, viewport);
  el.hidden = false;


  for (let i = 0; i < 20 && group.scrollWidth < viewport.clientWidth; i++) {
    group.append(...makeGroup().children);
  }
  const copy = group.cloneNode(true);
  copy.setAttribute("aria-hidden", "true");
  track.append(copy);
  track.style.setProperty("--duration", `${Math.max(group.scrollWidth / TICKER_SPEED, 12)}s`);
}

const MAX_PINS = 3;

function pinnedPosts(posts) {
  return posts.filter((p) => p.pinnedAt).sort((a, b) => a.pinnedAt.localeCompare(b.pinnedAt)).slice(0, MAX_PINS);
}

function renderPins(el, posts, currentId) {
  const pinned = pinnedPosts(posts);
  if (!pinned.length) return;
  el.replaceChildren(...pinned.map((post) => {
    const a = document.createElement("a");
    a.href = postUrl(post);
    a.textContent = post.pinLabel || post.title;
    a.title = post.title;
    if (post.id === currentId) a.setAttribute("aria-current", "page");
    return a;
  }));
  el.hidden = false;
}

function showMessage(container, text) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  container.replaceChildren(p);
}
