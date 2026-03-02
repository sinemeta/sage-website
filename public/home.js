import { get_topics, get_publishers, search_all } from "./api.js";

let next_cursor = "";
let publishers_by_id = new Map();

function esc(s) {
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function kw_pills(keywords = []) {
  return keywords.slice(0, 6).map(k => `<span class="pill">${esc(k)}</span>`).join("");
}

function counts_line(counts) {
  const pos = counts?.pos ?? 0;
  const neu = counts?.neu ?? 0;
  const neg = counts?.neg ?? 0;
  return `
    <div class="counts">
      <span>Positive: ${pos}</span>
      <span>Neutral: ${neu}</span>
      <span>Negative: ${neg}</span>
    </div>
  `;
}

function topic_card(t) {
  return `
    <article class="card">
      <a href="topic.html?id=${encodeURIComponent(t.id)}">
        <h2 class="topic-title">${esc(t.title)}</h2>
      </a>
      <div class="meta">
        <span>${esc(t.date)}</span>
        <span>Relevance: ${esc(t.relevance)}</span>
        <span>ID: ${esc(t.id)}</span>
      </div>
      <div class="topic-kws">${kw_pills(t.keywords)}</div>
      ${counts_line(t.counts)}
    </article>
  `;
}

async function render_publishers() {
  const box = document.getElementById("publisher_list");
  try {
    const data = await get_publishers();
    publishers_by_id = new Map((data.items || []).map(p => [p.id, p]));
    box.innerHTML = (data.items || []).slice(0, 16).map(p => {
      return `<div class="card" style="padding:10px 0;">
        <div class="meta"><span>${esc(p.name)}</span><span>ID ${esc(p.id)}</span></div>
        <a class="small-link" href="${esc(p.url)}" target="_blank" rel="noreferrer">${esc(p.url)}</a>
      </div>`;
    }).join("") || `<div class="state">No publishers.</div>`;
  } catch (e) {
    box.textContent = `Failed to load publishers: ${e.message}`;
  }
}

async function load_topics({ append = false } = {}) {
  const box = document.getElementById("topics");
  try {
    if (!append) box.textContent = "Loading…";
    const data = await get_topics(20, next_cursor);
    const items = data.items || [];
    next_cursor = data.next_cursor || "";

    const html = items.map(topic_card).join("");
    if (append) box.insertAdjacentHTML("beforeend", html);
    else box.innerHTML = html || `<div class="state">No topics yet.</div>`;

    document.getElementById("topic_count").textContent = `${items.length} loaded`;
  } catch (e) {
    box.textContent = `Failed to load topics: ${e.message}`;
  }
}

async function do_search(q) {
  const box = document.getElementById("topics");
  box.textContent = "Searching…";
  try {
    const data = await search_all(q);
    // Assume it returns topics for now
    const items = data.items || [];
    box.innerHTML = items.map(topic_card).join("") || `<div class="state">No results.</div>`;
  } catch (e) {
    box.textContent = `Search failed: ${e.message}`;
  }
}

document.getElementById("refresh_btn").addEventListener("click", (e) => {
  e.preventDefault();
  next_cursor = "";
  load_topics({ append: false });
});

document.getElementById("load_more_btn").addEventListener("click", (e) => {
  e.preventDefault();
  if (!next_cursor) return;
  load_topics({ append: true });
});

document.getElementById("search_form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = document.getElementById("search_input").value.trim();
  if (!q) {
    next_cursor = "";
    load_topics({ append: false });
    return;
  }
  do_search(q);
});

render_publishers();
load_topics();