// POST /api/siteline — score how well an address fits a business's ideal customer profile.
const { locationProfile } = require("./_siteline/census");
const { decide } = require("./_siteline/engine");

const CHOICES = {
  education: ["any", "college", "graduate"],
  household: ["any", "families", "no_kids"],
  housing: ["any", "renters", "owners"],
  mobility: ["any", "walk_transit", "drive", "remote"],
};

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function parseInput(body) {
  const address = String(body?.address || "").trim().slice(0, 200);
  const business = String(body?.business || "").trim().slice(0, 200);
  const notes = String(body?.notes || "").trim().slice(0, 1500);
  if (address.length < 5) return { error: "Enter a full US street address." };
  if (business.length < 2) return { error: "Describe the business you're opening." };

  const i = body?.icp || {};
  let ageMin = clampInt(i.ageMin, 0, 85, 25);
  let ageMax = clampInt(i.ageMax, 0, 99, 44);
  if (ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin];
  let incomeMin = clampInt(i.incomeMin, 0, 400000, 50000);
  let incomeMax = clampInt(i.incomeMax, 0, 400000, 150000);
  if (incomeMin > incomeMax) [incomeMin, incomeMax] = [incomeMax, incomeMin];
  if (incomeMin === incomeMax) incomeMax = Math.min(400000, incomeMin + 10000);

  const icp = { ageMin, ageMax, incomeMin, incomeMax };
  for (const [k, opts] of Object.entries(CHOICES)) icp[k] = opts.includes(i[k]) ? i[k] : "any";
  return { input: { address, business, notes, icp } };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const { input, error } = parseInput(body);
  if (error) return res.status(400).json({ error });

  try {
    const loc = await locationProfile(input.address, input.icp);
    const result = await decide(input, loc);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      location: {
        address: loc.geo.matchedAddress,
        tract: loc.geo.tractName,
        county: loc.geo.countyName,
        lat: loc.geo.lat,
        lon: loc.geo.lon,
        acsYear: loc.acsYear,
      },
      tract: loc.tract,
      county: loc.county,
      ...result,
    });
  } catch (e) {
    if (e.status && (e.userFacing || e.constructor.name === "UserFacingError")) {
      return res.status(e.status).json({ error: e.message });
    }
    console.error("siteline error", e);
    return res.status(500).json({ error: "Something went wrong scoring this address." });
  }
};

module.exports.parseInput = parseInput;
