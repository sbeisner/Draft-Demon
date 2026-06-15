// Talks to the FastAPI backend. In Electron the main process can set
// window.DRAFTDEMON_API; otherwise we default to the local dev port.
const BASE =
  (typeof window !== "undefined" && window.DRAFTDEMON_API) || "http://localhost:8741";

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  list: () => req("GET", "/api/projects"),
  create: (b) => req("POST", "/api/projects", b),
  updateGoal: (id, b) => req("PUT", `/api/projects/${id}/goal`, b),
  remove: (id) => req("DELETE", `/api/projects/${id}`),
  addSheet: (id, b) => req("POST", `/api/projects/${id}/sheets`, b),
  saveSheet: (id, sid, b) => req("PUT", `/api/projects/${id}/sheets/${sid}`, b),
  stash: (id, sid, b) => req("PUT", `/api/projects/${id}/sheets/${sid}/stash`, b),
  restoreCut: (id, cid) => req("POST", `/api/projects/${id}/cuts/${cid}/restore`),
  setMilestone: (id, b) => req("PUT", `/api/projects/${id}/milestone`, b),
  health: () => req("GET", "/api/health"),
};

export { BASE };
