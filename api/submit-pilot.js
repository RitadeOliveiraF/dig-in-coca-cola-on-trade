// DIG-IN · saves a real pilot request to the DIG-IN Hub DB and pings Slack.
// Both the Supabase PAT and the Slack webhook stay server-side only.

const PROJECT_ID = "lnruaaxpwgcdogxywivy"; // DIG-IN Hub
const VALID_COUNTRIES = new Set(["PT","ES","DE","GB","FR","NL","BE","LU","SE","NO","IS","AD","MC"]);

function esc(v) {
  if (v === null || v === undefined) return "NULL";
  return "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
}
function escJsonb(obj) {
  return esc(JSON.stringify(obj == null ? null : obj)) + "::jsonb";
}
function genRef(countryCode) {
  const n = Math.floor(1000 + Math.random() * 8999);
  return `DIG-${countryCode || "XX"}-${n}`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, reason: "method_not_allowed" });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const project = String(body.project || "unknown").slice(0, 100);
    const countryCode = VALID_COUNTRIES.has(String(body.country || "").toUpperCase()) ? String(body.country).toUpperCase() : null;
    const countryName = body.countryName ? String(body.countryName).slice(0, 100) : null;
    const city = body.city ? String(body.city).slice(0, 150) : null;
    const lat = Number.isFinite(parseFloat(body.lat)) ? parseFloat(body.lat) : null;
    const lng = Number.isFinite(parseFloat(body.lng)) ? parseFloat(body.lng) : null;
    const radius = Number.isFinite(parseInt(body.radius)) ? parseInt(body.radius) : 250;
    const venueCount = Number.isFinite(parseInt(body.venueCount)) ? parseInt(body.venueCount) : null;
    const venueCountSource = ["real", "estimate"].includes(body.venueCountSource) ? body.venueCountSource : "estimate";
    const dataPointsTotal = Number.isFinite(parseInt(body.dataPointsTotal)) ? parseInt(body.dataPointsTotal) : null;
    const dataPointsCats = Number.isFinite(parseInt(body.dataPointsCategories)) ? parseInt(body.dataPointsCategories) : null;
    const selectedFields = Array.isArray(body.selectedFields) ? body.selectedFields.slice(0, 50) : [];
    const lang = ["en", "pt"].includes(body.lang) ? body.lang : "en";
    const reference = genRef(countryCode);

    const pat = process.env.SUPABASE_MGMT_PAT;
    if (!pat) { res.status(500).json({ ok: false, reason: "server_not_configured" }); return; }

    const sql = `
      INSERT INTO pilot_requests
        (project, country_code, country_name, city, lat, lng, radius_m, venue_count, venue_count_source,
         data_points_total, data_points_categories, selected_fields, lang, reference, raw_payload)
      VALUES
        (${esc(project)}, ${esc(countryCode)}, ${esc(countryName)}, ${esc(city)}, ${lat ?? "NULL"}, ${lng ?? "NULL"}, ${radius},
         ${venueCount ?? "NULL"}, ${esc(venueCountSource)}, ${dataPointsTotal ?? "NULL"}, ${dataPointsCats ?? "NULL"},
         ${escJsonb(selectedFields)}, ${esc(lang)}, ${esc(reference)}, ${escJsonb(body)})
      RETURNING id, reference, created_at;
    `;

    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if (!r.ok) {
      const errText = await r.text();
      res.status(502).json({ ok: false, reason: "db_error", detail: errText.slice(0, 300) });
      return;
    }
    const rows = await r.json();
    const saved = Array.isArray(rows) && rows[0] ? rows[0] : null;

    // Notify Slack (best-effort — the request is already saved even if this fails)
    let slackOk = false;
    const webhook = process.env.SLACK_PILOT_WEBHOOK_URL;
    if (webhook) {
      try {
        const flagMap = { PT: "🇵🇹", ES: "🇪🇸", DE: "🇩🇪", GB: "🇬🇧", FR: "🇫🇷", NL: "🇳🇱", BE: "🇧🇪", LU: "🇱🇺", SE: "🇸🇪", NO: "🇳🇴", IS: "🇮🇸", AD: "🇦🇩", MC: "🇲🇨" };
        const flag = flagMap[countryCode] || "🌍";
        const fieldsList = selectedFields.length ? selectedFields.map(f => `• ${f}`).join("\n") : "—";
        const text = `*New pilot request* · ${flag} ${countryName || countryCode || "?"} · ${city || "?"}\n` +
          `Reference: \`${reference}\`\n` +
          `Sample area: 250 m · ~${venueCount ?? "?"} venues (${venueCountSource})\n` +
          `Data points requested: ${dataPointsTotal ?? "?"} across ${dataPointsCats ?? "?"} categories\n` +
          `Project: ${project}`;
        const slackRes = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            blocks: [
              { type: "section", text: { type: "mrkdwn", text: `*🔔 New pilot request* · ${flag} ${countryName || countryCode || "?"} · ${city || "?"}` } },
              { type: "section", fields: [
                { type: "mrkdwn", text: `*Reference:*\n\`${reference}\`` },
                { type: "mrkdwn", text: `*Venues in zone:*\n~${venueCount ?? "?"} (${venueCountSource})` },
                { type: "mrkdwn", text: `*Data points:*\n${dataPointsTotal ?? "?"} / ${dataPointsCats ?? "?"} categories` },
                { type: "mrkdwn", text: `*Project:*\n${project}` },
              ]},
              { type: "section", text: { type: "mrkdwn", text: `*Selected categories:*\n${fieldsList}` } },
            ],
          }),
        });
        slackOk = slackRes.ok;
      } catch (e) { slackOk = false; }
    }

    if (webhook && slackOk) {
      // best-effort flag update, ignore failure
      try {
        await fetch(`https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`, {
          method: "POST",
          headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: `UPDATE pilot_requests SET notified_slack = true WHERE reference = ${esc(reference)};` }),
        });
      } catch (e) {}
    }

    res.status(200).json({ ok: true, reference: (saved && saved.reference) || reference, slackNotified: slackOk });
  } catch (e) {
    res.status(500).json({ ok: false, reason: "exception", message: String(e && e.message || e) });
  }
};
