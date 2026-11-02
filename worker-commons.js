const SOURCE = "https://raw.githubusercontent.com/valentenick-bit/fl-board/main/index.html";

const BW = "605b2c9a38c8aaf67ecdb6dff209d34fa7ba97debfc814d7999323b41b640947@group.calendar.google.com";
const ENG = "a4e440841faec3345147ad56ddeb185206306d8bb01d0262c2e1d7dfa3f6d3c6@group.calendar.google.com";
const DELIV_ID = "1fdtZGOyKVZvxi480Ypp3XlEsyENSx4cA";
const KEY_ID = "1JhkFQtAHTEQCrzq-_JowhwZT3h48nK-p";
const FLIGHT_ID = "1sExkZ82XjLbegVoXeYP7iXUHmwa7DF2i";
const COMM_ID = "1NnpKNIiPTQch7s02z_PQ3u_MxwxRrq16";
const EVENTS_ID = "1Z-f0UAh1z2_JHAWy77Zx88oIu8x2HELI";
const MAPS_ID = "1SbVS5vyn_3BlauYniVZCnOERlBeWSIhq";

function asRaw(src) {
  src = String(src || "").trim();
  const blob = src.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i);
  if (blob) return "https://raw.githubusercontent.com/" + blob[1] + "/" + blob[2] + "/" + blob[3] + "/" + blob[4];
  return src;
}

function driveUrls(id) {
  return [
    "https://drive.usercontent.google.com/download?id=" + id + "&export=download&confirm=t",
    "https://drive.google.com/uc?export=download&id=" + id + "&confirm=t",
    "https://drive.google.com/uc?id=" + id + "&export=download"
  ];
}

function jsonOk(text) {
  if (!text || /^\s*</.test(text) || /accounts\.google\.com|Sign in/.test(text)) return null;
  try {
    JSON.parse(text);
    return text;
  } catch (e) {
    return null;
  }
}

function githubSibling(name) {
  const raw = asRaw(SOURCE);
  if (raw.indexOf("http") !== 0) return "";
  return raw.replace(/\/[^/?#]+(\?.*)?$/, "/" + name);
}

async function driveJson(id, name, fallback) {
  const hdr = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
  const urls = (id ? driveUrls(id) : []).concat([
    githubSibling(name),
    "https://raw.githubusercontent.com/valentenick-bit/fl-board/main/" + name,
    "https://cdn.jsdelivr.net/gh/valentenick-bit/fl-board@main/" + name
  ]).filter(Boolean);
  for (const src of urls) {
    try {
      const r = await fetch(src + (src.indexOf("?") >= 0 ? "&" : "?") + "cb=" + Date.now(), {
        headers: { "User-Agent": "Commons/1.0", Accept: "application/json" },
        cf: { cacheTtl: 0 }
      });
      const text = jsonOk(await r.text());
      if (text) return new Response(text, { status: 200, headers: hdr });
    } catch (e) {}
  }
  return new Response(JSON.stringify(fallback), { status: 200, headers: hdr });
}

async function grokBrief(env, payload) {
  const key = env && (env.XAI_API_KEY || env.GROK_API_KEY);
  const hdr = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*"
  };
  if (!key) return new Response(JSON.stringify({ ok: false, local: true }), { status: 200, headers: hdr });
  const sys = "You write Commons wall copy for a Florida Gulf home. Short, spoken, no lists of the same hour repeated. Never invent alerts, tides, or addresses. Return JSON {brief, ticker, answer} only.";
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({
      model: "grok-4-fast-non-reasoning",
      temperature: 0.4,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(payload || {}) }
      ]
    })
  });
  const raw = await r.text();
  let brief = "", answer = "";
  try {
    const d = JSON.parse(raw);
    const txt = (((d.choices || [])[0] || {}).message || {}).content || "";
    try {
      const j = JSON.parse(txt);
      brief = j.brief || j.ticker || "";
      answer = j.answer || brief;
    } catch (e2) {
      brief = txt;
      answer = txt;
    }
  } catch (e) {}
  return new Response(JSON.stringify({ ok: true, brief: brief, ticker: brief, answer: answer }), { status: 200, headers: hdr });
}


const PIN_SEED = {
  updated: "",
  source: "Commons device pins",
  pins: [
    { zip: "06074", lat: 41.849, lon: -72.5215, place: "South Windsor CT", state: "CT", miles: 25 },
    { zip: "34223", lat: 27.001, lon: -82.368, place: "Englewood FL", state: "FL", miles: 25 }
  ]
};
let PIN_MEM = null;

