// Naming: foo_bar style where it helps readability
const api_base_url = ""; // keep "" for same-origin; set to "https://api.yoursite.com" if separate

async function api_get_json(path) {
  const res = await fetch(api_base_url + path, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return await res.json();
}

export async function get_publishers() {
  return await api_get_json("/api/publishers");
}

export async function get_topics(limit = 20, cursor = "") {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", cursor);
  return await api_get_json(`/api/topics?${qs.toString()}`);
}

export async function get_topic(topic_id) {
  return await api_get_json(`/api/topics/${encodeURIComponent(topic_id)}`);
}

export async function search_all(q) {
  const qs = new URLSearchParams();
  qs.set("q", q);
  return await api_get_json(`/api/search?${qs.toString()}`);
}