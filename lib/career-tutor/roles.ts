import { normalize, tokens } from "./retrieval";
import type { KnowledgeEntry } from "./types";

// Words that describe a role without identifying it. "engineer" alone must not
// pick the data-engineer roadmap, and "data science role" is still data science.
const roleFillers = new Set("role roles job jobs career careers position profession professional work field track path successful good great senior junior fresher entry level beginner".split(" "));
const ignoredTails = [
  /\s+(?:in|within|under|over)\s+(?:the\s+)?(?:next\s+)?\d+\s*(?:days?|weeks?|months?|years?)\b.*$/i,
  /\s+(?:from|at)\s+(?:scratch|zero|home)\b.*$/i,
  /\s+(?:from|without|while|after|using|via|when|if|because|so that)\b.*$/i,
  /\s+(?:as|for)\s+(?:a\s+)?(?:complete\s+)?(?:fresher|beginner|student|graduate|newbie)\b.*$/i,
  /\s+(?:for|to)\s+me\b.*$/i,
  /\s+(?:please|quickly|fast|asap|step by step|with resources|with timeline|with a timeline)\b.*$/i,
  /\s*\([^)]*\)\s*$/,
];
const leadingNoise = /^(?:a|an|the|good|great|successful|professional|certified|qualified|skilled|junior|senior|full[- ]time|becoming|become|being|be)\s+/i;
// "Give me a frontend developer roadmap" starts with a request, not a role.
const requestPrefix = /^(?:(?:hi|hello|hey|ok|okay)[,!\s]+)?(?:(?:can|could|would|will) you\s+|please\s+|i (?:need|want|would like|wish)\s+(?:to\s+(?:get|have|see)\s+)?|(?:give|show|send|create|make|build|suggest|provide|write|draft|prepare|design|share|generate|need|want|get|plan|outline|explain)\s+(?:me\s+)?|(?:a|an|the|one|my|your|some)\s+|(?:good|quick|detailed|simple|proper|realistic|new|best)\s+)+/i;
const referential = /^(?:it|that|this|them|those|these|one|the same|something|anything|which|what)\b/i;

