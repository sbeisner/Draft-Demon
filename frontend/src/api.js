// Talks to the FastAPI backend. In Electron the main process can set
// window.DRAFTDEMON_API; otherwise we default to the local dev port.
// Every request carries the Supabase access token as a Bearer header; on a 401
// we refresh the session once and retry before giving up.
import { supabase } from "./supabaseClient.js";

const BASE =
  (typeof window !== "undefined" && window.DRAFTDEMON_API) || "http://localhost:8741";

async function authHeader() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function req(method, path, body, _retried = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && supabase && !_retried) {
    const { data } = await supabase.auth.refreshSession();
    if (data?.session) return req(method, path, body, true);
  }
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// Compile is a file download. window.open can't carry the auth header, so fetch
// the .docx as an authenticated blob and trigger the download from it.
async function compile(id) {
  const res = await fetch(`${BASE}/api/projects/${id}/compile.docx`, { headers: await authHeader() });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename="?([^"]+)"?/.exec(cd);
  const name = m ? m[1] : "manuscript.docx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  list: () => req("GET", "/api/projects"),
  create: (b) => req("POST", "/api/projects", b),
  updateGoal: (id, b) => req("PUT", `/api/projects/${id}/goal`, b),
  remove: (id) => req("DELETE", `/api/projects/${id}`),
  addSheet: (id, b) => req("POST", `/api/projects/${id}/sheets`, b),
  deleteSheet: (id, sid) => req("DELETE", `/api/projects/${id}/sheets/${sid}`),
  saveSheet: (id, sid, b) => req("PUT", `/api/projects/${id}/sheets/${sid}`, b),
  stash: (id, sid, b) => req("PUT", `/api/projects/${id}/sheets/${sid}/stash`, b),
  setInclude: (id, sid, include) => req("PUT", `/api/projects/${id}/sheets/${sid}/include`, { include }),
  compile,
  restoreCut: (id, cid) => req("POST", `/api/projects/${id}/cuts/${cid}/restore`),
  setMilestone: (id, b) => req("PUT", `/api/projects/${id}/milestone`, b),
  addTask: (id, text) => req("POST", `/api/projects/${id}/tasks`, { text }),
  updateTask: (id, tid, b) => req("PUT", `/api/projects/${id}/tasks/${tid}`, b),
  deleteTask: (id, tid) => req("DELETE", `/api/projects/${id}/tasks/${tid}`),
  addWord: (id, word) => req("POST", `/api/projects/${id}/dictionary`, { word }),
  removeWord: (id, word) => req("DELETE", `/api/projects/${id}/dictionary/${encodeURIComponent(word)}`),
  health: () => req("GET", "/api/health"),
  // app state
  getState: () => req("GET", "/api/state"),
  setActive: (id) => req("PUT", "/api/state", { active_project_id: id }),
};

export { BASE };
