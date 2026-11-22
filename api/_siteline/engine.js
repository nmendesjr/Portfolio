// Siteline — decision engine powered by Jev (TypeSafe System One).
// Composite scoring: Jev rates each fit dimension on an ordered 5-level Score,
// and this code combines the normalized scores with weights we control.
// Docs: https://docs.typesafe.ai/patterns/composite-scoring.md

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = process.env.JEV_MODEL || "jev-latest";

const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const usd = (x) => (x == null ? "n/a" : `$${Math.round(x).toLocaleString("en-US")}`);
const num = (x) => (x == null ? "n/a" : Math.round(x).toLocaleString("en-US"));
const vs = (t, c, fmt) => `${fmt(t)} (county: ${fmt(c)})`;

const LABELS = {
  education: { any: null, college: "Mostly college-educated", graduate: "Graduate degree holders" },
  household: { any: null, families: "Families with children", no_kids: "Singles and couples without children" },
  housing: { any: null, renters: "Renters", owners: "Homeowners" },
  mobility: { any: null, walk_transit: "Walk-in / transit customers", drive: "Drive-up customers", remote: "Remote workers home during the day" },
};

function icpSummary(icp) {
  const incomeHi = icp.incomeMax >= 400000 ? "+" : `–${usd(icp.incomeMax)}`;
  const out = {
    age_range: `${icp.ageMin}–${icp.ageMax >= 85 ? "85+" : icp.ageMax} years old`,
    household_income: `${usd(icp.incomeMin)}${incomeHi} per year`,
  };
  for (const k of Object.keys(LABELS)) if (LABELS[k][icp[k]]) out[k] = LABELS[k][icp[k]];
  return out;
}

function buildState(input, loc) {
  const t = loc.tract;
  const c = loc.county;
  return {
    business: {
      concept: input.business,
      owner_notes: input.notes || "(none provided)",
    },
    ideal_customer_profile: icpSummary(input.icp),
    neighborhood: {
      location: `${loc.geo.tractName}, ${loc.geo.countyName || "county"} — near ${loc.geo.matchedAddress}`,
      source: `US Census Bureau, American Community Survey ${loc.acsYear} 5-year estimates, census tract vs. its county`,
      residents: vs(t.population, c.population, num),
      households: num(t.households),
      population_density_per_sq_mi: vs(t.populationPerSqMi, c.populationPerSqMi, num),
      median_age: vs(t.medianAge, c.medianAge, (x) => (x == null ? "n/a" : x.toFixed(1))),
      share_of_residents_in_target_age_range: vs(t.shareInTargetAge, c.shareInTargetAge, pct),
      share_under_18: vs(t.shareUnder18, c.shareUnder18, pct),
      share_65_and_over: vs(t.share65Plus, c.share65Plus, pct),
      median_household_income: vs(t.medianHouseholdIncome, c.medianHouseholdIncome, usd),
      share_of_households_in_target_income_range: vs(t.shareInTargetIncome, c.shareInTargetIncome, pct),
      share_of_households_earning_100k_plus: vs(t.shareHouseholdsOver100k, c.shareHouseholdsOver100k, pct),
      median_home_value: vs(t.medianHomeValue, c.medianHomeValue, usd),
      median_gross_rent: vs(t.medianGrossRent, c.medianGrossRent, usd),
      share_adults_with_bachelors_or_higher: vs(t.shareBachelorsPlus, c.shareBachelorsPlus, pct),
      share_adults_with_graduate_degree: vs(t.shareGraduateDegree, c.shareGraduateDegree, pct),
      share_households_with_children: vs(t.shareHouseholdsWithKids, c.shareHouseholdsWithKids, pct),
      share_renter_households: vs(t.shareRenters, c.shareRenters, pct),
      share_commute_drive_alone: vs(t.shareCommuteDriveAlone, c.shareCommuteDriveAlone, pct),
      share_commute_public_transit: vs(t.shareCommuteTransit, c.shareCommuteTransit, pct),
      share_commute_walk: vs(t.shareCommuteWalk, c.shareCommuteWalk, pct),
      share_work_from_home: vs(t.shareWorkFromHome, c.shareWorkFromHome, pct),
      unemployment_rate: vs(t.unemploymentRate, c.unemploymentRate, pct),
    },
  };
}