function pinKey(p) {
  const z = String((p && p.zip) || "").replace(/\D/g, "").slice(0, 5);
  if (z.length === 5) return z;
  const lat = Number(p && p.lat), lon = Number(p && p.lon);
  if (isFinite(lat) && isFinite(lon)) return lat.toFixed(3) + "," + lon.toFixed(3);
  return "";
}

function mergePin(list, incoming) {
  const row = {
    zip: String(incoming.zip || "").replace(/\D/g, "").slice(0, 5),
    lat: incoming.lat == null ? null : Number(incoming.lat),
    lon: incoming.lon == null ? null : Number(incoming.lon),
    place: String(incoming.place || incoming.address || "").trim(),
    state: String(incoming.state || "").trim().toUpperCase().slice(0, 2),
    community: String(incoming.community || "").trim(),
    miles: Number(incoming.miles || incoming.eventMiles || 25) || 25,
    lastSeen: incoming.updated || incoming.lastSeen || new Date().toISOString()
  };
  const k = pinKey(row);
  if (!k) return list;
  const out = Array.isArray(list) ? list.slice() : [];
  const i = out.findIndex((p) => pinKey(p) === k);
  if (i >= 0) out[i] = Object.assign({}, out[i], row);
  else out.push(row);
  return out;
}

async function readPinRoster(env) {
  if (env && env.PINS) {
    try {
      const raw = await env.PINS.get("roster");
      if (raw) {
        const j = JSON.parse(raw);
        if (j && Array.isArray(j.pins)) {
          PIN_MEM = j;
          return j;
        }
      }
    } catch (e) {}
  }
  if (PIN_MEM && Array.isArray(PIN_MEM.pins) && PIN_MEM.pins.length) return PIN_MEM;
  try {
    const r = await fetch("https://raw.githubusercontent.com/valentenick-bit/fl-board/main/pins.json?cb=" + Date.now(), {
      headers: { "User-Agent": "Commons/1.0" },
      cf: { cacheTtl: 0, cacheEverything: false }
    });
    if (r.ok) {
      const j = await r.json();
      if (j && Array.isArray(j.pins)) {
        PIN_MEM = j;
        return j;
      }
    }
  } catch (e2) {}
  PIN_MEM = JSON.parse(JSON.stringify(PIN_SEED));
  PIN_MEM.updated = new Date().toISOString();
  return PIN_MEM;
}

async function writePinRoster(env, data) {
  PIN_MEM = data;
  if (env && env.PINS) {
    try { await env.PINS.put("roster", JSON.stringify(data)); } catch (e) {}
  }
}

function pinHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type"
  };
}

