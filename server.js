const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const SEED = path.join(ROOT, "data", "db.json");
const LOCAL_DB = process.env.DB_PATH || path.join("/tmp", "slack-sidebar.json");
const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGODB_DB || "slack";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function seedData() {
  try { return JSON.parse(fs.readFileSync(SEED, "utf8")); } catch { return { channels: [], messages: [] }; }
}

let storePromise = null;
async function store() {
  if (!MONGO_URI) return null;
  if (!storePromise) {
    storePromise = (async () => {
      const { MongoClient } = require("mongodb");
      const client = new MongoClient(MONGO_URI);
      await client.connect();
      const database = client.db(MONGO_DB);
      const channels = database.collection("channels");
      const messages = database.collection("messages");
      if ((await channels.countDocuments()) === 0) {
        const seed = seedData();
        if (seed.channels?.length) await channels.insertMany(seed.channels);
        if (seed.messages?.length) await messages.insertMany(seed.messages);
      }
      return { channels, messages };
    })();
  }
  return storePromise;
}

function localRead() {
  try { if (fs.existsSync(LOCAL_DB)) return JSON.parse(fs.readFileSync(LOCAL_DB, "utf8")); } catch {}
  const seed = seedData(); localWrite(seed); return seed;
}
function localWrite(db) { fs.writeFileSync(LOCAL_DB, JSON.stringify(db, null, 2)); }
function send(res, status, body, type = TYPES[".json"]) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}
function file(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
    send(res, 200, data, TYPES[path.extname(filePath)] || "application/octet-stream");
  });
}
function slug(name) {
  return String(name || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]/g, "").slice(0, 20);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const db = await store();
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
      return send(res, 200, { ok: true, store: db ? "mongodb" : "local" });
    }
    if (req.method === "GET" && url.pathname === "/api/channels") {
      const rows = db ? await db.channels.find({}, { projection: { _id: 0 } }).toArray() : localRead().channels;
      return send(res, 200, rows);
    }
    if (req.method === "POST" && url.pathname === "/api/channels") {
      const name = slug((await body(req)).name);
      if (!name) return send(res, 400, { error: "nombre" });
      const channel = { id: name, name };
      if (db) {
        if (await db.channels.findOne({ id: name })) return send(res, 409, { error: "existe" });
        await db.channels.insertOne({ ...channel });
      } else {
        const local = localRead();
        if (local.channels.some((c) => c.id === name)) return send(res, 409, { error: "existe" });
        local.channels.push(channel); localWrite(local);
      }
      return send(res, 201, channel);
    }
    const msgs = url.pathname.match(/^\/api\/channels\/([^/]+)\/messages$/);
    if (msgs) {
      const id = msgs[1];
      if (db) {
        if (!(await db.channels.findOne({ id }))) return send(res, 404, { error: "no" });
        if (req.method === "GET") {
          const list = await db.messages.find({ channelId: id }, { projection: { _id: 0 } }).toArray();
          list.sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
          return send(res, 200, list);
        }
        if (req.method === "POST") {
          const text = String((await body(req)).text || "").trim().slice(0, 400);
          if (!text) return send(res, 400, { error: "vacio" });
          const msg = { id: "m" + Date.now(), channelId: id, user: "vos", text, at: Date.now() };
          await db.messages.insertOne({ ...msg });
          return send(res, 201, msg);
        }
      } else {
        const local = localRead();
        if (!local.channels.some((c) => c.id === id)) return send(res, 404, { error: "no" });
        if (req.method === "GET") {
          const list = (local.messages || []).filter((m) => m.channelId === id);
          list.sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
          return send(res, 200, list);
        }
        if (req.method === "POST") {
          const text = String((await body(req)).text || "").trim().slice(0, 400);
          if (!text) return send(res, 400, { error: "vacio" });
          const msg = { id: "m" + Date.now(), channelId: id, user: "vos", text, at: Date.now() };
          local.messages = local.messages || [];
          local.messages.push(msg); localWrite(local);
          return send(res, 201, msg);
        }
      }
    }
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
    file(res, path.join(PUBLIC, safe));
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "store", detail: String(err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT} store=${MONGO_URI ? "mongodb" : "local"}`);
});
