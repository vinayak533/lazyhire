import "server-only";
import { embed, cosine, embeddingModel } from "./embeddings";
import { publishedEntries } from "./knowledge";
import type { TutorDb } from "./store";
import type { KnowledgeEntry } from "./types";

const stopwords = new Set("a an the i me my can could should would do does to for of in on is are be become how what which learn study get job jobs career careers want need please best as with about and or it that this start into am have after more tell you explain decide keep watch watching watched".split(" "));
const phraseSynonyms: Array<[RegExp, string]> = [
  [/\bdemonstrate readiness for the next level\b/g, "promotion evidence level"],
  [/\bdecide if (?:paying for|choosing) (?:a )?(?:professional )?credential is useful\b/g, "choose certification valuable worth"],
  [/\b(?:can'?t|cannot) build on my own\b/g, "need independent practice"],
  [/\bprofessional credential\b/g, "certification"],
  [/\bcredentials?\b/g, "certification"],
  [/\bpaying for (?:a )?certification\b/g, "choose certification"],
  [/\bpaying for\b/g, "choosing"],
  [/\bworth paying for\b/g, "worth choosing"],
  [/\buseful\b/g, "valuable"],
  [/\bvideos?\b/g, "tutorial"],
  [/\bcourses?\b/g, "tutorial"],
  [/\bon my own\b/g, "independently"],
  [/\bindependently\b/g, "independent"],
  [/\bstrengthen\b/g, "improve stronger"],
  [/\bweak\b/g, "improve"],
  [/\bnumbers?\b/g, "metrics"],
  [/\bnext level\b/g, "promotion level"],
  [/\bdemonstrate readiness\b/g, "promotion evidence"],
  [/\bapply for (?:their|my|a)\s+first internship\b/g, "find first internship"],
];
export function normalize(value: string) {
  let normalized = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  for (const [pattern, replacement] of phraseSynonyms) normalized = normalized.replace(pattern, replacement);
  return normalized.replace(/\bcv\b/g, "resume").replace(/\bdata scientist\b/g, "data science").replace(/\bml\b/g, "machine learning").replace(/\bai\b/g, "artificial intelligence").replace(/[^a-z0-9+#]+/g, " ").trim();
}
export function tokens(value: string) { return [...new Set(normalize(value).split(" ").filter(word => word.length > 1 && !stopwords.has(word)))]; }
export function intent(value: string) {
  // These patterns gate the questions the knowledge base is never allowed to
  // answer, so they must catch changing facts without swallowing evergreen ones.
  // "earning" has to stay word-bounded or it also fires on "learning", and bare
  // "current" has to be qualified or it fires on "my current job" — both sent
  // ordinary career questions down a path where no stored answer can be served.
  if (/salary|salaries|\bpay\b|\bearn(?:s|ing|ings|ed)?\b|compensation|ctc|lpa|eligib|\bexam\b.*(fee|cost|cheap|price)|visa|immigrat|\b202\d\b|latest|current(?:ly)?\s+(?:salar|pay|rate|market|demand|trend|opening|vacanc|fee|price|cost|requirement|rule|hiring|in demand)|job market|job statistics/i.test(value)) return "current-facts";
  // "Should I learn Go or Rust" and "which is better, React or Vue" weigh options; they ask for no roadmap.
  if (/\bvs\b|versus|difference|compare|better than|choose between|\b(?:should i|which(?: one| is)?|what(?:'s| is) better)\b[^?.!]*\bor\b/i.test(value)) return "comparison";
  if (/certificat|credential/i.test(value)) return "certification";
  if (/interview|recruiter screen/i.test(value)) return "interview";
  if (/resume|\bcv\b|\bats\b|cover letter/i.test(value)) return "resume";
  if (/portfolio|project/i.test(value)) return "portfolio";
  if (/roadmap|become|learn|study|start|break into|skills|switch|transition|after bca|prepare/i.test(value)) return "roadmap";
  return "guidance";
}
export interface Match {entry: KnowledgeEntry; confidence: number; semantic: number; lexical: number; exact: boolean;}
export interface Retrieval {matches: Match[]; accepted: Match | null; mode: "hybrid" | "lexical";}

export async function retrieve(db: TutorDb, question: string, embedder: typeof embed = embed): Promise<Retrieval> {
  const documents = publishedEntries(db);
  if (!documents.length) return {matches: [], accepted: null, mode: "lexical"};
  const normalized = normalize(question);
  const queryTokens = tokens(question);
  const questionIntent = intent(question);
  const lexical = queryTokens.length ? db.$client.prepare("SELECT id, bm25(career_tutor_fts, 0, 8, 6, 3, 1) AS rank FROM career_tutor_fts WHERE career_tutor_fts MATCH ? ORDER BY rank LIMIT 30")
    .all(queryTokens.map(word => `"${word.replace(/"/g, '""')}"`).join(" OR ")) as Array<{id: string; rank: number}> : [];
  let vector: number[] | null = null;
  if (documents.some(doc => doc.vector && doc.model === embeddingModel)) {
    try { vector = await embedder(question); } catch { /* Conservative lexical fallback; no silent pseudo-embeddings. */ }
  }
  const rankedVectors = documents.map(doc => ({id: doc.entry.id, score: vector && doc.vector && doc.model === embeddingModel ? cosine(vector, doc.vector) : 0})).sort((a,b) => b.score - a.score);
  const semanticRanks = new Map(rankedVectors.map((row,index) => [row.id,index]));
  const lexicalRanks = new Map(lexical.map((row,index) => [row.id,index]));
  const matches = documents.map(({entry}) => {
    const aliases = [entry.question, ...entry.alternate_questions];
    const exact = aliases.some(alias => normalize(alias) === normalized);
    const vocabulary = new Set(tokens([...aliases, ...entry.keywords].join(" ")));
    const matchedTokens = queryTokens.filter(word => vocabulary.has(word)).length;
    const coverage = queryTokens.length ? matchedTokens / queryTokens.length : 0;
    const semanticRank = semanticRanks.get(entry.id) ?? -1;
    const semantic = rankedVectors[semanticRank]?.score ?? 0;
    const lexicalRank = lexicalRanks.get(entry.id) ?? -1;
    const fused = (lexicalRank >= 0 ? 1 / (60 + lexicalRank) : 0) + (vector ? 1 / (60 + semanticRank) : 0);
    const compatible = entry.intent === questionIntent || questionIntent === "guidance" || entry.intent === "guidance";
    // Confidence is an internal retrieval score, never a probability of career success.
    const semanticConfidence = 0.75 * semantic + 0.15 * coverage + fused * 3 - (compatible ? 0 : 0.18);
    const lexicalConfidence = matchedTokens >= 3 && coverage >= 0.5 && compatible ? 0.58 + 0.1 * semantic + fused : 0;
    const confidence = exact ? 0.99 : Math.max(0, Math.min(0.95, Math.max(semanticConfidence, lexicalConfidence)));
    return {entry, confidence, semantic, lexical: coverage, exact};
  }).sort((a,b) => b.confidence - a.confidence).slice(0, 5);
  const best = matches[0];
  const margin = best ? best.confidence - (matches[1]?.confidence ?? 0) : 0;
  const fresh = best?.entry.last_verified && Date.now() - Date.parse(best.entry.last_verified) < 365 * 86_400_000;
  // Exact, reviewed evergreen answers work offline. Semantic-only matches must meet all gates.
  const constrained = /\b(without|refuse|guarantee|guaranteed|except|instead|within|under)\b|\b(no|not)\s+(degree|python|sql|statistics)|\b\d+\s*(days?|weeks?|months?)\b/i.test(question);
  // A request to invent credentials, references or experience is never answered
  // from the knowledge base: a stored answer about the honest version of the task
  // would read as help with the dishonest one.
  const dishonest =
    /\b(fabricat\w*|falsif\w*|forge[ds]?|forging|fake[ds]?|faking|lie about|lying about|made[ -]up|make up)\b/i.test(
      question,
    );
  // A comparison question ("Python or Java for backend?") may only be served
  // by an entry authored as that comparison, and only on a strong match; any
  // other pairing goes to the mentor, which weighs the options for the asker.
  const comparison = questionIntent === "comparison" && best?.entry.intent === "comparison" && vector &&
    best.confidence >= 0.55 && best.semantic >= 0.5 && best.lexical >= 0.3 && margin >= 0.05;
  const allowed = best && fresh && !best.entry.volatile && !dishonest && questionIntent !== "current-facts" && (best.exact || (!constrained && comparison) || (!constrained && questionIntent !== "comparison" && vector && (
    // Calibrated by sweeping these thresholds over held-out paraphrases and a set
    // of questions that must always be refused (changing facts, off-topic,
    // adversarial, and requests to fabricate). This point answers substantially
    // more real paraphrases while still leaving clear headroom above the closest
    // refusal; loosening further shrinks that headroom to almost nothing.
    (best.confidence >= 0.55 && best.semantic >= 0.52 && best.lexical >= 0.2 && margin >= 0.06) ||
    (best.confidence >= 0.5 && best.semantic >= 0.44 && best.lexical >= 0.35 && margin >= 0.06 && (best.entry.intent === questionIntent || questionIntent === "guidance")) ||
    (best.confidence >= 0.55 && best.semantic >= 0.24 && best.lexical >= 0.5 && margin >= 0.04 && questionIntent === "guidance")
  )));
  return {matches, accepted: allowed ? best : null, mode: vector ? "hybrid" : "lexical"};
}
