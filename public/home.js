import {
  get_topics,
  get_publishers,
  search_all,
  get_viewer_settings,
  put_viewer_settings,
  get_publisher_sentiment_spread,
} from "./api.js";

let next_cursor = "";
let settings = null;
let topic_cache = [];
let publisher_spread_cache = new Map();

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

function bucket_from_score(sign) {
  const low = Number(settings?.neutral_band_low ?? -0.15);
  const high = Number(settings?.neutral_band_high ?? 0.15);
  if (sign <= low) return "negative";
  if (sign >= high) return "positive";
  return "neutral";
}

function format_score(sign) {
  const s = normalize_score(sign);
  return s > 0 ? `+${s.toFixed(2)}` : s.toFixed(2);
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

function kw_pills(keywords = []) {
  return (keywords || []).slice(0, 6).map((k) => `<span class="pill">${esc(k)}</span>`).join("");
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

function sort_topics(items) {
  const sortMode = settings?.sort_mode ?? "relevance";
  const copy = [...items];
  if (sortMode === "newest") {
    copy.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  } else if (sortMode === "most_positive") {
    copy.sort((a, b) => normalize_score(b.avg_sentiment) - normalize_score(a.avg_sentiment));
  } else if (sortMode === "most_negative") {
    copy.sort((a, b) => normalize_score(a.avg_sentiment) - normalize_score(b.avg_sentiment));
  } else {
    copy.sort((a, b) => Number(b.relevance ?? 0) - Number(a.relevance ?? 0));
  }
  return copy;
}

function visible_topics(items) {
  const hidden = new Set(settings?.hidden_publishers ?? []);
  if (!hidden.size) return items;
  return items.filter((t) => !(t.top_publishers || []).some((p) => hidden.has(p)));
}

function topic_card(t) {
  const avg = normalize_score(t.avg_sentiment);
  const bucket = bucket_from_score(avg);
  return `
    <article class="card topic-card">
      <a class="topic-link" href="./topic.html?id=${encodeURIComponent(t.id)}">
        <h2 class="topic-title">${esc(t.title)}</h2>
      </a>
      <div class="meta">
        <span>${esc(t.date)}</span>
        <span>Relevance: ${esc(t.relevance ?? "—")}</span>
        <span>Articles: ${esc(t.article_count ?? ((t.counts?.pos ?? 0) + (t.counts?.neu ?? 0) + (t.counts?.neg ?? 0)))}</span>
        <span>Sentiment: ${format_score(avg)} (${bucket})</span>
      </div>
      <div class="topic-kws">${kw_pills(t.keywords)}</div>
      <div class="sentiment-row">
        ${sentiment_meter(avg)}
        <span class="sentiment-label">Average topic sentiment</span>
      </div>
      ${counts_line(t.counts)}
    </article>
  `;
}

function parse_csv_list(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function fill_settings_form(data) {
  document.getElementById("sentiment_mode_input").value = data.sentiment_mode ?? "continuous";
  document.getElementById("neutral_low_input").value = data.neutral_band_low ?? -0.15;
  document.getElementById("neutral_high_input").value = data.neutral_band_high ?? 0.15;
  document.getElementById("sort_mode_input").value = data.sort_mode ?? "relevance";
  document.getElementById("publisher_window_input").value = String(data.publisher_window_days ?? 30);
  document.getElementById("hidden_publishers_input").value = (data.hidden_publishers || []).join(", ");
  document.getElementById("preferred_publishers_input").value = (data.preferred_publishers || []).join(", ");
}

function form_settings_payload() {
  return {
    sentiment_mode: document.getElementById("sentiment_mode_input").value,
    neutral_band_low: Number(document.getElementById("neutral_low_input").value),
    neutral_band_high: Number(document.getElementById("neutral_high_input").value),
    sort_mode: document.getElementById("sort_mode_input").value,
    publisher_window_days: Number(document.getElementById("publisher_window_input").value),
    hidden_publishers: parse_csv_list(document.getElementById("hidden_publishers_input").value),
    preferred_publishers: parse_csv_list(document.getElementById("preferred_publishers_input").value),
  };
}

async function render_settings() {
  const status = document.getElementById("settings_state");
  const form = document.getElementById("settings_form");
  try {
    settings = await get_viewer_settings();
    fill_settings_form(settings);
    status.classList.add("hidden");
    form.classList.remove("hidden");
  } catch (e) {
    status.textContent = `Failed to load settings: ${e.message}`;
  }
}

async function on_save_settings(e) {
  e.preventDefault();
  const saveState = document.getElementById("settings_save_state");
  const payload = form_settings_payload();
  if (payload.neutral_band_low > payload.neutral_band_high) {
    saveState.textContent = "Neutral low must be less than or equal to neutral high.";
    return;
  }
  saveState.textContent = "Saving…";
  try {
    await put_viewer_settings(payload);
    settings = payload;
    saveState.textContent = "Saved.";
    rerender_topics();
    await render_publishers();
  } catch (err) {
    saveState.textContent = `Save failed: ${err.message}`;
  }
}

async function render_publishers() {
  const box = document.getElementById("publisher_list");
  box.textContent = "Loading…";
  try {
    const data = await get_publishers();
    const items = (data.items || []).filter((p) => !(settings?.hidden_publishers || []).includes(p.id));
    const preferred = new Set(settings?.preferred_publishers || []);
    items.sort((a, b) => {
      const ap = preferred.has(a.id) ? 1 : 0;
      const bp = preferred.has(b.id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return Number(b.article_count ?? 0) - Number(a.article_count ?? 0);
    });

    const windowDays = Number(settings?.publisher_window_days ?? 30);
    const htmlParts = [];
    for (const p of items.slice(0, 12)) {
      let spread = publisher_spread_cache.get(`${p.id}:${windowDays}`);
      if (!spread) {
        try {
          spread = await get_publisher_sentiment_spread(p.id, windowDays);
          publisher_spread_cache.set(`${p.id}:${windowDays}`, spread);
        } catch (_) {
          spread = null;
        }
      }
      const distribution = spread?.distribution || p.sentiment_distribution || {};
      const avg = spread?.avg_sentiment ?? p.avg_sentiment ?? 0;
      htmlParts.push(`
        <article class="publisher-card card compact-card">
          <div class="publisher-topline">
            <div>
              <div class="publisher-name">${esc(p.name)}</div>
              <div class="small-note">${esc(p.id)} · ${esc(p.article_count ?? 0)} articles</div>
            </div>
            <a href="${esc(p.url)}" target="_blank" rel="noreferrer" class="small-link">Visit</a>
          </div>
          <div class="small-note">Average sentiment ${format_score(avg)}</div>
          <div class="sentiment-row">
            ${sentiment_meter(avg)}
          </div>
          <div class="stacked-bar" aria-label="publisher sentiment spread">
            <span class="stack-neg" style="width:${Math.max(0, Number(distribution.negative ?? 0)) * 100}%"></span>
            <span class="stack-neu" style="width:${Math.max(0, Number(distribution.neutral ?? 0)) * 100}%"></span>
            <span class="stack-pos" style="width:${Math.max(0, Number(distribution.positive ?? 0)) * 100}%"></span>
          </div>
          <div class="counts compact-counts">
            <span>Pos ${(Number(distribution.positive ?? 0) * 100).toFixed(0)}%</span>
            <span>Neu ${(Number(distribution.neutral ?? 0) * 100).toFixed(0)}%</span>
            <span>Neg ${(Number(distribution.negative ?? 0) * 100).toFixed(0)}%</span>
          </div>
        </article>
      `);
    }
    box.innerHTML = htmlParts.join("") || `<div class="state">No publishers match your filters.</div>`;
  } catch (e) {
    box.textContent = `Failed to load publishers: ${e.message}`;
  }
}

function rerender_topics() {
  const box = document.getElementById("topics");
  const visible = sort_topics(visible_topics(topic_cache));
  box.innerHTML = visible.map(topic_card).join("") || `<div class="state">No topics yet.</div>`;
  document.getElementById("topic_count").textContent = `${visible.length} loaded`;
  document.getElementById("load_more_btn").disabled = !next_cursor;
}

async function load_topics({ append = false } = {}) {
  const box = document.getElementById("topics");
  try {
    if (!append) box.textContent = "Loading…";
    const data = await get_topics(20, next_cursor);
    const items = data.items || [];
    next_cursor = data.next_cursor || "";
    topic_cache = append ? [...topic_cache, ...items] : items;
    rerender_topics();
  } catch (e) {
    box.textContent = `Failed to load topics: ${e.message}`;
  }
}

async function do_search(q) {
  const box = document.getElementById("topics");
  box.textContent = "Searching…";
  try {
    const data = await search_all(q);
    topic_cache = data.items || [];
    next_cursor = "";
    rerender_topics();
  } catch (e) {
    box.textContent = `Search failed: ${e.message}`;
  }
}

document.getElementById("refresh_btn").addEventListener("click", (e) => {
  e.preventDefault();
  next_cursor = "";
  topic_cache = [];
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

document.getElementById("settings_form").addEventListener("submit", on_save_settings);

await render_settings();
await render_publishers();
await load_topics();