async function handlePins(request, env) {
  const hdr = pinHeaders();
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: hdr });
  if (request.method === "GET") {
    const roster = await readPinRoster(env);
    return new Response(JSON.stringify(roster), { status: 200, headers: hdr });
  }
  if (request.method === "POST" || request.method === "PUT") {
    let incoming = {};
    try { incoming = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: "bad json" }), { status: 400, headers: hdr });
    }
    const roster = await readPinRoster(env);
    roster.pins = mergePin(roster.pins, incoming);
    roster.updated = new Date().toISOString();
    roster.source = "Commons device pins";
    await writePinRoster(env, roster);
    return new Response(JSON.stringify({ ok: true, zip: String(incoming.zip || "").replace(/\D/g, "").slice(0, 5), count: roster.pins.length, pins: roster.pins }), { status: 200, headers: hdr });
  }
  return new Response(JSON.stringify({ ok: false, error: "use GET or POST" }), { status: 405, headers: hdr });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/pin" || url.pathname === "/pins") {
      return handlePins(request, env);
    }

    if (url.pathname === "/faa-status") {
      const hdr = { "content-type": "text/xml; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: hdr });
      try {
        const r = await fetch("https://nasstatus.faa.gov/api/airport-status-information", { headers: { "User-Agent": "CommonsBoard/1.0" }, cf: { cacheTtl: 60 } });
        const txt = await r.text();
        if (r.ok && txt.indexOf("AIRPORT_STATUS") >= 0) return new Response(txt, { status: 200, headers: hdr });
      } catch (e) {}
      return new Response("<AIRPORT_STATUS_INFORMATION></AIRPORT_STATUS_INFORMATION>", { status: 200, headers: hdr });
    }
    if (url.pathname === "/atcf") {
      const hdr = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: hdr });
      const file = String(url.searchParams.get("file") || "").replace(/[^a-z0-9.]/gi, "");
      if (!/^b[a-z]{2}\d{6}\.dat$/i.test(file)) {
        return new Response("bad file", { status: 400, headers: hdr });
      }
      const srcs = [
        "https://ftp.nhc.noaa.gov/atcf/btk/" + file,
        "http://ftp.nhc.noaa.gov/atcf/btk/" + file
      ];
      for (const src of srcs) {
        try {
          const r = await fetch(src, { headers: { "User-Agent": "CommonsBoard/1.0 (atcf)" }, cf: { cacheTtl: 60 } });
          if (!r.ok) continue;
          const txt = await r.text();
          if (txt && txt.length > 40 && !/<html/i.test(txt)) return new Response(txt, { status: 200, headers: hdr });
        } catch (e) {}
      }
      return new Response("", { status: 502, headers: hdr });
    }

    if (url.pathname === "/news-snippet") {
      const hdr = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=3600",
        "access-control-allow-origin": "*"
      };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: hdr });
      const target = String(url.searchParams.get("url") || "").trim();
      if (!/^https?:\/\//i.test(target) || target.length > 500) {
        return new Response(JSON.stringify({ snippet: "" }), { status: 200, headers: hdr });
      }
      try {
        const r = await fetch(target, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Commons/1.0)", Accept: "text/html" },
          redirect: "follow",
          cf: { cacheTtl: 3600 }
        });
        if (!r.ok) return new Response(JSON.stringify({ snippet: "" }), { status: 200, headers: hdr });
        const html = await r.text();
        let snippet = "";
        // Prefer og:description or meta description
        const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                   html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
                   html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                   html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
        if (og && og[1]) snippet = og[1];
        if (!snippet) {
          // Fallback: first reasonably long <p>
          const p = html.match(/<p[^>]*>([\s\S]{80,400}?)<\/p>/i);
          if (p) snippet = p[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }
        snippet = snippet.replace(/&/g, "&").replace(/"/g, '"').replace(/&#39;/g, "'").replace(/</g, "<").replace(/>/g, ">").replace(/\s+/g, " ").trim();
        if (snippet.length > 220) snippet = snippet.slice(0, 217).replace(/\s+\S*$/, "") + "…";
        return new Response(JSON.stringify({ snippet: snippet }), { status: 200, headers: hdr });
      } catch (e) {
        return new Response(JSON.stringify({ snippet: "" }), { status: 200, headers: hdr });
      }
    }


    if (url.pathname === "/news-rss") {
      const hdr = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=600",
        "access-control-allow-origin": "*"
      };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: hdr });
      const q = String(url.searchParams.get("q") || "local news").slice(0, 200);
      const rss = "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=en-US&gl=US&ceid=US:en";
      try {
        const r = await fetch(rss, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Commons/1.0)", Accept: "application/rss+xml, application/xml, text/xml" },
          cf: { cacheTtl: 600 }
        });
        if (!r.ok) return new Response(JSON.stringify({ items: [], error: "rss " + r.status }), { status: 200, headers: hdr });
        const xml = await r.text();
        const items = [];
        const chunks = xml.split(/<item[\s>]/i);
        for (let i = 1; i < chunks.length && items.length < 12; i++) {
          const chunk = chunks[i];
          const titleM = chunk.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
          const linkM = chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
          const dateM = chunk.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
          let title = titleM ? titleM[1] : "";
          title = title.replace(/<[^>]+>/g, " ").replace(/&/g, "&").replace(/"/g, '"').replace(/\s+/g, " ").trim();
          if (title) {
            items.push({
              title: title,
              link: linkM ? linkM[1].trim() : "",
              pubDate: dateM ? dateM[1].trim() : ""
            });
          }
        }
        return new Response(JSON.stringify({ items: items }), { status: 200, headers: hdr });
      } catch (e) {
        return new Response(JSON.stringify({ items: [], error: "fetch failed" }), { status: 200, headers: hdr });
      }
    }


    if (url.pathname === "/fa-times") {
      const hdr = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*"
      };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: hdr });
      const call = String(url.searchParams.get("call") || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
      if (!call || call.length < 3) return new Response(JSON.stringify({ error: "bad call" }), { status: 200, headers: hdr });
      try {
        const r = await fetch("https://www.flightaware.com/live/flight/" + call, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Commons/1.0)", Accept: "text/html" },
          cf: { cacheTtl: 60 }
        });
        if (!r.ok) return new Response(JSON.stringify({ error: "fa " + r.status, call: call }), { status: 200, headers: hdr });
        const html = await r.text();
        // Extract origin, destination, and times for the current flight
        function parseTimes(s) {
          const out = {};
          const sm = s.match(/"scheduled":(\d+)/); if (sm) out.scheduled = Number(sm[1]) * 1000;
          const em = s.match(/"estimated":(\d+)/); if (em) out.estimated = Number(em[1]) * 1000;
          const am = s.match(/"actual":(\d+)/); if (am) out.actual = Number(am[1]) * 1000;
          return out;
        }
        const blocks = [];
        const re = /"origin":\{[^}]*"iata":"([A-Z]{3})"[^}]*"friendlyName":"([^"]*)"[^}]*\}.*?"destination":\{[^}]*"iata":"([A-Z]{3})"[^}]*"friendlyName":"([^"]*)"[^}]*\}.*?"takeoffTimes":\{([^}]+)\}.*?"landingTimes":\{([^}]+)\}.*?"flightStatus":"([^"]*)"/g;
        let m;
        while ((m = re.exec(html)) !== null && blocks.length < 6) {
          blocks.push({
            origin: m[1],
            originCity: m[2],
            dest: m[3],
            destCity: m[4],
            takeoff: parseTimes(m[5]),
            landing: parseTimes(m[6]),
            flightStatus: m[7] || ""
          });
        }
        // Fallback: times only if the fuller pattern misses
        if (!blocks.length) {
          const re2 = /"takeoffTimes":\{([^}]+)\}.*?"landingTimes":\{([^}]+)\}/g;
          while ((m = re2.exec(html)) !== null && blocks.length < 4) {
            blocks.push({ origin: "", dest: "", takeoff: parseTimes(m[1]), landing: parseTimes(m[2]) });
          }
        }
        if (!blocks.length) return new Response(JSON.stringify({ call: call, found: false }), { status: 200, headers: hdr });
        // Prefer the block whose times are closest to now (current flight)
        const now = Date.now();
        blocks.sort(function (a, b) {
          const aT = a.landing.actual || a.landing.estimated || a.takeoff.actual || a.takeoff.estimated || 0;
          const bT = b.landing.actual || b.landing.estimated || b.takeoff.actual || b.takeoff.estimated || 0;
          return Math.abs(aT - now) - Math.abs(bT - now);
        });
        const best = blocks[0];
        // Use FlightAware's own flightStatus for this flight
        const statusMap = { airborne: "En route", arrived: "Arrived", taxiing: "Taxiing", scheduled: "Scheduled", departed: "Departed", cancelled: "Cancelled", diverted: "Diverted", result: "Arrived" };
        const raw = String(best.flightStatus || "").toLowerCase();
        const phase = statusMap[raw] || (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "");
        const dep = best.takeoff.actual || best.takeoff.estimated || best.takeoff.scheduled || null;
        const arr = best.landing.actual || best.landing.estimated || best.landing.scheduled || null;
        const depSched = best.takeoff.scheduled || null;
        const arrSched = best.landing.scheduled || null;
        // Delay in minutes: positive = late, negative = early, 0 = on time
        const depDelay = (dep && depSched) ? Math.round((dep - depSched) / 60000) : null;
        const arrDelay = (arr && arrSched) ? Math.round((arr - arrSched) / 60000) : null;
        return new Response(JSON.stringify({
          call: call,
          found: true,
          origin: best.origin || "",
          originCity: best.originCity || "",
          dest: best.dest || "",
          destCity: best.destCity || "",
          dep: dep,
          arr: arr,
          depSched: depSched,
          arrSched: arrSched,
          depDelay: depDelay,
          arrDelay: arrDelay,
          phase: phase || ""
        }), { status: 200, headers: hdr });
      } catch (e) {
        return new Response(JSON.stringify({ error: "fetch failed", call: call }), { status: 200, headers: hdr });
      }
    }

    if (url.pathname === "/brief") {
      const hdr = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
      if (request.method === "OPTIONS") return new Response(null, { headers: hdr });
      let payload = {};
      try { payload = await request.json(); } catch (e) {}
      return grokBrief(env, payload);
    }

    if (url.pathname === "/news") {
      const hdr = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=1800",
        "access-control-allow-origin": "*"
      };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: hdr });
      const key = env && (env.CURRENTS_KEY || env.GNEWS_KEY || env.NEWS_API_KEY);
      if (!key) {
        return new Response(JSON.stringify({ error: "no news API key set on worker", articles: [] }), { status: 200, headers: hdr });
      }
      const q = String(url.searchParams.get("q") || "local news").slice(0, 180);
      const place = String(url.searchParams.get("place") || "").slice(0, 80);
      const query = (place ? '"' + place + '" ' : "") + q;
      // Prefer Currents if CURRENTS_KEY is present
      const isCurrents = !!env.CURRENTS_KEY;
      let apiUrl;
      if (isCurrents) {
        apiUrl = "https://api.currentsapi.services/v1/search?keywords=" + encodeURIComponent(query) + "&language=en&page_size=12";
      } else {
        apiUrl = "https://gnews.io/api/v4/search?q=" + encodeURIComponent(query) + "&lang=en&max=10&apikey=" + encodeURIComponent(key);
      }
      try {
        const headers = isCurrents ? { Authorization: "Bearer " + key } : {};
        const r = await fetch(apiUrl, { headers: headers, cf: { cacheTtl: 1800 } });
        if (!r.ok) {
          return new Response(JSON.stringify({ error: "news api " + r.status, articles: [] }), { status: 200, headers: hdr });
        }
        const data = await r.json();
        let articles = [];
        if (isCurrents && data.news) {
          articles = data.news.map(function (a) {
            return {
              title: a.title || "",
              description: a.description || "",
              url: a.url || "",
              image: a.image || "",
              publishedAt: a.published || "",
              source: (a.source || {}).name || a.author || "Local"
            };
          });
        } else if (data.articles) {
          articles = data.articles.map(function (a) {
            return {
              title: a.title || "",
              description: a.description || "",
              url: a.url || "",
              image: a.image || "",
              publishedAt: a.publishedAt || "",
              source: (a.source || {}).name || "Local"
            };
          });
        }
        return new Response(JSON.stringify({ articles: articles.slice(0, 12) }), { status: 200, headers: hdr });
      } catch (e) {
        return new Response(JSON.stringify({ error: "news fetch failed", articles: [] }), { status: 200, headers: hdr });
      }
    }



    if (url.pathname === "/nws-alerts") {
      const hdr = { "content-type": "application/geo+json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
      const point = String(url.searchParams.get("point") || "").replace("%2C", ",").trim();
      const area = String(url.searchParams.get("area") || "FL").trim();
      const srcs = [];
      if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(point)) srcs.push("https://api.weather.gov/alerts/active?point=" + point);
      srcs.push("https://api.weather.gov/alerts/active?area=" + encodeURIComponent(area || "FL"));
      srcs.push("https://api.weather.gov/alerts/active?zone=FLC015");
      srcs.push("https://api.weather.gov/alerts/active?zone=FLC087");
      const ua = { "User-Agent": "CommonsBoard/1.0 (valente.nick@gmail.com)", Accept: "application/geo+json, application/json" };
      for (const src of srcs) {
        try {
          const r = await fetch(src, { headers: ua, cf: { cacheTtl: 45 } });
          if (!r.ok) continue;
          const text = await r.text();
          if (text && text.indexOf('"features"') >= 0) return new Response(text, { status: 200, headers: hdr });
        } catch (e) {}
      }
      return new Response(JSON.stringify({ type: "FeatureCollection", features: [], via: "empty" }), { status: 200, headers: hdr });
    }

    if (url.pathname === "/pub") {
      const hdr = { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" };
      const target = String(url.searchParams.get("u") || "");
      const ok = /^https:\/\/(www\.fema\.gov|services3\.arcgis\.com|waterservices\.usgs\.gov|ssd-api\.jpl\.nasa\.gov|www\.spc\.noaa\.gov|www\.ndbc\.noaa\.gov|services\.swpc\.noaa\.gov)\//.test(target);
      if (!ok) return new Response("host not allowed", { status: 400, headers: hdr });
      try {
        const r = await fetch(target, { headers: { "User-Agent": "CommonsBoard/1.0" }, cf: { cacheTtl: 300 } });
        return new Response(await r.text(), { status: r.ok ? 200 : r.status, headers: hdr });
      } catch (e) {
        return new Response(String(e && e.message || e), { status: 502, headers: hdr });
      }
    }

    if (url.pathname === "/nws-proxy") {
      const hdr = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
      let target = String(url.searchParams.get("u") || "").trim();
      if (target.indexOf("https://api.weather.gov/") !== 0) {
        return new Response(JSON.stringify({ error: "nws only" }), { status: 400, headers: hdr });
      }
      try {
        const r = await fetch(target, {
          headers: { "User-Agent": "CommonsBoard/1.0 (valente.nick@gmail.com)", Accept: "application/geo+json, application/json" },
          cf: { cacheTtl: 60 }
        });
        return new Response(await r.text(), { status: r.ok ? 200 : r.status, headers: hdr });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 502, headers: hdr });
      }
    }

    if (url.pathname === "/ics") {
      const id = url.searchParams.get("c") === "eng" ? ENG : BW;
      const src = "https://calendar.google.com/calendar/ical/" + encodeURIComponent(id) + "/public/basic.ics";
      const r = await fetch(src, { headers: { "User-Agent": "Commons/1.0" }, cf: { cacheTtl: 0 } });
      return new Response(await r.text(), {
        status: r.ok ? 200 : r.status,
        headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" }
      });
    }

    if (url.pathname === "/deliveries.json") {
      return driveJson(DELIV_ID, "deliveries.json", {
        updated: "",
        source: "Drive deliveries.json not readable",
        incoming: [],
        delivered: []
      });
    }
    if (url.pathname === "/maps.json") {
      const hdr = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
      const urls = driveUrls(MAPS_ID);
      for (const src of urls) {
        try {
          const r = await fetch(src + (src.indexOf("?") >= 0 ? "&" : "?") + "cb=" + Date.now(), {
            headers: { "User-Agent": "Commons/1.0", Accept: "application/json" },
            cf: { cacheTtl: 0 }
          });
          const text = jsonOk(await r.text());
          if (text) return new Response(text, { status: 200, headers: hdr });
        } catch (e) {}
      }
      return new Response(JSON.stringify({ updated: "", gmapsKey: "", error: "maps.json is Drive-only" }), { status: 200, headers: hdr });
    }
    if (url.pathname === "/onebite") {
      const hdr = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*", "access-control-allow-methods": "GET,OPTIONS", "access-control-allow-headers": "Content-Type" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: hdr });
      const lat = url.searchParams.get("lat") || "";
      const lon = url.searchParams.get("lon") || "";
      const limit = Math.min(30, Number(url.searchParams.get("limit")) || 30);
      if (!lat || !lon) return new Response(JSON.stringify([]), { status: 200, headers: hdr });
      try {
        const r = await fetch("https://api.onebite.app/venue?lat=" + lat + "&lon=" + lon + "&limit=" + limit, {
          headers: { "User-Agent": "Commons/1.0", Accept: "application/json" }
        });
        const text = await r.text();
        return new Response(text, { status: 200, headers: hdr });
      } catch (e) {
        return new Response(JSON.stringify([]), { status: 200, headers: hdr });
      }
    }
    if (url.pathname === "/key.json") {
      return driveJson(KEY_ID, "key.json", { updated: "", error: "Drive file must be Anyone with the link, Viewer" });
    }
    if (url.pathname === "/flights.json") {
      return driveJson(FLIGHT_ID, "flights.json", {
        updated: "2026-09-06 10:00 ET",
        source: "fallback until Drive is Anyone with the link",
        flights: [{ who: "Dayna", flight: "Breeze MX537", from: "RSW", to: "BDL", when: "Sun Sep 6 10:00a", status: "Confirmed" }]
      });
    }
    if (url.pathname === "/community.json") {
      return driveJson(COMM_ID, "community.json", {
        updated: "",
        source: "Drive community.json not readable",
        need: [],
        announce: [],
        newsletters: [],
        surveys: [],
        archive: []
      });
    }
    if (url.pathname === "/events.json") {
      return driveJson("", "events.json", {
        updated: "",
        source: "GitHub events.json not readable — keep events.json on the fl-board repo, not Drive",
        events: []
      });
    }
    if (url.pathname === "/events-live") {
      const lat = url.searchParams.get("lat") || "27.0";
      const lon = url.searchParams.get("lon") || "-82.3";
      const place = url.searchParams.get("place") || "Englewood FL";
      const q = encodeURIComponent(place + ' (festival OR fair OR market OR "live music" OR concert OR trivia OR bingo OR comedy OR parade OR "farmers market" OR brewery OR tasting)');
      const rss = "https://news.google.com/rss/search?q=" + q + "&hl=en-US&gl=US&ceid=US:en";
      try {
        const r = await fetch(rss, { headers: { "user-agent": "Commons/1.0" } });
        const xml = await r.text();
        const items = [];
        const re = /<item>([\s\S]*?)<\/item>/g;
        let m;
        while ((m = re.exec(xml)) && items.length < 20) {
          const block = m[1];
          const title = (block.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
          const link = (block.match(/<link>([^<]*)<\/link>/) || [])[1] || "";
          const pub = (block.match(/<pubDate>([^<]*)<\/pubDate>/) || [])[1] || "";
          const clean = title.replace(/ - .*$/, "").trim();
          if (!clean) continue;
          const when = new Date(pub || Date.now());
          if (isNaN(when.getTime())) continue;
          items.push({
            sum: clean.slice(0, 140),
            loc: place,
            desc: "From local news",
            when: when.toISOString(),
            end: new Date(when.getTime() + 3 * 3600 * 1000).toISOString(),
            allDay: false,
            src: "live",
            href: link
          });
        }
        return new Response(JSON.stringify({
          updated: new Date().toISOString(),
          place: place,
          events: items
        }), { headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=1800" } });
      } catch (e) {
        return new Response(JSON.stringify({ updated: "", events: [], error: String(e) }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
      }
    }
    if (url.pathname === "/house.json" || url.pathname === "/house") {
      if (request.method === "POST") {
        return new Response(JSON.stringify({
          ok: false,
          error: "House list is stored as house.json on GitHub. Upload that file to the repo to share it."
        }), { status: 405, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
      }
      return driveJson("", "house.json", {
        updated: "",
        source: "GitHub house.json not readable — keep house.json on the fl-board repo, not Drive"
      });
    }

    if (url.pathname === "/places") {
      const hdr = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*"
      };
      if (request.method === "OPTIONS") return new Response(null, { headers: hdr });
      const key = url.searchParams.get("key") || request.headers.get("x-goog-api-key") || "";
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));
      const miles = Number(url.searchParams.get("miles") || 15);
      if (!key || !isFinite(lat) || !isFinite(lon)) {
        return new Response(JSON.stringify({ error: { message: "key, lat, lon required" } }), { status: 400, headers: hdr });
      }
      try {
        let r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.rating,places.userRatingCount,places.currentOpeningHours,places.location,places.types"
          },
          body: JSON.stringify({
            includedTypes: ["restaurant"],
            maxResultCount: 20,
            rankPreference: "DISTANCE",
            locationRestriction: {
              circle: { center: { latitude: lat, longitude: lon }, radius: Math.min(50000, miles * 1609.34) }
            }
          })
        });
        let text = await r.text();
        if (r.ok && text.indexOf('"places"') >= 0) return new Response(text, { status: 200, headers: hdr });
        const legacy = "https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=" + lat + "," + lon + "&radius=" + Math.round(Math.min(50000, miles * 1609.34)) + "&type=restaurant&key=" + encodeURIComponent(key);
        r = await fetch(legacy, { cf: { cacheTtl: 60 } });
        const old = await r.json();
        const rows = (old.results || []).map(function (pl) {
          return {
            id: pl.place_id,
            displayName: { text: pl.name },
            formattedAddress: pl.vicinity || "",
            shortFormattedAddress: pl.vicinity || "",
            rating: pl.rating,
            userRatingCount: pl.user_ratings_total || 0,
            location: pl.geometry && pl.geometry.location ? { latitude: pl.geometry.location.lat, longitude: pl.geometry.location.lng } : {},
            types: pl.types || []
          };
        });
        return new Response(JSON.stringify({ places: rows, via: "legacy-nearby", status: old.status }), { status: 200, headers: hdr });
      } catch (e) {
        return new Response(JSON.stringify({ error: { message: String(e && e.message || e) } }), { status: 502, headers: hdr });
      }
    }

    if (url.pathname === "/osm-eats") {
      const hdr = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));
      const miles = 10;
      if (!isFinite(lat) || !isFinite(lon)) return new Response(JSON.stringify({ places: [] }), { headers: hdr });
      const rad = Math.round(miles * 1609.34);
      const amenities = ["restaurant","fast_food","cafe","bar","pub","ice_cream","food_court","biergarten"];
      const q = "[out:json][timeout:25];(" + amenities.map(function (a) { return "node[amenity=" + a + "](around:" + rad + "," + lat + "," + lon + ");"; }).join("") + ");out body 80;";
      const srcs = [
        "https://overpass.kumi.systems/api/interpreter?data=" + encodeURIComponent(q),
        "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q)
      ];
      for (const src of srcs) {
        try {
          const r = await fetch(src, { headers: { "User-Agent": "Commons/1.0" }, cf: { cacheTtl: 300 } });
          if (!r.ok) continue;
          const d = await r.json();
          const els = d.elements || [];
          const places = els.filter(function (el) { return el.tags && el.tags.name; }).slice(0, 80).map(function (el) {
            return {
              displayName: { text: el.tags.name },
              formattedAddress: [el.tags["addr:street"], el.tags["addr:city"]].filter(Boolean).join(", "),
              shortFormattedAddress: el.tags["addr:city"] || "",
              rating: null,
              userRatingCount: 0,
              location: { latitude: el.lat, longitude: el.lon },
              types: [el.tags.amenity || "restaurant", el.tags.cuisine || ""]
            };
          });
          if (places.length) return new Response(JSON.stringify({ places: places, via: "osm" }), { headers: hdr });
        } catch (e) {}
      }
      return new Response(JSON.stringify({ places: [], via: "osm-empty" }), { headers: hdr });
    }

    if (url.pathname === "/busy") {
      const hdr = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=900", "access-control-allow-origin": "*" };
      const q = String(url.searchParams.get("q") || "").trim().slice(0, 120);
      if (q.length < 4) return new Response(JSON.stringify({ q: q, label: "" }), { headers: hdr });
      const src = "https://r.jina.ai/https://www.google.com/maps/search/" + encodeURIComponent(q);
      try {
        const r = await fetch(src, { headers: { "User-Agent": "Commons/1.0", Accept: "text/plain" }, cf: { cacheTtl: 600 } });
        const text = (await r.text()).slice(0, 20000);
        const low = text.toLowerCase();
        let label = "";
        let level = "";
        if (/wait time[^.]{0,40}(\d+)\s*min/.test(low) || /(\d+)\s*(?:min|minute) wait/.test(low)) {
          const m = low.match(/(\d+)\s*(?:min|minute)/);
          const n = m ? parseInt(m[1], 10) : 0;
          if (n >= 20) { label = n + " min wait"; level = "long"; }
          else if (n >= 10) { label = n + " min wait"; level = "busy"; }
        } else if (/as busy as it gets|packed|crowded/.test(low)) { label = "Packed"; level = "long"; }
        else if (/a little busy|busier than usual|usually busy/.test(low)) { label = "Busy"; level = "busy"; }
        else if (/not too busy|not busy|usually not busy|quiet/.test(low)) { label = "Quiet"; level = "quiet"; }
        return new Response(JSON.stringify({ q: q, label: label, level: level }), { headers: hdr });
      } catch (e) {
        return new Response(JSON.stringify({ q: q, label: "" }), { headers: hdr });
      }
    }

    if (url.pathname === "/adsb") {
      const hdr = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon");
      const dist = url.searchParams.get("dist") || "100";
      if (lat && lon) {
        try {
          const r = await fetch("https://api.adsb.lol/v2/lat/" + lat + "/lon/" + lon + "/dist/" + dist, {
            headers: { "User-Agent": "Mozilla/5.0 Commons/1.0", Accept: "application/json" }
          });
          if (r.ok) {
            const d = await r.json();
            return new Response(JSON.stringify(d), { status: 200, headers: hdr });
          }
        } catch (e) {}
        return new Response(JSON.stringify({ ac: [] }), { status: 200, headers: hdr });
      }
      const call = String(url.searchParams.get("c") || "").replace(/\s+/g, "").toUpperCase();
      const hexQ = String(url.searchParams.get("hex") || "").replace(/\s+/g, "").toLowerCase();
      const known = { MXY537: "a25b66", MX537: "a25b66" };
      const hex = hexQ || known[call] || "";
      const srcs = [];
      if (hex) srcs.push("https://api.adsb.lol/v2/hex/" + hex);
      if (call) srcs.push("https://api.adsb.lol/v2/callsign/" + call);
      srcs.forEach(function (s) {
        srcs.push("https://api.allorigins.win/raw?url=" + encodeURIComponent(s));
      });
      const tried = [];
      for (const src of srcs) {
        try {
          const r = await fetch(src, {
            headers: { "User-Agent": "Mozilla/5.0 Commons/1.0", Accept: "application/json" },
            cf: { cacheTtl: 0, cacheEverything: false }
          });
          tried.push((r.ok ? "ok " : "bad ") + src.replace("https://", "").slice(0, 48));
          if (!r.ok) continue;
          let text = await r.text();
          if (!text || text.charAt(0) !== "{") continue;
          const d = JSON.parse(text);
          const ac = (d && d.ac && d.ac[0]) || null;
          if (ac && (ac.lat || ac.hex || ac.flight)) {
            d.via = src.slice(0, 80);
            return new Response(JSON.stringify(d), { status: 200, headers: hdr });
          }
        } catch (e) {
          tried.push("err " + src.replace("https://", "").slice(0, 40));
        }
      }
      return new Response(JSON.stringify({ ac: [], tried: tried }), { status: 200, headers: hdr });
    }

    const raw = asRaw(SOURCE);
    if (raw.indexOf("http") !== 0) {
      return new Response("Set SOURCE to the GitHub Raw URL of index.html.", { status: 500 });
    }

    const bust = Math.floor(Date.now() / 60000); // 1-minute cache-buster
    const srcUrl = raw + (raw.indexOf("?") >= 0 ? "&" : "?") + "v=" + bust;
    const r = await fetch(srcUrl, {
      headers: { "User-Agent": "Commons/1.0", "Accept": "text/html" },
      cf: { cacheTtl: 0, cacheEverything: false }
    });
    if (!r.ok) {
      return new Response("GitHub " + r.status + " for " + raw, { status: 502, headers: { "content-type": "text/plain" } });
    }
    const text = await r.text();
    return new Response(text, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "cdn-cache-control": "no-store"
      }
    });
  }
};