// Each dimension: a Jev Score question (levels low -> high), a default weight,
// and a function that returns the Census evidence shown next to it.
const DIMENSIONS = [
  {
    id: "age_fit",
    label: "Age match",
    weight: 0.2,
    instructions:
      "How well does the neighborhood's age mix match the ideal customer's age range? Compare the share of residents in the target age range against the county.",
    criteria: [
      "Very few residents are in the target age range; far below the county",
      "Below the county share; the target age group is under-represented",
      "Roughly in line with the county; no clear advantage",
      "Clearly above the county share; the target age group is well represented",
      "The target age group dominates the neighborhood, far above the county",
    ],
    evidence: (t, c) => [
      `${pct(t.shareInTargetAge)} of residents fall in the target age range (county: ${pct(c.shareInTargetAge)})`,
      `Median age ${t.medianAge ?? "n/a"} (county: ${c.medianAge ?? "n/a"})`,
    ],
  },
  {
    id: "income_fit",
    label: "Income match",
    weight: 0.2,
    instructions:
      "How well do neighborhood household incomes match the ideal customer's income range? Compare the share of households in the target income range against the county.",
    criteria: [
      "Very few households are in the target income range; far below the county",
      "Below the county share; target-income households are under-represented",
      "Roughly in line with the county",
      "Clearly above the county share",
      "Target-income households dominate the neighborhood, far above the county",
    ],
    evidence: (t, c) => [
      `${pct(t.shareInTargetIncome)} of households are in the target income range (county: ${pct(c.shareInTargetIncome)})`,
      `Median household income ${usd(t.medianHouseholdIncome)} (county: ${usd(c.medianHouseholdIncome)})`,
    ],
  },
  {
    id: "spending_power",
    label: "Spending power",
    weight: 0.15,
    instructions:
      "Given this business concept and its likely price point, can local residents afford to be regular customers? Consider income, home values, rent and unemployment.",
    criteria: [
      "Residents clearly cannot afford this business's likely prices",
      "Affordability is a stretch for most residents",
      "Some residents can afford it; spending power is mixed",
      "Most residents can comfortably afford it",
      "Spending power is strong relative to this business's price point",
    ],
    evidence: (t, c) => [
      `${pct(t.shareHouseholdsOver100k)} of households earn $100k+ (county: ${pct(c.shareHouseholdsOver100k)})`,
      `Median rent ${usd(t.medianGrossRent)}, median home value ${usd(t.medianHomeValue)}`,
    ],
  },
  {
    id: "lifestyle_fit",
    label: "Lifestyle match",
    weight: 0.15,
    applies: (icp) => ["education", "household", "housing", "mobility"].some((k) => icp[k] && icp[k] !== "any"),
    instructions:
      "How well do the neighborhood's education, household makeup, renting vs. owning, and commuting patterns match the lifestyle traits listed in the ideal customer profile? Ignore traits the profile does not mention.",
    criteria: [
      "The neighborhood contradicts most of the listed lifestyle traits",
      "Matches few of the listed lifestyle traits",
      "Mixed: matches some traits, misses others",
      "Matches most of the listed lifestyle traits",
      "Strongly matches every listed lifestyle trait",
    ],
    evidence: (t, c, icp) => {
      const e = [];
      if (icp.education !== "any") e.push(`${pct(t.shareBachelorsPlus)} of adults have a bachelor's or higher (county: ${pct(c.shareBachelorsPlus)})`);
      if (icp.household !== "any") e.push(`${pct(t.shareHouseholdsWithKids)} of households have children (county: ${pct(c.shareHouseholdsWithKids)})`);
      if (icp.housing !== "any") e.push(`${pct(t.shareRenters)} of households rent (county: ${pct(c.shareRenters)})`);
      if (icp.mobility !== "any")
        e.push(`Commute: ${pct(t.shareCommuteDriveAlone)} drive alone, ${pct(t.shareCommuteTransit)} transit, ${pct(t.shareCommuteWalk)} walk, ${pct(t.shareWorkFromHome)} work from home`);
      return e;
    },
  },
  {
    id: "demand_depth",
    label: "Customer density",
    weight: 0.15,
    instructions:
      "Is there enough nearby population, density and day-to-day activity to sustain this kind of business from local customers?",
    criteria: [
      "Far too sparse to sustain this business locally",
      "Thin local customer base; would depend heavily on outside traffic",
      "Adequate local base, but not a strength",
      "Dense, active area with a solid local customer base",
      "Exceptionally dense and active; demand depth is a major strength",
    ],
    evidence: (t, c) => [
      `${num(t.population)} residents in this tract, ${num(t.populationPerSqMi)} per sq mi (county: ${num(c.populationPerSqMi)})`,
    ],
  },
  {
    id: "concept_fit",
    label: "Concept & notes",
    weight: 0.15,
    applies: (icp, input) => Boolean(input.notes && input.notes.trim()),
    instructions:
      "Considering the owner's notes about their business and customers, how well does this neighborhood fit what they describe?",
    criteria: [
      "The neighborhood contradicts what the owner describes",
      "A weak fit for what the owner describes",
      "A partial fit; some of the description holds here",
      "A good fit for what the owner describes",
      "An excellent fit; the neighborhood matches the description closely",
    ],
    evidence: () => ["Based on your notes, weighed against the neighborhood data"],
  },
];

