// Siteline — US Census data access.
// 1) Census Geocoder: address -> census tract + county (no key needed).
// 2) American Community Survey 5-year estimates for that tract and its county
//    (needs a free key: https://api.census.gov/data/key_signup.html -> CENSUS_API_KEY).

const GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const ACS_YEAR = process.env.CENSUS_ACS_YEAR || "2024";
const ACS_BASE = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5`;

class UserFacingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const pad = (n) => String(n).padStart(3, "0");
const range = (prefix, from, to) => {
  const out = [];
  for (let i = from; i <= to; i++) out.push(`${prefix}_${pad(i)}E`);
  return out;
};

// Call A: sex by age (B01001), 49 variables.
const AGE_VARS = range("B01001", 1, 49);

// Call B: everything else (< 50 variables per request).
const OTHER_VARS = [
  "B01003_001E", // total population
  "B01002_001E", // median age
  "B19013_001E", // median household income
  ...range("B19001", 1, 17), // household income brackets
  "B15003_001E", "B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E", // education 25+
  "B25003_001E", "B25003_002E", "B25003_003E", // tenure: total, owner, renter
  "B11005_001E", "B11005_002E", // households, households with children < 18
  "B08301_001E", "B08301_003E", "B08301_010E", "B08301_019E", "B08301_021E", // commute
  "B25077_001E", // median home value
  "B25064_001E", // median gross rent
  "B23025_003E", "B23025_005E", // civilian labor force, unemployed
];

// Age bands of B01001 (male 003-025; female = +24). [low, high] inclusive years.
const AGE_BANDS = [
  [0, 4], [5, 9], [10, 14], [15, 17], [18, 19], [20, 20], [21, 21], [22, 24],
  [25, 29], [30, 34], [35, 39], [40, 44], [45, 49], [50, 54], [55, 59], [60, 61],
  [62, 64], [65, 66], [67, 69], [70, 74], [75, 79], [80, 84], [85, 99],
];

// Household income brackets of B19001_002..017, in dollars [low, high).
const INCOME_BANDS = [
  [0, 10000], [10000, 15000], [15000, 20000], [20000, 25000], [25000, 30000],
  [30000, 35000], [35000, 40000], [40000, 45000], [45000, 50000], [50000, 60000],
  [60000, 75000], [75000, 100000], [100000, 125000], [125000, 150000],
  [150000, 200000], [200000, 400000],
];

async function fetchJson(url, what) {
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new UserFacingError(`Couldn't reach the Census ${what} service. Try again in a moment.`, 502);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new UserFacingError(`The Census ${what} service returned an error (${res.status}).`, 502);
  }
  try {
    return JSON.parse(text);
  } catch {
    // The ACS API answers with an HTML page when the key is missing or invalid.
    const hint = /Missing Key|Invalid Key/i.test(text) ? " (Census API key missing or invalid)" : "";
    throw new UserFacingError(`The Census ${what} service returned an unexpected response${hint}.`, 502);
  }
}

async function geocode(address) {
  const params = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "Census Tracts,Counties",
    format: "json",
  });
  const data = await fetchJson(`${GEOCODER}?${params}`, "geocoder");
  const match = data?.result?.addressMatches?.[0];
  if (!match) {
    throw new UserFacingError(
      "We couldn't find that address in Census records. Use a full US street address, like “123 Main St, Austin, TX 78701”."
    );
  }
  const tract = match.geographies?.["Census Tracts"]?.[0];
  const county = match.geographies?.["Counties"]?.[0];
  if (!tract) throw new UserFacingError("That address didn't resolve to a census tract.");
  return {
    matchedAddress: match.matchedAddress,
    lat: match.coordinates?.y,
    lon: match.coordinates?.x,
    state: tract.STATE,
    county: tract.COUNTY,
    tract: tract.TRACT,
    tractName: tract.NAME,
    countyName: county?.NAME || null,
    landAreaSqMi: tract.AREALAND ? Number(tract.AREALAND) / 2589988.11 : null,
    countyLandAreaSqMi: county?.AREALAND ? Number(county.AREALAND) / 2589988.11 : null,
  };
}

async function acs(vars, geoQuery) {
  const key = process.env.CENSUS_API_KEY;
  if (!key) throw new UserFacingError("Server is missing CENSUS_API_KEY.", 500);
  const url = `${ACS_BASE}?get=${vars.join(",")}&${geoQuery}&key=${encodeURIComponent(key)}`;
  const rows = await fetchJson(url, "demographics");
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new UserFacingError("No Census demographics were published for this area.", 404);
  }
  const [header, values] = rows;
  const out = {};
  header.forEach((h, i) => {
    const n = Number(values[i]);
    // Census uses large negative sentinels (e.g. -666666666) for "not available".
    out[h] = Number.isFinite(n) && n > -1e6 ? n : null;
  });
  return out;
}

