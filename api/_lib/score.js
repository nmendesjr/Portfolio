// Lexicon-based sentiment scorer, tuned for tech / AI news and social chatter.
// Dependency-free so it runs anywhere (Vercel function, Node script, tests).
//
// Approach (VADER-style, simplified):
//   - each token looks up a valence in LEXICON (-4..+4)
//   - a negator within the previous 3 tokens flips & dampens it
//   - an intensifier directly before boosts it
//   - "but" shifts weight to the clause after it
//   - sum is squashed into a compound score in [-1, 1]

const RAW = `
abandon:-2 abuse:-3 abusive:-3 accelerate:1 accessible:1 accomplish:2 accurate:2 accusation:-2 accuse:-2 accused:-2
achievement:2 acquire:1 acquires:1 addictive:-2 admire:2 adopt:1 adopted:1 adoption:1 advance:2 advanced:1 advances:2
advantage:2 afraid:-2 aggressive:-1 agree:1 alarm:-2 alarming:-3 allegation:-2 allegations:-2 alleged:-1 amazing:3
anger:-3 angry:-3 annoyed:-2 annoying:-2 antitrust:-2 anxiety:-2 appreciate:2 approve:2 approved:2 approves:2 arrest:-3
attack:-2 attacks:-2 award:2 awesome:3 awful:-3 backlash:-3 bad:-2 ban:-2 banned:-2 bans:-2 bankrupt:-3 bankruptcy:-3
battle:-1 beat:1 beats:2 beautiful:3 benefit:2 benefits:2 best:3 better:2 betray:-3 bias:-2 biased:-2 blame:-2
blast:-2 blasts:-2 bleak:-2 blocked:-1 blow:-2 blunder:-2 bold:1 boom:2 boost:2 boosts:2 botched:-2 brilliant:3
breach:-3 breached:-3 breakthrough:3 breakthroughs:3 broken:-2 bubble:-2 bug:-1 buggy:-2 bullish:2 burn:-1 burnout:-2
cancel:-1 cancelled:-1 catastrophe:-3 catastrophic:-3 caution:-1 celebrate:3 censorship:-2 champion:2 chaos:-2 chaotic:-2
cheat:-3 cheating:-3 clean:1 clever:2 collapse:-3 collapses:-3 comeback:2 complain:-2 complaint:-2 complaints:-2
concern:-1 concerned:-2 concerns:-2 confident:2 confusing:-2 controversial:-2 controversy:-2 cool:1 copyright:-1
corrupt:-2 costly:-1 crash:-3 crashed:-3 crashes:-3 crazy:-1 creepy:-2 crisis:-3 critic:-1 critical:-1 criticism:-2
criticize:-2 criticized:-2 crush:1 crushes:1 cut:-1 cuts:-1 damage:-2 danger:-2 dangerous:-2 dead:-3 deal:1 deceptive:-3
decline:-2 declines:-2 defect:-2 defeat:-2 deficit:-1 degrade:-2 degraded:-2 delay:-1 delayed:-1 delays:-1 delight:3
delightful:3 demand:1 dependable:2 destroy:-3 destroys:-3 dethrone:1 dies:-3 difficult:-1 dire:-3 disappoint:-2
disappointed:-2 disappointing:-2 disaster:-3 disastrous:-3 dispute:-2 disrupt:1 distrust:-2 doom:-2 doubt:-1 doubts:-1
downgrade:-2 downtime:-2 drama:-2 drop:-1 drops:-1 dumb:-2 easy:1 efficient:2 elegant:2 embarrassing:-2 empower:2
empowers:2 enable:1 enjoy:2 enthusiasm:2 error:-2 errors:-2 essential:1 ethical:1 evil:-3 exaggerate:-2 excellent:3
excited:3 exciting:3 exodus:-2 expand:1 expands:1 expansion:1 exploit:-2 exploited:-2 exposed:-2 fail:-2 failed:-2
failing:-2 fails:-2 failure:-2 fake:-3 falls:-1 false:-1 fantastic:3 fast:1 faster:1 fault:-2 fear:-2 fears:-2
fiasco:-3 fight:-1 fined:-2 fines:-2 fired:-2 firing:-2 flaw:-2 flawed:-2 flaws:-2 flop:-2 fraud:-4 free:1
frustrated:-2 frustrating:-2 fun:2 funding:1 furious:-3 gain:2 gains:2 garbage:-3 genius:3 glitch:-2 good:2 grand:2
great:3 grow:1 growing:1 growth:2 grows:1 hack:-2 hacked:-3 hallucinate:-2 hallucinates:-2 hallucination:-2
hallucinations:-2 happy:3 harm:-2 harmful:-3 harms:-2 hate:-3 hated:-3 hazard:-2 helpful:2 hero:2 hit:-1 hope:2
hopeful:2 horrible:-3 hostile:-2 huge:1 hurt:-2 hype:-1 illegal:-3 impressive:3 improve:2 improved:2 improvement:2
improves:2 inaccurate:-2 incredible:3 innovate:2 innovation:2 innovative:2 insane:-1 insecure:-2 inspire:2 inspiring:2
investigate:-2 investigation:-2 investigations:-2 investment:1 invests:1 irresponsible:-3 issue:-1 issues:-1 jobs:0
joy:3 junk:-2 kill:-3 kills:-3 lag:-1 lags:-1 lame:-2 landmark:2 launch:1 launches:1 lawsuit:-2 lawsuits:-2 lax:-1
layoff:-2 layoffs:-3 lead:1 leader:2 leading:2 leads:1 leak:-2 leaked:-2 leaks:-2 legendary:3 lie:-3 lied:-3 lies:-3
love:3 loved:3 loves:3 lose:-2 loses:-2 losing:-2 loss:-2 losses:-2 lost:-2 love:3 lying:-3 magic:2 manipulate:-3
manipulation:-3 massive:1 mess:-2 messy:-2 milestone:2 misinformation:-3 misleading:-3 miss:-1 misses:-2 mistake:-2
mistakes:-2 monopoly:-2 nasty:-3 negative:-2 nervous:-2 nice:2 nightmare:-3 nonsense:-2 notable:1 oops:-1 opportunity:2
optimistic:2 outage:-3 outages:-3 outrage:-3 outperform:2 outperforms:2 overhyped:-2 overpriced:-2 overrated:-2
painful:-2 panic:-3 partner:1 partners:1 partnership:2 pathetic:-3 penalty:-2 perfect:3 pioneer:2 plunge:-3 plunges:-3
poor:-2 popular:2 positive:2 powerful:2 praise:3 praised:3 praises:3 privacy:-1 probe:-2 probes:-2 problem:-2
problematic:-2 problems:-2 productive:2 profit:2 profitable:2 progress:2 promising:2 protest:-2 protests:-2 proud:2
quit:-1 quits:-1 racist:-3 rally:2 rare:0 ready:1 recall:-2 record:1 regret:-2 reject:-2 rejected:-2 reliable:2
remarkable:3 resign:-2 resigns:-2 restrict:-1 restrictions:-1 revolutionary:3 rich:1 ridiculous:-2 rip:-2 risk:-2
risks:-2 risky:-2 robust:2 rogue:-2 rough:-1 rug:-1 ruin:-3 ruined:-3 rumor:-1 sad:-2 safe:2 safer:2 safety:1 scam:-3
scandal:-3 scare:-2 scary:-2 scrutiny:-2 secure:2 setback:-2 shock:-2 shocking:-2 shortage:-2 shutdown:-2 shuts:-2
skeptical:-2 skepticism:-2 slam:-2 slammed:-2 slams:-2 slow:-1 slump:-2 smart:2 soar:3 soars:3 solid:2 solve:2
solves:2 sorry:-1 spam:-2 spectacular:3 stable:1 stall:-2 stalls:-2 steal:-3 stole:-3 strike:-1 strong:2 struggle:-2
struggles:-2 stuck:-2 stunning:3 stupid:-3 sue:-2 sued:-2 sues:-2 success:3 successful:3 sucks:-3 superb:3 support:1
surge:2 surges:2 surpass:2 surpasses:2 surveillance:-2 suspend:-2 suspended:-2 terrible:-3 thank:2 thanks:2 threat:-2
threaten:-2 threatens:-2 thrilled:3 thrive:2 thriving:2 toxic:-3 trash:-3 trouble:-2 trust:2 trusted:2 turmoil:-3
ugly:-3 unacceptable:-3 unclear:-1 underwhelming:-2 unfair:-2 unreliable:-2 unsafe:-3 upgrade:2 upgrades:2 urgent:-1
useful:2 useless:-3 valuable:2 valuation:1 victory:3 violate:-2 violated:-3 violation:-3 violations:-3 vulnerable:-2
vulnerability:-2 warn:-2 warning:-2 warns:-2 waste:-2 weak:-2 weird:-1 welcome:2 win:3 wins:3 woke:-1 wonderful:3
worried:-2 worry:-2 worse:-3 worst:-3 worthless:-3 wow:3 wrong:-2 wrongful:-3 yay:3
`;

