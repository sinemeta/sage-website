import { get_topic, get_publishers } from "./api.js";

let publishers_by_id = new Map();

function esc(s) {
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function kw_pills(keywords = []) {
  return keywords.slice(0, 10).map(k => `<span class="pill">${esc(k)}</span>`).join("");
}

function meter(sign) {
  const pct = Math.max(0, Math.min(1, Number(sign))) * 100;
  return `<div class="meter" title="sign=${esc(sign)}"><div style="width:${pct}%"></div></div>`;
}

function publisher_name(pub_id) {
  const p = publishers_by_id.get(pub_id);
  return p ? p.name : `Publisher ${pub_id}`;
}

function article_row(a) {
  return `
    <article class="article">
      <a href="${esc(a.url)}" target="_blank" rel="noreferrer">
        <h4 class="a-title">${esc(a.title)}</h4>
      </a>
      <div class="a-meta">
        <span>${esc(publisher_name(a.publisher))}</span>
        <span>rel ${esc(a.relevance)}</span>
        <span>impact ${esc(a.impact)}</span>
        ${meter(a.sign)}
      </div>
      <div class="topic-kws" style="margin-top:8px;">${kw_pills(a.keywords)}</div>
    </article>
  `;
}

async function load_publishers() {
  const data = await get_publishers();
  publishers_by_id = new Map((data.items || []).map(p => [p.id, p]));
}

function get_topic_id() {
  const qs = new URLSearchParams(location.search);
  return qs.get("id") || "";
}

async function main() {
  const topic_id = get_topic_id();
  if (!topic_id) {
    document.getElementById("topic_title").textContent = "Missing topic id";
    return;
  }

  document.getElementById("copy_link_btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await navigator.clipboard.writeText(location.href);
    e.target.textContent = "Copied";
    setTimeout(() => e.target.textContent = "Copy link", 1200);
  });

  try {
    await load_publishers();
  } catch (_) {
    // still render without names
  }

  try {
    const t = await get_topic(topic_id);

    document.title = t.title;
    document.getElementById("topic_title").textContent = t.title;

    document.getElementById("topic_meta").innerHTML = `
      <span>${esc(t.date)}</span>
      <span>Relevance: ${esc(t.relevance)}</span>
      <span>ID: ${esc(t.id)}</span>
    `;
    document.getElementById("topic_kws").innerHTML = kw_pills(t.keywords);

    const pos = t.articles_pos || [];
    const neu = t.articles_neu || [];
    const neg = t.articles_neg || [];

    document.getElementById("pos_box").innerHTML = pos.map(article_row).join("") || `<div class="state">No positive articles.</div>`;
    document.getElementById("neu_box").innerHTML = neu.map(article_row).join("") || `<div class="state">No neutral articles.</div>`;
    document.getElementById("neg_box").innerHTML = neg.map(article_row).join("") || `<div class="state">No negative articles.</div>`;

  } catch (e) {
    document.getElementById("topic_title").textContent = `Failed to load topic: ${e.message}`;
  }
}

main();