#!/usr/bin/env node
/**
 * End-to-end API tests: security, roles, CSRF, payments (webhook signature +
 * idempotency), stock, tracking, newsletter, reviews, audit log.
 *
 * Easiest: `pnpm test` (scripts/run-tests.mjs starts a clean database, a fake
 * Flutterwave and the API, then runs this file).
 *
 * Against an already-running DEV server (it creates test data + users!):
 *   API_URL=http://localhost:8080 OWNER_USERNAME=... OWNER_EMAIL=... OWNER_PASSWORD=... node scripts/smoke-test.mjs
 * Payment tests need FAKE_FLW_URL + FLW_SECRET_HASH (see scripts/fake-flutterwave.mjs); they are skipped otherwise.
 */
const BASE = (process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const API = BASE + "/api";
const OWNER = { username: process.env.OWNER_USERNAME, email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD };
const FAKE = process.env.FAKE_FLW_URL?.replace(/\/$/, "");
const HASH = process.env.FLW_SECRET_HASH;
const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
if (!OWNER.username || !OWNER.email || !OWNER.password) {
  console.error("Set OWNER_USERNAME, OWNER_EMAIL and OWNER_PASSWORD (an owner account on the server).");
  process.exit(2);
}

let passed = 0;
let failed = 0;
let section = "";
const failures = [];
function group(name) {
  section = name;
  console.log(`\n── ${name}`);
}
function check(name, ok, extra = "") {
  if (ok) passed++;
  else {
    failed++;
    failures.push(`${section}: ${name}`);
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}
const uid = Math.random().toString(36).slice(2, 7);

/** A tiny cookie-jar client, like one browser. */
class Client {
  constructor(name) {
    this.name = name;
    this.cookies = new Map();
    this.csrf = null;
  }
  get cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  sid() {
    return this.cookies.get("sid") ?? this.cookies.get("__Host-sid");
  }
  async call(method, path, { body, headers = {}, raw, csrf = true, origin } = {}) {
    const mutating = !["GET", "HEAD"].includes(method);
    const res = await fetch(API + path, {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(this.cookies.size ? { cookie: this.cookieHeader } : {}),
        ...(mutating && csrf && this.csrf ? { "x-csrf-token": this.csrf } : {}),
        ...(origin ? { origin } : {}),
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || /expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (json?.csrfToken) this.csrf = json.csrfToken;
    return { status: res.status, headers: res.headers, json, text, setCookies: res.headers.getSetCookie?.() ?? [] };
  }
  login(username, email, password) {
    return this.call("POST", "/auth/login", { body: { username, email, password } });
  }
}
const anon = new Client("anon");

const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360f8cfc0f01f0005000201e2bd6b190000000049454e44ae426082",
  "hex",
);
async function upload(client, buf = PNG_1x1, type = "image/png") {
  return client.call("POST", "/admin/uploads", { raw: buf, headers: { "content-type": type } });
}

// ======================================================================
group("Public endpoints & headers");
const health = await anon.call("GET", "/healthz");
check("GET /healthz → 200", health.status === 200);
check("GET /readyz → 200 (database reachable)", (await anon.call("GET", "/readyz")).status === 200);
check("X-Content-Type-Options: nosniff", health.headers.get("x-content-type-options") === "nosniff");
check("no X-Powered-By header", !health.headers.get("x-powered-by"));
check("X-Request-Id returned", /^[\w-]{8,}$/.test(health.headers.get("x-request-id") ?? ""));
const products = await anon.call("GET", "/products");
check("GET /products → 200 with items", products.status === 200 && products.json?.length > 0, `${products.json?.length} products`);
check("search=%25 does not match everything (LIKE escaped)", (await anon.call("GET", "/products?search=%25")).json?.length === 0);
const settings = (await anon.call("GET", "/settings")).json;
check("GET /settings → name + colors + checkout", !!settings?.name && !!settings?.colors?.primary && !!settings?.checkout);
const options = (await anon.call("GET", "/checkout/options")).json;
check("GET /checkout/options lists COD", options?.methods?.some((m) => m.id === "cod"));
if (FAKE) check("Flutterwave (test mode) offered when keys are set", options?.methods?.some((m) => m.id === "flutterwave" && m.test === true));
check("unknown API path → 404 JSON", (await anon.call("GET", "/nope")).json?.error === "Not found");
check("OAuth not configured → start returns 404 'isn't set up yet'", /set up yet/.test((await anon.call("GET", "/auth/oauth/google/start")).json?.error ?? ""));

// ======================================================================
group("Sign-in, sessions, CSRF");
const session0 = (await anon.call("GET", "/auth/session")).json;
check("anonymous session: authenticated=false, setupRequired=false", session0?.authenticated === false && session0?.setupRequired === false);
check("setup refused once an owner exists", (await anon.call("POST", "/auth/setup", { body: { name: "X", username: "hacker", email: "h@x.io", password: "Some-Long-Password-1" } })).status === 409);
check("admin list without login → 401", (await anon.call("GET", "/orders")).status === 401);
check("login with missing email → 400", (await anon.call("POST", "/auth/login", { body: { username: OWNER.username, password: "x" } })).status === 400);
const badPw = await anon.login(OWNER.username, OWNER.email, "wrong-password-123");
const badUser = await anon.login("nobody-" + uid, OWNER.email, "wrong-password-123");
check("wrong password → 401 generic message", badPw.status === 401 && /don.t match/i.test(badPw.json?.error ?? ""), badPw.json?.error);
check("unknown user → same generic message", badUser.status === 401 && badUser.json?.error === badPw.json?.error);
check("right password + wrong email → 401", (await anon.login(OWNER.username, "other@example.com", OWNER.password)).status === 401);

const owner = new Client("owner");
const ownerLogin = await owner.login(OWNER.username, OWNER.email, OWNER.password);
check("owner login → 200", ownerLogin.status === 200 && ownerLogin.json?.user?.role === "owner", ownerLogin.json?.error);
const sidCookie = ownerLogin.setCookies.find((c) => /^(__Host-)?sid=/.test(c)) ?? "";
check("session cookie is HttpOnly + SameSite", /HttpOnly/i.test(sidCookie) && /SameSite=(Strict|Lax)/i.test(sidCookie));
check("session JSON has csrfToken + owner permissions", !!owner.csrf && ownerLogin.json?.permissions?.includes("users.manage"));
const sidAtLogin = owner.sid();
const noCsrf = await owner.call("PATCH", "/content/hero_title", { body: { value: "x" }, csrf: false });
check("mutation without X-CSRF-Token → 403 CSRF", noCsrf.status === 403 && noCsrf.json?.code === "CSRF");
check("mutation with a wrong token → 403", (await owner.call("PATCH", "/content/hero_title", { body: { value: "x" }, headers: { "x-csrf-token": "nope" } })).status === 403);
check("cross-site Origin → 403 BAD_ORIGIN", (await owner.call("PATCH", "/content/hero_title", { body: { value: "x" }, origin: "https://evil.example" })).json?.code === "BAD_ORIGIN");
check("form-encoded POST → 415", (await owner.call("POST", "/products", { raw: "a=1", headers: { "content-type": "application/x-www-form-urlencoded" } })).status === 415);
check("malformed JSON → 400", (await owner.call("POST", "/products", { raw: "{bad", headers: { "content-type": "application/json" } })).status === 400);
check("forged session cookie → 401", (await fetch(API + "/orders", { headers: { cookie: "sid=forged" } })).status === 401);

// ======================================================================
group("Staff accounts & roles");
let mkN = 0;
const mk = async (role) => {
  const n = `${role}${++mkN}-${uid}`;
  const r = await owner.call("POST", "/admin/users", { body: { name: `Test ${role}`, username: n, email: `${n}@test.local`, role } });
  return { ...r.json?.user, temp: r.json?.temporaryPassword, status: r.status };
};
const mgrAcc = await mk("manager");
const staffAcc = await mk("staff");
check("owner creates a manager → 201 + one-time temporary password", mgrAcc.status === 201 && typeof mgrAcc.temp === "string" && mgrAcc.temp.length >= 12);
check("owner creates a staff member → 201", staffAcc.status === 201 && staffAcc.mustChangePassword === true);
check("duplicate username → 409", (await owner.call("POST", "/admin/users", { body: { name: "Dup", username: staffAcc.username, email: `dup-${uid}@test.local`, role: "staff" } })).status === 409);
check("users list never contains password hashes", !(await owner.call("GET", "/admin/users")).text.includes("argon2"));

const staff = new Client("staff");
const sLogin = await staff.login(staffAcc.username, staffAcc.email, staffAcc.temp);
check("staff logs in with the temporary password", sLogin.status === 200 && sLogin.json?.user?.mustChangePassword === true);
check("…but must change it first (orders → 403)", (await staff.call("GET", "/orders")).json?.code === "PASSWORD_CHANGE_REQUIRED");
check("weak new password rejected", (await staff.call("POST", "/auth/change-password", { body: { currentPassword: staffAcc.temp, newPassword: "password" } })).status === 400);
const staffPw = "Staff-Strong-Pass-" + uid;
const sOldSid = staff.sid();
const changed = await staff.call("POST", "/auth/change-password", { body: { currentPassword: staffAcc.temp, newPassword: staffPw } });
check("staff changes own password → 200, session rotated", changed.status === 200 && staff.sid() && staff.sid() !== sOldSid);
check("staff permissions: orders only", JSON.stringify(changed.json?.permissions?.sort()) === JSON.stringify(["dashboard.view", "orders.markPaid", "orders.update", "orders.view"]));
check("staff: GET /orders → 200", (await staff.call("GET", "/orders")).status === 200);
check("staff: create product → 403", (await staff.call("POST", "/products", { body: { name: "X", category: "Breads", price: 1, description: "x" } })).status === 403);
check("staff: change branding → 403", (await staff.call("PUT", "/settings", { body: settings })).status === 403);
check("staff: list users → 403", (await staff.call("GET", "/admin/users")).status === 403);
check("staff: audit log → 403", (await staff.call("GET", "/admin/audit")).status === 403);
check("staff: newsletter CSV → 403", (await staff.call("GET", "/admin/newsletter.csv")).status === 403);
check("staff: upload image → 403", (await upload(staff)).status === 403);
check("staff: moderate reviews → 403", (await staff.call("GET", "/admin/reviews")).status === 403);

const mgr = new Client("manager");
await mgr.login(mgrAcc.username, mgrAcc.email, mgrAcc.temp);
const mgrPw = "Manager-Strong-Pass-" + uid;
await mgr.call("POST", "/auth/change-password", { body: { currentPassword: mgrAcc.temp, newPassword: mgrPw } });
const mSession = (await mgr.call("GET", "/auth/session")).json;
check("manager has products/content but not branding/users", mSession?.permissions?.includes("products.manage") && !mSession?.permissions?.includes("settings.branding") && !mSession?.permissions?.includes("users.manage"));
check("manager: branding → 403", (await mgr.call("PUT", "/settings", { body: settings })).status === 403);
check("manager: payment settings → 403", (await mgr.call("GET", "/admin/payments/status")).status === 403);
check("manager: users → 403", (await mgr.call("GET", "/admin/users")).status === 403);
const up = await upload(mgr);
check("manager: upload PNG → 201", up.status === 201 && /^\/api\/media\//.test(up.json?.url ?? ""));
const bad = await upload(mgr, Buffer.from("<svg onload=alert(1)>"), "image/png");
check("manager: upload non-image → 400/415", bad.status === 400 || bad.status === 415, `${bad.status} ${bad.json?.error}`);

// self-protection
check("owner cannot disable themself", (await owner.call("PATCH", `/admin/users/${ownerLogin.json.user.id}`, { body: { disabled: true } })).status === 400);
check("owner cannot demote the last owner (themself)", (await owner.call("PATCH", `/admin/users/${ownerLogin.json.user.id}`, { body: { role: "staff" } })).status === 400);

// disable → existing sessions die
const victim = await mk("staff");
const vc = new Client("victim");
await vc.login(victim.username, victim.email, victim.temp);
const dis = await owner.call("PATCH", `/admin/users/${victim.id}`, { body: { disabled: true } });
check("disabled staff: owner disables → 200", dis.status === 200, `${dis.status} ${dis.text.slice(0, 200)}`);
check("…their open session is revoked (401)", (await vc.call("GET", "/auth/session")).json?.authenticated === false);
check("…and they can't log in", (await new Client("x").login(victim.username, victim.email, victim.temp)).status === 401);
const reset = await owner.call("POST", `/admin/users/${victim.id}/reset-password`);
check("owner resets a password → new temporary password", reset.status === 200 && typeof reset.json?.temporaryPassword === "string");

// lockout
group("Lockout");
for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await new Client("x").login(mgrAcc.username, mgrAcc.email, "wrong-" + i);
const lockHit = await new Client("x").login(mgrAcc.username, mgrAcc.email, "wrong-final");
check(`${MAX_ATTEMPTS} wrong passwords → 423 locked`, lockHit.status === 423, lockHit.json?.error);
check("locked account refuses even the right password", (await new Client("x").login(mgrAcc.username, mgrAcc.email, mgrPw)).status === 423);
check("owner unlocks by re-enabling (PATCH disabled:false)", (await owner.call("PATCH", `/admin/users/${mgrAcc.id}`, { body: { disabled: false } })).status === 200);
const mgr2 = new Client("manager2");
check("…manager can sign in again", (await mgr2.login(mgrAcc.username, mgrAcc.email, mgrPw)).status === 200);

// ======================================================================
group("Checkout, prices & stock");
const prod = (await mgr2.call("POST", "/products", { body: { name: `Stock Test ${uid}`, slug: `stock-test-${uid}`, imageUrl: "/products/red-velvet-cupcakes.jpg", category: "Breads", price: 10000, description: "Test product", stock: 2 } })).json;
check("manager creates a product with stock=2", prod?.stock === 2, JSON.stringify(prod).slice(0, 300));
const zone = settings.checkout.delivery.zones[0];
const baseOrder = { customerName: "Test Customer", customerPhone: "0772 123 456", customerEmail: "", fulfillment: "pickup", paymentMethod: "cod" };
const tooMany = await anon.call("POST", "/orders", { body: { ...baseOrder, items: [{ productId: prod.id, quantity: 3 }] } });
check("ordering 3 when only 2 left → 409 OUT_OF_STOCK", tooMany.status === 409 && tooMany.json?.code === "OUT_OF_STOCK", tooMany.text.slice(0, 300));
const forged = await anon.call("POST", "/orders", { body: { ...baseOrder, total: 1, subtotal: 1, items: [{ productId: products.json[0].id, quantity: 1, unitPrice: 1 }] } });
check("client-sent prices are ignored (server price used)", forged.status === 201 && forged.json?.total === products.json[0].price, `${forged.status} total ${forged.json?.total}`);
const o1 = await anon.call("POST", "/orders", { body: { ...baseOrder, fulfillment: "delivery", deliveryZoneId: zone.id, deliveryAddress: "Plot 1, Test Rd", items: [{ productId: prod.id, quantity: 2 }] } });
check("COD delivery order → 201 with code + token", o1.status === 201 && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(o1.json?.code ?? "") && !!o1.json?.accessToken, o1.json?.error);
const expectFee = 20000 >= (settings.checkout.delivery.freeOver || Infinity) ? 0 : zone.fee;
check("server computes total = items + zone fee", o1.json?.total === 20000 + expectFee, `total ${o1.json?.total}`);
check("product now has stock 0", (await anon.call("GET", `/products/${prod.id}`)).json?.stock === 0);
const soldOut = await anon.call("POST", "/orders", { body: { ...baseOrder, items: [{ productId: prod.id, quantity: 1 }] } });
check("sold out → 409", soldOut.status === 409 && /sold out/i.test(soldOut.json?.error ?? ""));
check("delivery without address → 400", (await anon.call("POST", "/orders", { body: { ...baseOrder, fulfillment: "delivery", deliveryZoneId: zone.id, items: [{ productId: products.json[0].id, quantity: 1 }] } })).status === 400);
check("bad phone → 400", (await anon.call("POST", "/orders", { body: { ...baseOrder, customerPhone: "12", items: [{ productId: products.json[0].id, quantity: 1 }] } })).status === 400);
check("honeypot filled → rejected", (await anon.call("POST", "/orders", { body: { ...baseOrder, website: "spam", items: [{ productId: products.json[0].id, quantity: 1 }] } })).status === 400);

// concurrency: 5 buyers race for 3 items
const raceProd = (await mgr2.call("POST", "/products", { body: { name: `Race ${uid}`, slug: `race-${uid}`, imageUrl: "/products/red-velvet-cupcakes.jpg", category: "Breads", price: 5000, description: "Race", stock: 3 } })).json;
const race = await Promise.all(Array.from({ length: 5 }, () => anon.call("POST", "/orders", { body: { ...baseOrder, items: [{ productId: raceProd.id, quantity: 1 }] } })));
check("5 parallel buyers for 3 items → exactly 3 succeed (no oversell)", race.filter((r) => r.status === 201).length === 3 && race.filter((r) => r.status === 409).length === 2);
check("…stock ends at 0, never negative", (await anon.call("GET", `/products/${raceProd.id}`)).json?.stock === 0);

// ======================================================================
group("Order tracking");
const code1 = o1.json.code;
check("track with wrong phone → 404", (await anon.call("POST", "/orders/track", { body: { code: code1, phone: "0700 000 000" } })).status === 404);
check("track unknown code → same 404", (await anon.call("POST", "/orders/track", { body: { code: "ZZZZ-ZZZZ", phone: "0772 123 456" } })).status === 404);
const tr = await anon.call("POST", "/orders/track", { body: { code: code1.toLowerCase().replace("-", ""), phone: "+256772123456" } });
check("track with code + phone (any format) → 200", tr.status === 200 && tr.json?.code === code1);
check("tracking view hides phone/email/staff names", tr.status === 200 && !tr.text.includes("772123456") && !tr.text.includes('"by"'));
check("track with secret token works", (await anon.call("POST", "/orders/track", { body: { code: code1, token: o1.json.accessToken } })).status === 200);

const list = (await staff.call("GET", `/orders?search=${code1}`)).json;
const o1Admin = list?.find?.((o) => o.code === code1);
check("staff finds the order by code", !!o1Admin && o1Admin.customerPhone === "+256772123456");
check("staff moves order to Preparing", (await staff.call("PATCH", `/orders/${o1Admin.id}/status`, { body: { status: "Preparing" } })).json?.status === "Preparing");
check("staff marks COD order paid", (await staff.call("POST", `/orders/${o1Admin.id}/payment`, { body: { action: "mark_paid" } })).json?.paymentStatus === "paid");
check("staff can't record refunds → 403", (await staff.call("POST", `/orders/${o1Admin.id}/payment`, { body: { action: "mark_refunded" } })).status === 403);
check("manager records a refund", (await mgr2.call("POST", `/orders/${o1Admin.id}/payment`, { body: { action: "mark_refunded" } })).json?.paymentStatus === "refunded");
check("cancelling releases stock (0 → 2)", (await staff.call("PATCH", `/orders/${o1Admin.id}/status`, { body: { status: "Cancelled" } })).status === 200 && (await anon.call("GET", `/products/${prod.id}`)).json?.stock === 2);
const tr2 = (await anon.call("POST", "/orders/track", { body: { code: code1, token: o1.json.accessToken } })).json;
check("customer sees the history (placed → preparing → cancelled)", tr2?.history?.filter((h) => h.type === "status").map((h) => h.value).join(">").includes("Preparing>Cancelled"));

// ======================================================================
if (FAKE && HASH) {
  group("Online payments (Flutterwave — local fake)");
  const fakeSet = (body) => fetch(FAKE + "/__control/set", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const hook = (body, hash = HASH) => anon.call("POST", "/payments/webhook/flutterwave", { body, headers: hash ? { "verif-hash": hash } : {}, csrf: false });
  const pOrder = await anon.call("POST", "/orders", { body: { ...baseOrder, paymentMethod: "flutterwave", items: [{ productId: products.json[0].id, quantity: 2 }] } });
  check("online order → 201 with a checkout link", pOrder.status === 201 && pOrder.json?.checkoutUrl?.startsWith(FAKE), pOrder.json?.error);
  const tx = await fetch(`${FAKE}/__control/tx`).then((r) => r.json());
  check("amount sent to Flutterwave comes from the server", tx.amount === pOrder.json.total && tx.currency === pOrder.json.currency);
  check("UGX → mobile money options requested", /mobilemoneyuganda/.test(tx.options ?? ""));
  check("redirect URL points to the order page", tx.redirect_url?.endsWith(`/order/${pOrder.json.code}`));
  const pendingTrack = (await anon.call("POST", "/orders/track", { body: { code: pOrder.json.code, token: pOrder.json.accessToken } })).json;
  check("before paying: status pending + checkoutUrl offered", pendingTrack?.paymentStatus === "pending" && !!pendingTrack?.checkoutUrl);

  const evt = { event: "charge.completed", data: { id: tx.id, tx_ref: tx.tx_ref, status: "successful", amount: tx.amount, currency: tx.currency } };
  check("webhook without verif-hash → 401", (await hook(evt, null)).status === 401);
  check("webhook with wrong verif-hash → 401", (await hook(evt, "wrong-hash")).status === 401);
  // The body claims "successful" but Flutterwave (fake) still says pending: must NOT be marked paid.
  await hook(evt);
  const stillPending = (await anon.call("POST", "/orders/track", { body: { code: pOrder.json.code, token: pOrder.json.accessToken } })).json;
  check("forged 'successful' body is not trusted (server re-verifies) → still pending", stillPending?.paymentStatus === "pending");
  await fakeSet({ tx_ref: tx.tx_ref, status: "successful" });
  const evt2 = { ...evt, event: "charge.completed", data: { ...evt.data, status: "successful", id: tx.id } };
  const h1 = await hook({ ...evt2, data: { ...evt2.data, status: "successful " } });
  check("valid webhook → 200", h1.status === 200);
  const paidView = (await anon.call("POST", "/orders/track", { body: { code: pOrder.json.code, token: pOrder.json.accessToken } })).json;
  check("order is now paid + confirmed", paidView?.paymentStatus === "paid" && paidView?.status === "Confirmed", `${paidView?.paymentStatus}/${paidView?.status}`);
  const dup = await hook({ ...evt2, data: { ...evt2.data, status: "successful " } });
  check("same webhook again → 200 duplicate (idempotent)", dup.status === 200 && dup.json?.duplicate === true);
  const pAdmin = (await owner.call("GET", `/orders?search=${pOrder.json.code}`)).json?.[0];
  check("only one payment entry in the history", pAdmin?.history?.filter((h) => h.type === "payment" && h.value.startsWith("paid")).length === 1);
  check("staff can't 'mark paid' an online order", (await staff.call("POST", `/orders/${pAdmin.id}/payment`, { body: { action: "mark_paid" } })).status === 400);
  check("webhook for unknown reference → 200 ignored", (await hook({ event: "charge.completed", data: { id: 1, tx_ref: "nope", status: "successful" } })).json?.ignored !== undefined);

  // Tampered amount: customer pays less than the order total
  const cheat = await anon.call("POST", "/orders", { body: { ...baseOrder, paymentMethod: "flutterwave", items: [{ productId: products.json[0].id, quantity: 3 }] } });
  const ctx = await fetch(`${FAKE}/__control/tx`).then((r) => r.json());
  await fakeSet({ tx_ref: ctx.tx_ref, status: "successful", amount: 100 });
  await hook({ event: "charge.completed", data: { id: ctx.id, tx_ref: ctx.tx_ref, status: "successful", amount: 100 } });
  const cheatView = (await anon.call("POST", "/orders/track", { body: { code: cheat.json.code, token: cheat.json.accessToken } })).json;
  check("payment for LESS than the total is not accepted", cheatView?.paymentStatus !== "paid", cheatView?.paymentStatus);
  const wrongCur = await anon.call("POST", "/orders", { body: { ...baseOrder, paymentMethod: "flutterwave", items: [{ productId: products.json[0].id, quantity: 1 }] } });
  const wtx = await fetch(`${FAKE}/__control/tx`).then((r) => r.json());
  await fakeSet({ tx_ref: wtx.tx_ref, status: "successful", currency: "USD" });
  await hook({ event: "charge.completed", data: { id: wtx.id, tx_ref: wtx.tx_ref, status: "successful" } });
  check("payment in the wrong currency is not accepted", (await anon.call("POST", "/orders/track", { body: { code: wrongCur.json.code, token: wrongCur.json.accessToken } })).json?.paymentStatus !== "paid");

  // Customer returns from the redirect without a webhook: tracking verifies with the provider
  const ret = await anon.call("POST", "/orders", { body: { ...baseOrder, paymentMethod: "flutterwave", items: [{ productId: products.json[0].id, quantity: 1 }] } });
  const rtx = await fetch(`${FAKE}/__control/tx`).then((r) => r.json());
  await fakeSet({ tx_ref: rtx.tx_ref, status: "successful" });
  const retView = (await anon.call("POST", "/orders/track", { body: { code: ret.json.code, token: ret.json.accessToken } })).json;
  check("no webhook? the order page verifies server-side → paid", retView?.paymentStatus === "paid");
  // Failed payment → can retry
  const fail = await anon.call("POST", "/orders", { body: { ...baseOrder, paymentMethod: "flutterwave", items: [{ productId: products.json[0].id, quantity: 1 }] } });
  const ftx = await fetch(`${FAKE}/__control/tx`).then((r) => r.json());
  await fakeSet({ tx_ref: ftx.tx_ref, status: "failed" });
  await hook({ event: "charge.completed", data: { id: ftx.id, tx_ref: ftx.tx_ref, status: "failed" } });
  const fView = (await anon.call("POST", "/orders/track", { body: { code: fail.json.code, token: fail.json.accessToken } })).json;
  check("failed payment → paymentStatus failed, retry allowed", fView?.paymentStatus === "failed" && fView?.canRetryPayment === true);
  const retry = await anon.call("POST", "/orders/pay", { body: { code: fail.json.code, token: fail.json.accessToken } });
  check("retry payment → new checkout link", retry.status === 200 && retry.json?.checkoutUrl?.startsWith(FAKE));

  group("Payment settings (owner)");
  const pst = await owner.call("GET", "/admin/payments/status");
  check("owner sees provider status (no secrets in it)", pst.status === 200 && !pst.text.includes(HASH) && pst.json?.providers?.some((p) => p.id === "flutterwave" && p.configured));
  check("can't enable Pesapal without keys → 400", (await owner.call("PUT", "/admin/payments/settings", { body: { ...settings.checkout, methods: { ...settings.checkout.methods, pesapal: true } } })).status === 400);
  const disabled = await owner.call("PUT", "/admin/payments/settings", { body: { ...settings.checkout, methods: { ...settings.checkout.methods, flutterwave: false } } });
  check("owner can switch Flutterwave off", disabled.status === 200);
  check("…then checkout refuses it", (await anon.call("POST", "/orders", { body: { ...baseOrder, paymentMethod: "flutterwave", items: [{ productId: products.json[0].id, quantity: 1 }] } })).status === 400);
  await owner.call("PUT", "/admin/payments/settings", { body: settings.checkout });
} else {
  console.log("\n(skipping online payment tests: set FAKE_FLW_URL and FLW_SECRET_HASH, or use `pnpm test`)");
}

// ======================================================================
group("Reviews (moderation)");
const rv = await anon.call("POST", "/reviews", { body: { customerName: `Reviewer ${uid}`, quote: "Lovely bread!", rating: 5 } });
check("customer review → 202 pending", rv.status === 202 && rv.json?.status === "pending");
check("pending review is not public", !(await anon.call("GET", "/reviews")).text.includes(`Reviewer ${uid}`));
const pend = (await mgr2.call("GET", "/admin/reviews?status=pending")).json;
const mine = (pend?.reviews ?? pend)?.find?.((r) => r.customerName === `Reviewer ${uid}`);
check("manager sees it in the moderation queue", !!mine);
check("manager approves → shows publicly", (await mgr2.call("PATCH", `/admin/reviews/${mine?.id}`, { body: { status: "approved" } })).status === 200 && (await anon.call("GET", "/reviews")).text.includes(`Reviewer ${uid}`));
check("manager hides → gone again", (await mgr2.call("PATCH", `/admin/reviews/${mine?.id}`, { body: { status: "hidden" } })).status === 200 && !(await anon.call("GET", "/reviews")).text.includes(`Reviewer ${uid}`));

// ======================================================================
group("Newsletter");
const email = `News.${uid}@Example.com`;
const n1 = await anon.call("POST", "/newsletter", { body: { email } });
const n2 = await anon.call("POST", "/newsletter", { body: { email: email.toLowerCase() } });
check("subscribe twice → same 202 answer", n1.status === 202 && n2.status === 202 && n1.text === n2.text);
const csv = await owner.call("GET", "/admin/newsletter.csv");
const rows = csv.text.split(/\r?\n/).filter((l) => l.includes(email.toLowerCase()));
check("CSV export: one row (deduped, case-insensitive)", csv.status === 200 && rows.length === 1);
const csvBytes = new Uint8Array(await (await fetch(API + "/admin/newsletter.csv", { headers: { cookie: owner.cookieHeader } })).arrayBuffer());
check("CSV has a UTF-8 BOM (Excel), header and unsubscribe link column", csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf && csv.text.includes("unsubscribe_url"));
const token = rows[0]?.match(/token=([\w-]+)/)?.[1];
check("unsubscribe with the token → 200", (await anon.call("POST", "/newsletter/unsubscribe", { body: { token } })).status === 200);
check("…no longer in the export", !(await owner.call("GET", "/admin/newsletter.csv")).text.includes(email.toLowerCase()));
await anon.call("POST", "/newsletter", { body: { email: "=cmd|'/c calc'!A1@x.com" } });
check("CSV cells are formula-escaped", !/(^|,)=cmd/m.test((await owner.call("GET", "/admin/newsletter.csv")).text));

// ======================================================================
group("Branding & uploads");
const logo1 = (await upload(owner)).json?.url;
const logo2 = (await upload(owner)).json?.url;
const s1 = await owner.call("PUT", "/settings", { body: { ...settings, logoUrl: logo1 } });
check("owner sets a logo", s1.status === 200 && s1.json?.logoUrl === logo1, s1.json?.error);
await owner.call("PUT", "/settings", { body: { ...settings, logoUrl: logo2 } });
await new Promise((r) => setTimeout(r, 300));
check("replaced logo file is deleted", (await anon.call("GET", logo1.replace(/^\/api/, ""))).status === 404);
check("new logo is served", (await anon.call("GET", logo2.replace(/^\/api/, ""))).status === 200);
const evilSettings = await owner.call("PUT", "/settings", { body: { ...settings, logoUrl: "javascript:alert(1)" } });
check("javascript: URLs rejected", evilSettings.status === 400);
await owner.call("PUT", "/settings", { body: settings });

// ======================================================================
group("Audit log");
const audit = await owner.call("GET", "/admin/audit?limit=200");
const actions = new Set((audit.json?.entries ?? []).map((e) => e.action));
for (const a of ["auth.login", "auth.login_failed", "auth.locked", "user.create", "user.disable", "user.reset_password", "order.status", "order.mark_paid", "product.create", "settings.branding"]) {
  check(`audit has ${a}`, actions.has(a));
}
check("audit never stores passwords", !audit.text.includes(OWNER.password) && !audit.text.includes(staffPw));
check("audit filter by action prefix", (await owner.call("GET", "/admin/audit?action=auth.")).json?.entries?.every((e) => e.action.startsWith("auth.")));

// ======================================================================
group("Logout");
check("logout → 200", (await staff.call("POST", "/auth/logout")).status === 200);
const st = new Client("x");
st.cookies.set("sid", staff.sid() ?? "gone");
check("after logout the staff session is dead", (await st.call("GET", "/orders")).status === 401);

// cleanup test products
await mgr2.call("DELETE", `/products/${prod.id}`);
await mgr2.call("DELETE", `/products/${raceProd.id}`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