// Multi-word phrases checked before single tokens.
const PHRASES = {
  "class action": -3, "data breach": -3, "security flaw": -3, "job cuts": -3,
  "price hike": -2, "shut down": -2, "steps down": -1, "under fire": -3,
  "record high": 3, "all-time high": 3, "game changer": 3, "state of the art": 2,
  "state-of-the-art": 2, "raises $": 2, "beats expectations": 3, "misses expectations": -3,
  "no longer": -1, "not worth": -3, "worth it": 2, "pulls out": -2, "back down": -1,
  "goes down": -2, "went down": -2, "is down": -2, "wrongful death": -4, "mental health": -1,
  "top spot": 2, "first place": 2, "open source": 1, "open-source": 1,
};

const NEGATORS = new Set(["not", "no", "never", "none", "nobody", "nothing", "neither", "nor",
  "cannot", "cant", "can't", "dont", "don't", "doesnt", "doesn't", "didnt", "didn't", "isnt",
  "isn't", "wasnt", "wasn't", "arent", "aren't", "wont", "won't", "without", "hardly", "barely"]);

const BOOSTERS = { very: 0.3, really: 0.3, extremely: 0.5, incredibly: 0.4, hugely: 0.4,
  so: 0.2, totally: 0.3, absolutely: 0.4, super: 0.3, most: 0.2, deeply: 0.3, seriously: 0.3,
  slightly: -0.3, somewhat: -0.2, kinda: -0.2, barely: -0.4 };

