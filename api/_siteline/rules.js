// Siteline — rule-based decision engine (no AI service, no cost).
// Each dimension is scored 0-100 from Census numbers, mostly by comparing the
// neighborhood (census tract) with its county, then combined with fixed weights.
// Owner notes are scanned for simple keyword cues that adjust the profile.

const { DIMENSIONS, verdictFor } = require("./engine");

const clamp = (x, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));

// Piecewise-linear interpolation through [x, y] points.
function curve(x, points) {
  if (x == null || !Number.isFinite(x)) return null;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[points.length - 1][1];
}

// Tract share vs county share: 0.5x -> 5, same as county -> 50, 1.5x -> 85, 2x+ -> 100.
const LIFT = [[0.5, 5], [1, 50], [1.5, 85], [2, 100]];
const liftScore = (t, c) => (t == null || !c ? null : curve(t / c, LIFT));

const NOTE_CUES = [
  { re: /\b(kids?|child(ren)?|parents?|famil(y|ies)|toddlers?|moms?|dads?)\b/i, set: { household: "families" }, says: "families with children" },
  { re: /\b(singles?|couples?|young professionals?|nightlife|bar|date night)\b/i, set: { household: "no_kids" }, says: "adults without kids" },
  { re: /\b(remote|wi-?fi|laptops?|work from home|wfh|coworking)\b/i, set: { mobility: "remote" }, says: "remote workers" },
  { re: /\b(parking|drive[- ]?(thru|through|up)|car|suburban)\b/i, set: { mobility: "drive" }, says: "customers who drive" },
  { re: /\b(walk(-?in|able|ing)?|foot traffic|transit|subway|commuters?)\b/i, set: { mobility: "walk_transit" }, says: "walk-in customers" },
  { re: /\b(students?|college|universit(y|ies)|campus)\b/i, set: { housing: "renters" }, says: "students and renters" },
  { re: /\b(homeowners?|home improvement|garden(ing)?|lawn)\b/i, set: { housing: "owners" }, says: "homeowners" },
  { re: /\b(premium|luxury|upscale|high[- ]end|boutique|artisan(al)?|specialty)\b/i, price: "premium", says: "a premium price point" },
  { re: /\b(budget|affordable|cheap|discount|value|low[- ]cost|dollar)\b/i, price: "budget", says: "an affordable price point" },
];

// Fill in profile traits the owner left as "Any" from cues in their notes.
function readNotes(icp, notes) {
  const effective = { ...icp };
  const heard = [];
  let price = null;
  for (const cue of NOTE_CUES) {
    if (!notes || !cue.re.test(notes)) continue;
    if (cue.price) {
      if (!price) { price = cue.price; heard.push(cue.says); }
      continue;
    }
    const [k, v] = Object.entries(cue.set)[0];
    if (effective[k] === "any") { effective[k] = v; heard.push(cue.says); }
  }
  return { effective, price, heard };
}

function lifestyleScore(t, c, icp) {
  const parts = [];
  if (icp.education === "college") parts.push(liftScore(t.shareBachelorsPlus, c.shareBachelorsPlus));
  if (icp.education === "graduate") parts.push(liftScore(t.shareGraduateDegree, c.shareGraduateDegree));
  if (icp.household === "families") parts.push(liftScore(t.shareHouseholdsWithKids, c.shareHouseholdsWithKids));
  if (icp.household === "no_kids")
    parts.push(liftScore(1 - (t.shareHouseholdsWithKids ?? 0), 1 - (c.shareHouseholdsWithKids ?? 0)));
  if (icp.housing === "renters") parts.push(liftScore(t.shareRenters, c.shareRenters));
  if (icp.housing === "owners") parts.push(liftScore(t.shareOwners, c.shareOwners));
  if (icp.mobility === "walk_transit")
    parts.push(liftScore((t.shareCommuteWalk ?? 0) + (t.shareCommuteTransit ?? 0), (c.shareCommuteWalk ?? 0) + (c.shareCommuteTransit ?? 0)));
  if (icp.mobility === "drive") parts.push(liftScore(t.shareCommuteDriveAlone, c.shareCommuteDriveAlone));
  if (icp.mobility === "remote") parts.push(liftScore(t.shareWorkFromHome, c.shareWorkFromHome));
  const valid = parts.filter((x) => x != null);
  return valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : null;
}

function spendingScore(t, c, icp, price) {
  // Compare local median income with the low end of the target income range plus
  // 25% headroom: the typical household should clear the customer's income floor.
  const target = Math.max(icp.incomeMin * 1.25, 30000);
  let s = curve(t.medianHouseholdIncome / target, [[0.5, 5], [0.8, 40], [1, 65], [1.3, 90], [1.6, 100]]);
  if (s == null) return null;
  const hiShareLift = liftScore(t.shareHouseholdsOver100k, c.shareHouseholdsOver100k);
  if (price === "premium" && hiShareLift != null) s = 0.5 * s + 0.5 * hiShareLift;
  if (price === "budget") s = Math.max(s, 60); // affordability is rarely the constraint for budget concepts
  if (t.unemploymentRate != null && c.unemploymentRate) {
    s -= clamp((t.unemploymentRate / c.unemploymentRate - 1.5) * 10, 0, 15);
  }
  return clamp(s);
}

// Customers per square mile; log-shaped so dense cities don't all max out.
const densityScore = (t) =>
  curve(t.populationPerSqMi, [[100, 5], [500, 20], [2000, 50], [5000, 75], [10000, 90], [20000, 100]]);

function decideByRules(input, loc) {
  const t = loc.tract;
  const c = loc.county;
  const { effective, price, heard } = readNotes(input.icp, input.notes);

  const raw = {
    age_fit: liftScore(t.shareInTargetAge, c.shareInTargetAge),
    income_fit: liftScore(t.shareInTargetIncome, c.shareInTargetIncome),
    spending_power: spendingScore(t, c, input.icp, price),
    lifestyle_fit: lifestyleScore(t, c, effective),
    demand_depth: densityScore(t),
  };
  const weights = { ...Object.fromEntries(DIMENSIONS.map((d) => [d.id, d.weight])) };
  if (price === "premium") weights.spending_power += 0.05;

  const active = DIMENSIONS.filter((d) => raw[d.id] != null);
  const totalWeight = active.reduce((s, d) => s + weights[d.id], 0);
  let composite = 0;
  const dimensions = active.map((d) => {
    const score = Math.round(raw[d.id]);
    const weight = weights[d.id] / totalWeight;
    composite += weight * score;
    const level = clamp(Math.round(score / 25), 0, d.criteria.length - 1);
    return {
      id: d.id,
      label: d.label,
      score,
      weight: Math.round(weight * 100),
      confidence: null,
      reading: d.criteria[level],
      evidence: d.evidence(t, c, effective),
    };
  });

  const score = Math.round(composite);
  const sorted = [...dimensions].sort((a, b) => b.score - a.score);
  return {
    score,
    verdict: verdictFor(score),
    confidence: null,
    dimensions,
    strengths: sorted.filter((d) => d.score >= 60).slice(0, 3).map((d) => d.label),
    risks: sorted.filter((d) => d.score < 45).reverse().slice(0, 3).map((d) => d.label),
    notesRead: heard,
    caveats: [
      ...(t.population != null && t.population < 500
        ? ["Very few people live in this census tract. It may be a business district where daytime visitors outnumber residents, and the estimates have wide margins of error."]
        : []),
    ],
    model: "Siteline rules",
  };
}

module.exports = { decideByRules, readNotes, curve, liftScore };
