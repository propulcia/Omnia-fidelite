// Relais Apple Wallet pour Omnia Club : reçoit les jetons depuis le site et envoie l'alerte Apple (HTTP/2).
import http from "node:http";
import http2 from "node:http2";

// Le certificat est envoyé par le site à chaque appel (jamais stocké ici).
const { RELAY_SECRET, PORT = "8080" } = process.env;
if (!RELAY_SECRET) { console.error("missing RELAY_SECRET"); process.exit(1); }

function push(apns, topic, token) {
  return new Promise((resolve) => {
    const req = apns.request({ ":method": "POST", ":path": `/3/device/${token}`, "apns-topic": topic, "apns-push-type": "background", "apns-priority": "5" });
    let status = 0;
    req.on("response", (h) => { status = h[":status"]; });
    req.on("data", () => {});
    req.on("end", () => resolve(status));
    req.on("error", () => resolve(0));
    req.end("{}");
  });
}

http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") { res.end("ok"); return; }
  if (req.method !== "POST" || req.url !== "/push" || req.headers.authorization !== `Bearer ${RELAY_SECRET}`) { res.writeHead(401).end(); return; }
  let body = ""; for await (const c of req) { body += c; if (body.length > 50000) { res.writeHead(413).end(); return; } }
  let p = {};
  try { p = JSON.parse(body); } catch {}
  const { tokens, topic, cert, key } = p;
  if (!Array.isArray(tokens) || typeof topic !== "string" || typeof cert !== "string" || typeof key !== "string") { res.writeHead(400).end(); return; }
  const valid = tokens.filter((t) => typeof t === "string" && /^[A-Fa-f0-9]{16,200}$/.test(t)).slice(0, 50);
  const apns = http2.connect("https://api.push.apple.com", { cert, key });
  apns.on("error", (e) => console.error("apns", e.message));
  const results = await Promise.all(valid.map((t) => push(apns, topic, t)));
  apns.close();
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ results }));
}).listen(Number(PORT), () => console.log("relay on", PORT));
