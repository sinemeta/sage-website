import { get_topic, get_publishers } from "./api.js";

let publishers_by_id = new Map();
let topic_data = null;

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalize_score(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function format_score(sign) {
  const s = normalize_score(sign);
  return s > 0 ? `+${s.toFixed(2)}` : s.toFixed(2);
}

function kw_pills(keywords = []) {
  return (keywords || []).slice(0, 10).map((k) => `<span class="pill">${esc(k)}</span>`).join("");
}

function sentiment_meter(sign) {
  const s = normalize_score(sign);
  const posPct = s >= 0 ? s * 50 : 0;
  const negPct = s < 0 ? Math.abs(s) * 50 : 0;
  return `
    <div class="sentiment-meter" aria-label="sentiment ${format_score(s)}">
      <div class="sentiment-half negative"><div class="fill" style="width:${negPct}%"></div></div>
      <div class="sentiment-half positive"><div class="fill" style="width:${posPct}%"></div></div>
      <div class="sentiment-center"></div>
    </div>
  `;
}

function publisher_name(pub_id) {
  const p = publishers_by_id.get(pub_id);
  return p ? p.name : `Publisher ${pub_id}`;
}

function sort_articles(items) {
  const mode = document.getElementById("article_sort").value;
  const copy = [...items];
  if (mode === "newest") {
    copy.sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")));
  } else if (mode === "most_positive") {
    copy.sort((a, b) => normalize_score(b.sign) - normalize_score(a.sign));
  } else if (mode === "most_negative") {
    copy.sort((a, b) => normalize_score(a.sign) - normalize_score(b.sign));
  } else {
    copy.sort((a, b) => Number(b.relevance ?? 0) - Number(a.relevance ?? 0));
  }
  return copy;
}

function article_row(a) {
  return `
    <article class="article">
      <a class="a-title" href="${esc(a.url || "#")}" target="_blank" rel="noreferrer">${esc(a.title)}</a>
      <div class="a-meta">
        <span>${esc(publisher_name(a.publisher))}</span>
        <span>Rel ${esc(a.relevance ?? "—")}</span>
        <span>Impact ${esc(a.impact ?? "—")}</span>
        <span>Sentiment ${format_score(a.sign)}</span>
        ${a.published_at ? `<span>${esc(a.published_at)}</span>` : ""}
      </div>
      <div class="sentiment-row">
        ${sentiment_meter(a.sign)}
      </div>
      <div class="topic-kws">${kw_pills(a.keywords)}</div>
    </article>
  `;
}

async function load_publishers() {
  const data = await get_publishers();
  publishers_by_id = new Map((data.items || []).map((p) => [p.id, p]));
}

function get_topic_id() {
  const qs = new URLSearchParams(location.search);
  return qs.get("id") || "";
}

function render_columns() {
  if (!topic_data) return;
  const pos = sort_articles(topic_data.articles_pos || []);
  const neu = sort_articles(topic_data.articles_neu || []);
  const neg = sort_articles(topic_data.articles_neg || []);
  document.getElementById("pos_box").innerHTML = pos.map(article_row).join("") || `<div class="state">No positive articles.</div>`;
  document.getElementById("neu_box").innerHTML = neu.map(article_row).join("") || `<div class="state">No neutral articles.</div>`;
  document.getElementById("neg_box").innerHTML = neg.map(article_row).join("") || `<div class="state">No negative articles.</div>`;
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
    setTimeout(() => { e.target.textContent = "Copy link"; }, 1200);
  });

  document.getElementById("article_sort").addEventListener("change", render_columns);

  try {
    await load_publishers();
  } catch (_) {
    // continue without names
  }

  try {
    topic_data = await get_topic(topic_id);
    document.title = topic_data.title || "Topic";
    document.getElementById("topic_title").textContent = topic_data.title;
    document.getElementById("topic_meta").innerHTML = `
      <span>${esc(topic_data.date)}</span>
      <span>Relevance: ${esc(topic_data.relevance ?? "—")}</span>
      <span>ID: ${esc(topic_data.id)}</span>
      <span>Average sentiment: ${format_score(topic_data.avg_sentiment ?? 0)}</span>
    `;
    document.getElementById("topic_kws").innerHTML = kw_pills(topic_data.keywords);
    render_columns();
  } catch (e) {
    document.getElementById("topic_title").textContent = `Failed to load topic: ${e.message}`;
  }
}

main();