const LEXICON = Object.create(null);
for (const pair of RAW.trim().split(/\s+/)) {
  const i = pair.lastIndexOf(":");
  LEXICON[pair.slice(0, i)] = Number(pair.slice(i + 1));
}

const NORMALIZE_ALPHA = 6;

function tokenize(text) {
  return text.toLowerCase().replace(/[’`]/g, "'").match(/[a-z0-9$'+-]+|[!?]/g) || [];
}

/**
 * Score a piece of text.
 * @returns {{compound:number, label:'positive'|'negative'|'neutral', hits:string[]}}
 */
function score(text, { threshold = 0.15 } = {}) {
  if (!text) return { compound: 0, label: "neutral", hits: [] };
  let lower = " " + text.toLowerCase() + " ";
  let sum = 0;
  const hits = [];

  for (const [phrase, v] of Object.entries(PHRASES)) {
    if (lower.includes(phrase)) {
      sum += v;
      hits.push(phrase);
      lower = lower.split(phrase).join(" ");
    }
  }

  const tokens = tokenize(lower);
  let butIndex = tokens.indexOf("but");
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let v = LEXICON[t];
    if (v === undefined || v === 0) continue;

    const prev = tokens[i - 1];
    if (prev && BOOSTERS[prev] !== undefined) v += Math.sign(v) * BOOSTERS[prev] * Math.abs(v);

    for (let k = 1; k <= 3; k++) {
      if (NEGATORS.has(tokens[i - k])) { v *= -0.6; break; }
    }

    if (butIndex >= 0) v *= i < butIndex ? 0.5 : 1.5;
    sum += v;
    hits.push(t);
  }

  const bangs = (text.match(/!/g) || []).length;
  if (sum !== 0 && bangs) sum += Math.sign(sum) * Math.min(bangs, 3) * 0.25;

  const compound = sum / Math.sqrt(sum * sum + NORMALIZE_ALPHA);
  const label = compound >= threshold ? "positive" : compound <= -threshold ? "negative" : "neutral";
  return { compound: Math.round(compound * 1000) / 1000, label, hits };
}

module.exports = { score, tokenize, LEXICON };
