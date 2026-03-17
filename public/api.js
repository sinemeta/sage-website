const api_base_url = "";

async function api_get_json(path) {
  const res = await fetch(api_base_url + path, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return await res.json();
}

async function api_send_json(path, method, body) {
  const res = await fetch(api_base_url + path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

export async function get_viewer_settings() {
  return await api_get_json("/api/viewer/settings");
}

export async function put_viewer_settings(body) {
  return await api_send_json("/api/viewer/settings", "PUT", body);
}

export async function get_publisher_sentiment_spread(publisher_id, days = 30) {
  const qs = new URLSearchParams();
  qs.set("days", String(days));
  return await api_get_json(`/api/publishers/${encodeURIComponent(publisher_id)}/sentiment-spread?${qs.toString()}`);
}
