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
    // Haversine distance in metres, filtered to horeca-relevant venues with valid coordinates.
    const sql = `
      SELECT
        count(*) FILTER (WHERE is_fnb) AS venues,
        count(*) FILTER (WHERE is_fnb AND category ILIKE '%restaurant%') AS restaurants,
        count(*) FILTER (WHERE is_fnb AND (category ILIKE '%bar%' OR category ILIKE '%pub%')) AS bars
      FROM ${table}
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND (6371000 * acos(
              LEAST(1, cos(radians(${latN})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lngN}))
              + sin(radians(${latN})) * sin(radians(latitude)))
            )) <= ${radiusN};
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
    const row = Array.isArray(rows) && rows[0] ? rows[0] : { venues: 0, restaurants: 0, bars: 0 };

    res.status(200).json({
      ok: true,
      country: cc,
      radius: radiusN,
      venues: Number(row.venues || 0),
      restaurants: Number(row.restaurants || 0),
      bars: Number(row.bars || 0),
    });
  } catch (e) {
    res.status(500).json({ ok: false, reason: "exception", message: String(e && e.message || e) });
  }
};
