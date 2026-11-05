#!/usr/bin/env node
/**
 * A tiny local stand-in for Flutterwave's v3 API, used by the automated tests
 * and for clicking through checkout without real keys or real money.
 * It is NOT Flutterwave: it only mimics the few endpoints the app calls.
 *
 *   node scripts/fake-flutterwave.mjs            (port 4010)
 *   then run the API with:
 *     FLW_API_BASE=http://127.0.0.1:4010/v3
 *     FLW_SECRET_KEY=FLWSECK_TEST-fake
 *     FLW_SECRET_HASH=fake-webhook-hash
 *     FAKE_FLW_WEBHOOK_URL=http://localhost:8080/api/payments/webhook/flutterwave   (optional: send webhooks)
 *
 * Endpoints the app uses:  POST /v3/payments, GET /v3/transactions/:id/verify,
 *                          GET /v3/transactions/verify_by_reference?tx_ref=
 * Test controls:           POST /__control/set {tx_ref, status, amount?, currency?}
 *                          GET  /__control/tx?tx_ref=   GET /__control/requests
 * Fake hosted page:        GET /pay/:tx_ref  (buttons: pay with MTN / Airtel / fail)
 */
import http from "node:http";
import { pathToFileURL } from "node:url";

export function startFakeFlutterwave({ port = Number(process.env.FAKE_FLW_PORT ?? 4010), secretKey = process.env.FLW_SECRET_KEY ?? "FLWSECK_TEST-fake", webhookUrl = process.env.FAKE_FLW_WEBHOOK_URL, webhookHash = process.env.FLW_SECRET_HASH ?? "fake-webhook-hash" } = {}) {
  const txs = new Map(); // tx_ref -> transaction
  const requests = [];
  let nextId = 900001;

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
      });
    });
  const view = (t) => ({ id: t.id, tx_ref: t.tx_ref, flw_ref: `FLW-FAKE-${t.id}`, amount: t.paidAmount ?? t.amount, currency: t.paidCurrency ?? t.currency, status: t.status, payment_type: t.payment_type, processor_response: t.status === "successful" ? "Approved" : t.status === "failed" ? "Declined" : "Pending", customer: t.customer });

  async function sendWebhook(t) {
    if (!webhookUrl) return;
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "verif-hash": webhookHash },
      body: JSON.stringify({ event: "charge.completed", data: view(t) }),
    }).catch(() => undefined);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;
    if (p.startsWith("/v3/")) {
      requests.push({ method: req.method, path: p + url.search, at: Date.now() });
      if (req.headers.authorization !== `Bearer ${secretKey}`) return send(res, 401, { status: "error", message: "Invalid authorization key" });
    }

    if (req.method === "POST" && p === "/v3/payments") {
      const b = await readBody(req);
      if (!b.tx_ref || !b.amount || !b.currency || !b.redirect_url) return send(res, 400, { status: "error", message: "tx_ref, amount, currency and redirect_url are required" });
      const t = { id: nextId++, tx_ref: b.tx_ref, amount: Number(b.amount), currency: b.currency, status: "pending", redirect_url: b.redirect_url, customer: b.customer, options: b.payment_options, payment_type: null, seen: false };
      txs.set(b.tx_ref, t);
      return send(res, 200, { status: "success", message: "Hosted Link", data: { link: `http://${req.headers.host}/pay/${encodeURIComponent(b.tx_ref)}` } });
    }
    let m = p.match(/^\/v3\/transactions\/(\d+)\/verify$/);
    if (req.method === "GET" && m) {
      const t = [...txs.values()].find((x) => String(x.id) === m[1] && x.seen);
      return t ? send(res, 200, { status: "success", data: view(t) }) : send(res, 404, { status: "error", message: "No transaction was found for this id" });
    }
    if (req.method === "GET" && p === "/v3/transactions/verify_by_reference") {
      const t = txs.get(url.searchParams.get("tx_ref") ?? "");
      return t && t.seen ? send(res, 200, { status: "success", data: view(t) }) : send(res, 400, { status: "error", message: "No transaction was found for this tx_ref" });
    }

    // ---- test controls
    if (req.method === "POST" && p === "/__control/set") {
      const b = await readBody(req);
      const t = txs.get(b.tx_ref);
      if (!t) return send(res, 404, { error: "unknown tx_ref" });
      Object.assign(t, { status: b.status ?? t.status, seen: true, payment_type: b.payment_type ?? "mobilemoneyug" });
      if (b.amount !== undefined) t.paidAmount = Number(b.amount);
      if (b.currency !== undefined) t.paidCurrency = b.currency;
      return send(res, 200, { ok: true, data: view(t) });
    }
    if (req.method === "GET" && p === "/__control/tx") {
      const t = txs.get(url.searchParams.get("tx_ref") ?? "") ?? [...txs.values()].at(-1);
      return t ? send(res, 200, { ...view(t), redirect_url: t.redirect_url, options: t.options }) : send(res, 404, { error: "none" });
    }
    if (req.method === "GET" && p === "/__control/requests") return send(res, 200, requests);

    // ---- fake hosted checkout page (for manual testing / screenshots)
    m = p.match(/^\/pay\/([^/]+)(\/(complete))?$/);
    if (req.method === "GET" && m) {
      const t = txs.get(decodeURIComponent(m[1]));
      if (!t) return send(res, 404, { error: "unknown payment" });
      if (m[3]) {
        const outcome = url.searchParams.get("status") === "failed" ? "failed" : "successful";
        Object.assign(t, { status: outcome, seen: true, payment_type: url.searchParams.get("type") ?? "mobilemoneyug" });
        await sendWebhook(t);
        const back = new URL(t.redirect_url);
        back.searchParams.set("status", outcome === "successful" ? "successful" : "failed");
        back.searchParams.set("tx_ref", t.tx_ref);
        back.searchParams.set("transaction_id", String(t.id));
        res.writeHead(302, { location: back.toString() });
        return res.end();
      }
      const amount = new Intl.NumberFormat("en", { style: "currency", currency: t.currency, maximumFractionDigits: 0 }).format(t.amount);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Fake Flutterwave checkout</title>
<body style="font-family:system-ui;background:#f5f5f5;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="background:#fff;padding:32px;border-radius:16px;box-shadow:0 10px 30px #0002;max-width:380px;width:90%">
<p style="background:#fff3cd;padding:8px 12px;border-radius:8px;font-size:13px">TEST MODE — local fake, no real money moves.</p>
<h2 style="margin:8px 0">Pay ${amount}</h2><p style="color:#666;font-size:14px">Ref ${t.tx_ref}</p>
<a href="/pay/${encodeURIComponent(t.tx_ref)}/complete?status=successful&type=mobilemoneyug" style="display:block;background:#ffcb05;color:#000;padding:14px;border-radius:10px;text-align:center;text-decoration:none;font-weight:700;margin:8px 0">Pay with MTN MoMo</a>
<a href="/pay/${encodeURIComponent(t.tx_ref)}/complete?status=successful&type=mobilemoneyug" style="display:block;background:#e40000;color:#fff;padding:14px;border-radius:10px;text-align:center;text-decoration:none;font-weight:700;margin:8px 0">Pay with Airtel Money</a>
<a href="/pay/${encodeURIComponent(t.tx_ref)}/complete?status=failed" style="display:block;color:#b00;text-align:center;margin-top:12px">Simulate a failed payment</a></div>`);
    }
    send(res, 404, { error: "not found" });
  });

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port, txs, requests })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await startFakeFlutterwave();
  console.log(`Fake Flutterwave listening on http://127.0.0.1:${port}/v3`);
}