// Ordered from most to least specific so "roadmap to become an accountant"
// yields "accountant", not "become an accountant".
const patterns = [
  /\b(?:roadmap|road map|path(?:way)?|plan|route|guide|steps?|curriculum|syllabus|timeline)\s+(?:for|to|towards|toward|into|on)\s+(?:becoming|become|being|be|getting into|get into|learn(?:ing)?|study(?:ing)?|master(?:ing)?|a career (?:as|in)|working as|landing)\s+(?:a |an |the )?([^?.,!;\n]+)/i,
  /\b(?:roadmap|road map|path(?:way)?|plan|route|guide|steps?|curriculum|syllabus|timeline)\s+(?:for|to|towards|toward|into|on)\s+(?:a |an |the )?([^?.,!;\n]+)/i,
  /\b(?:become|becoming|be)\s+(?:a |an |the )?([^?.,!;\n]+)/i,
  /\b(?:career|job|work|working)\s+(?:as|in)\s+(?:a |an |the )?([^?.,!;\n]+)/i,
  /\b(?:switch|transition|move|get|break|pivot|go)\s+(?:into|to|in|towards|toward)\s+(?:a |an |the )?([^?.,!;\n]+)/i,
  /\b(?:learn|study|prepare|train|qualify)\s+(?:for|to be|to become|as)\s+(?:a |an |the )?([^?.,!;\n]+)/i,
  /\b(?:start|begin|land|pursue)\s+(?:a |an |the |my )?(?:career|job|role|work)\s+(?:as|in)\s+(?:a |an |the )?([^?.,!;\n]+)/i,
  /^([a-z][a-z0-9+#.&/ -]{2,80}?)\s+(?:roadmap|road map|career path|learning path|study plan|career roadmap)\b/i,
];

export function cleanRole(value: string): string | null {
  let role = value.replace(/\s+/g, " ").trim();
  if (/^my\b|\bmy\s+(?:target|current|own|chosen|saved|profile|existing)\b/i.test(role)) return null;
  for (const tail of ignoredTails) role = role.replace(tail, "").trim();
  role = role.replace(/^(?:how (?:do|can|should) i |i want to |i would like to |i wish to |help me |please )+/i, "");
  role = role.replace(requestPrefix, "").trim();
  role = role.replace(leadingNoise, "").replace(leadingNoise, "").trim();
  role = role.replace(/\s+(?:roles?|jobs?|careers?|positions?|professions?|fields?|tracks?|work)$/i, "").trim();
  role = role.replace(/[?.!,;:]+$/g, "").trim();
  // "my target role" points at the saved profile, which the caller decides about explicitly.
  if (!role || role.length > 60 || referential.test(role) || /^my\b|\bmy\s+(?:target|current|own|chosen|saved|profile|existing)\b/i.test(role)) return null;
  const meaningful = tokens(role).filter(word => !roleFillers.has(word));
  if (!meaningful.length) return null;
  return role;
}

/** The role the latest message asks about. Never falls back to saved profile state. */
export function roleFromQuestion(question: string): string | null {
  for (const pattern of patterns) {
    const match = question.match(pattern)?.[1];
    if (!match) continue;
    const role = cleanRole(match);
    if (role) return role;
  }
  return null;
}

function stem(word: string) {
  return word.replace(/(?:ies|es|s)$/, "").replace(/(?:ing|ist|ists|ant|ants|er|ers|or|ors|ment|ion|ions|ics)$/, "");
}
function related(a: string, b: string) {
  if (a === b) return true;
  const left = stem(a), right = stem(b);
  if (left === right) return true;
  const shared = Math.min(left.length, right.length);
  return shared >= 5 && (left.startsWith(right) || right.startsWith(left));
}
export function roleTokens(role: string) {
  return tokens(normalize(role)).filter(word => !roleFillers.has(word));
}
function sameRole(role: string[], target: string[]) {
  if (!role.length || !target.length) return false;
  return role.every(word => target.some(other => related(word, other))) && target.every(word => role.some(other => related(word, other)));
}

const targetPattern = /\b(?:become|becoming|start (?:a career |working |a job )?(?:in|as)|start making|start (?:a|an) |move into|get into|break into|prepare for|specialise in|specialize in|build a career (?:in|with)|career (?:in|as)|work(?:ing)? (?:in|as)|learn(?:ing)?|study(?:ing)?|practi[cs]e|contributing to)\s+(?:a |an |the |my )?([^?.,!;\n]+?)(?:\s+(?:for|at|with|while)\s+[^?]*)?(?:\s+(?:roles?|jobs?|work|professionally|career|properly|well|first))?[?.!]*$/i;

function aliasTarget(alias: string): string[] {
  // "How can I move from accounting into data analytics?" teaches a switch, not accounting.
  if (/\bfrom\b/i.test(alias)) return [];
  const match = alias.match(targetPattern)?.[1];
  return match ? roleTokens(match) : [];
}
/** Roles a roadmap entry teaches, read from its question and alternate phrasings. */
export function entryRoleTargets(entry: KnowledgeEntry): {primary: string[]; alternates: string[][]} {
  return {primary: aliasTarget(entry.question), alternates: entry.alternate_questions.map(aliasTarget).filter(target => target.length)};
}

/** A published roadmap entry written for exactly this role, or null. */
export function roadmapEntryForRole(entries: KnowledgeEntry[], role: string): KnowledgeEntry | null {
  const wanted = roleTokens(role);
  if (!wanted.length) return null;
  const roadmaps = entries.filter(entry => entry.intent === "roadmap").map(entry => ({entry, targets: entryRoleTargets(entry)}));
  // An entry whose own question names the role beats one that only mentions it in an alternate phrasing.
  return roadmaps.find(({targets}) => sameRole(wanted, targets.primary))?.entry
    ?? roadmaps.find(({targets}) => targets.alternates.some(target => sameRole(wanted, target)))?.entry
    ?? null;
}