const CAVEAT_QUESTION = {
  type: "noul",
  instructions:
    "Is this location likely a mostly non-residential area (such as a downtown office core, campus, industrial zone, park or landmark), where resident data would understate the people who pass through during the day?",
  criteria: {
    true: "Few residents or very low density next to a busy-sounding address; daytime visitors likely outnumber residents",
    false: "A normal residential or mixed-use neighborhood where residents are representative",
  },
};

async function askJev(state, questions) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw Object.assign(new Error("Server is missing TYPESAFE_API_KEY."), { status: 500, userFacing: true });
  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: JEV_MODEL, state, questions }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.detail?.message || `Jev returned ${res.status}`;
    throw Object.assign(new Error(`Decision engine error: ${msg}`), { status: 502, userFacing: true });
  }
  return body;
}

function verdictFor(score) {
  if (score >= 75) return { key: "strong", label: "Strong fit" };
  if (score >= 60) return { key: "promising", label: "Promising" };
  if (score >= 45) return { key: "mixed", label: "Mixed signals" };
  return { key: "weak", label: "Weak fit" };
}

async function decide(input, loc) {
  const active = DIMENSIONS.filter((d) => !d.applies || d.applies(input.icp, input));
  const questions = Object.fromEntries(
    active.map((d) => [d.id, { type: "score", instructions: d.instructions, criteria: d.criteria }])
  );
  questions.daytime_caveat = CAVEAT_QUESTION;

  const state = buildState(input, loc);
  const jev = await askJev(state, questions);

  const totalWeight = active.reduce((s, d) => s + d.weight, 0);
  let composite = 0;
  const dimensions = active.map((d) => {
    const a = jev.answers[d.id];
    const levels = d.criteria.length - 1;
    const normalized = Math.min(1, Math.max(0, a.score / levels));
    const weight = d.weight / totalWeight;
    composite += weight * normalized;
    // Describe the level nearest the expected score so the text agrees with the bar.
    const topLevel = Math.min(levels, Math.max(0, Math.round(a.score)));
    return {
      id: d.id,
      label: d.label,
      score: Math.round(normalized * 100),
      weight: Math.round(weight * 100),
      confidence: a.confidence,
      reading: d.criteria[Number(topLevel)],
      evidence: d.evidence(loc.tract, loc.county, input.icp),
    };
  });

  const score = Math.round(composite * 100);
  const confidence = dimensions.reduce((s, d) => s + d.confidence * (d.weight / 100), 0);
  const caveatProb = jev.answers.daytime_caveat?.noul ?? 0;

  const sorted = [...dimensions].sort((a, b) => b.score - a.score);
  return {
    score,
    verdict: verdictFor(score),
    confidence: Math.round(confidence * 100) / 100,
    dimensions,
    strengths: sorted.filter((d) => d.score >= 60).slice(0, 3).map((d) => d.label),
    risks: sorted.filter((d) => d.score < 45).reverse().slice(0, 3).map((d) => d.label),
    caveats: [
      ...(caveatProb >= 0.5
        ? ["This looks like a largely non-residential area. Resident data likely understates daytime foot traffic, so treat the score as conservative."]
        : []),
      ...(loc.tract.population != null && loc.tract.population < 500
        ? ["Very few people live in this census tract, so the estimates have wide margins of error."]
        : []),
    ],
    model: jev.model,
  };
}

module.exports = { decide, buildState, DIMENSIONS, verdictFor };