async function fetchGeography(geoQuery) {
  const [a, b] = await Promise.all([acs(AGE_VARS, geoQuery), acs(OTHER_VARS, geoQuery)]);
  return { ...a, ...b };
}

// Share of a population inside [lo, hi], assuming people are spread evenly inside each band.
function shareInRange(bands, counts, total, lo, hi, inclusive) {
  if (!total) return null;
  let sum = 0;
  bands.forEach(([bLo, bHi], i) => {
    const width = inclusive ? bHi - bLo + 1 : bHi - bLo;
    const oLo = Math.max(lo, bLo);
    const oHi = inclusive ? Math.min(hi, bHi) + 1 : Math.min(hi, bHi);
    if (oHi > oLo) sum += (counts[i] || 0) * ((oHi - oLo) / width);
  });
  return sum / total;
}

const ratio = (a, b) => (a != null && b ? a / b : null);

function profile(raw, landAreaSqMi, icp) {
  const total = raw.B01001_001E;
  const ageCounts = AGE_BANDS.map((_, i) => (raw[`B01001_${pad(i + 3)}E`] || 0) + (raw[`B01001_${pad(i + 27)}E`] || 0));
  const incomeCounts = INCOME_BANDS.map((_, i) => raw[`B19001_${pad(i + 2)}E`]);
  const households = raw.B19001_001E;
  const edTotal = raw.B15003_001E;
  const bachelorsPlus = edTotal
    ? (raw.B15003_022E + raw.B15003_023E + raw.B15003_024E + raw.B15003_025E) / edTotal
    : null;
  const graduate = edTotal ? (raw.B15003_023E + raw.B15003_024E + raw.B15003_025E) / edTotal : null;
  const commuters = raw.B08301_001E;

  return {
    population: raw.B01003_001E,
    households,
    populationPerSqMi: landAreaSqMi ? Math.round(raw.B01003_001E / landAreaSqMi) : null,
    medianAge: raw.B01002_001E,
    medianHouseholdIncome: raw.B19013_001E,
    medianHomeValue: raw.B25077_001E,
    medianGrossRent: raw.B25064_001E,
    shareInTargetAge: shareInRange(AGE_BANDS, ageCounts, total, icp.ageMin, icp.ageMax, true),
    shareInTargetIncome: shareInRange(INCOME_BANDS, incomeCounts, households, icp.incomeMin, icp.incomeMax, false),
    shareUnder18: ratio(ageCounts.slice(0, 4).reduce((s, n) => s + n, 0), total),
    share65Plus: ratio(ageCounts.slice(17).reduce((s, n) => s + n, 0), total),
    shareHouseholdsOver100k: ratio(incomeCounts.slice(12).reduce((s, n) => s + (n || 0), 0), households),
    shareBachelorsPlus: bachelorsPlus,
    shareGraduateDegree: graduate,
    shareRenters: ratio(raw.B25003_003E, raw.B25003_001E),
    shareOwners: ratio(raw.B25003_002E, raw.B25003_001E),
    shareHouseholdsWithKids: ratio(raw.B11005_002E, raw.B11005_001E),
    shareCommuteDriveAlone: ratio(raw.B08301_003E, commuters),
    shareCommuteTransit: ratio(raw.B08301_010E, commuters),
    shareCommuteWalk: ratio(raw.B08301_019E, commuters),
    shareWorkFromHome: ratio(raw.B08301_021E, commuters),
    unemploymentRate: ratio(raw.B23025_005E, raw.B23025_003E),
  };
}

async function locationProfile(address, icp) {
  const geo = await geocode(address);
  const tractQuery = `for=tract:${geo.tract}&in=state:${geo.state}%20county:${geo.county}`;
  const countyQuery = `for=county:${geo.county}&in=state:${geo.state}`;
  const [tractRaw, countyRaw] = await Promise.all([fetchGeography(tractQuery), fetchGeography(countyQuery)]);
  return {
    geo,
    acsYear: ACS_YEAR,
    tract: profile(tractRaw, geo.landAreaSqMi, icp),
    county: profile(countyRaw, geo.countyLandAreaSqMi, icp),
  };
}

module.exports = { locationProfile, geocode, shareInRange, AGE_BANDS, INCOME_BANDS, UserFacingError };
