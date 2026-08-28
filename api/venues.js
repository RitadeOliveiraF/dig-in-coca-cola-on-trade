// DIG-IN · real venue count within a radius, from the Restaurant Discovery DB.
// The Supabase management PAT stays server-side (env var) — never sent to the browser.

const PROJECT_ID = "anwhnijnuxqjrgnnudbe";
const VALID_COUNTRIES = new Set([
  "pt","es","de","gb","fr","nl","be","se","no",
  "at","bg","br","cz","dk","ee","fi","gr","hr","hu","ie","it","lt","lv","pl","ro","si","sk","us"
]);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  try {
    const { country, lat, lng, radius } = req.query;
    const cc = String(country || "").toLowerCase();
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    const radiusN = Math.max(50, Math.min(5000, parseFloat(radius) || 250));

    if (!VALID_COUNTRIES.has(cc)) {
      res.status(200).json({ ok: false, reason: "no_real_data", country: cc });
      return;
    }
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      res.status(400).json({ ok: false, reason: "bad_coords" });
      return;
    }

    const pat = process.env.SUPABASE_MGMT_PAT;
    if (!pat) {
      res.status(500).json({ ok: false, reason: "server_not_configured" });
      return;
    }

    const table = `discovered_businesses_${cc}`;
    const sql = `
      SELECT * FROM (
        SELECT name, category, latitude, longitude,
          (6371000 * acos(
            LEAST(1, cos(radians(${latN})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lngN}))
            + sin(radians(${latN})) * sin(radians(latitude)))
          )) AS dist_m
        FROM ${table}
        WHERE is_fnb = true AND latitude IS NOT NULL AND longitude IS NOT NULL
      ) sub
      WHERE dist_m <= ${radiusN}
      ORDER BY dist_m
      LIMIT 300;
    `;

    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });

    if (!r.ok) {
      res.status(502).json({ ok: false, reason: "upstream_error", status: r.status });
      return;
    }
    const rows = await r.json();
    const list = Array.isArray(rows) ? rows : [];
    const restaurants = list.filter(x => (x.category || "").toLowerCase().includes("restaurant")).length;
    const bars = list.filter(x => { const c = (x.category || "").toLowerCase(); return c.includes("bar") || c.includes("pub"); }).length;

    res.status(200).json({
      ok: true,
      country: cc,
      radius: radiusN,
      venues: list.length,
      restaurants,
      bars,
      points: list.map(x => ({ name: x.name, category: x.category, lat: x.latitude, lng: x.longitude })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, reason: "exception", message: String(e && e.message || e) });
  }
};
