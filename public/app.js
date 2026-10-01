const nav = document.querySelector("#nav");
const log = document.querySelector("#log");
const title = document.querySelector("#title");
const storeEl = document.querySelector("#store");
let channel = "general";
document.querySelector("#add").addEventListener("submit", async (event) => {
  event.preventDefault();
  const res = await fetch("/api/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: document.querySelector("#name").value }),
  });
  document.querySelector("#name").value = "";
  if (res.ok) {
    const created = await res.json();
    channel = created.id;
    title.textContent = "#" + channel;
  }
  channels();
  messages();
});
document.querySelector("#send").addEventListener("submit", async (event) => {
  event.preventDefault();
  await fetch("/api/channels/" + channel + "/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: document.querySelector("#text").value }),
  });
  document.querySelector("#text").value = "";
  messages();
});
nav.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-id]");
  if (!btn) return;
  channel = btn.dataset.id;
  title.textContent = "#" + channel;
  channels();
  messages();
});
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "<" + "lt;");
}
async function channels() {
  const list = await (await fetch("/api/channels")).json();
  nav.innerHTML = list.map((c) => `<button type="button" data-id="${c.id}" class="${c.id === channel ? "is-on" : ""}"># ${escapeHtml(c.name)}</button>`).join("");
}
async function messages() {
  const res = await fetch("/api/channels/" + channel + "/messages");
  const list = res.ok ? await res.json() : [];
  log.innerHTML = list.map((m) => `<p><small>@${escapeHtml(m.user)}</small><br>${escapeHtml(m.text)}</p>`).join("");
  log.scrollTop = log.scrollHeight;
}
async function boot() {
  const health = await (await fetch("/health")).json();
  storeEl.textContent = health.store === "mongodb" ? "MongoDB" : "Local";
  await channels();
  await messages();
}
boot();
