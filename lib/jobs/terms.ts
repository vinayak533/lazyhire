/**
 * Browser-safe search-term matching, shared by the source adapters and the
 * client-side ranking. Keep this file free of Node-only imports.
 */
export function matchesSearchTerms(
  value: string,
  query: string,
  ignored = ["job", "jobs", "in", "and", "for"],
): boolean {
  const text = value.toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, " ");
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((word) =>
      word
        .replace(/^developers?$/, "developer")
        .replace(/^engineers?$/, "engineer")
        .replace(/^development$/, "develop"),
    )
    .filter((word) => word && !ignored.includes(word));
  if (!terms.length) return true;
  // A candidate counts only at the start of a word, so "engineer" still finds
  // "engineering" while the "ui" alias no longer fires inside "building" and
  // "js" no longer fires inside "projects".
  const startsWord = (candidate: string) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}])${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "u",
    ).test(text);
  if (startsWord(terms.join(" "))) return true;
  const aliases: Record<string, string[]> = {
    dev: ["developer", "develop", "programmer", "software"],
    develop: ["developer", "dev", "programmer", "software"],
    developer: ["dev", "develop", "programmer", "software", "engineer"],
    engineer: ["engineering", "developer", "software"],
    frontend: ["front end", "front-end", "ui", "react", "web"],
    "front-end": ["frontend", "front end", "ui", "react", "web"],
    web: ["frontend", "front end", "front-end", "ui", "react"],
    javascript: ["js", "node", "react"],
    node: ["node.js", "javascript", "backend"],
    react: ["react.js", "next.js", "frontend", "ui"],
    next: ["next.js", "react", "frontend"],
    marketing: ["seo", "digital", "performance", "growth"],
    sales: ["business development", "bd", "account executive"],
    hr: ["human resources", "recruiter", "talent"],
    qa: ["quality assurance", "testing", "tester", "automation"],
  };
  const matched = terms.filter((term) =>
    [term, ...(aliases[term] ?? [])].some(startsWord),
  );
  if (terms.length === 1) return matched.length === 1;
  return matched.length >= Math.ceil(terms.length * 0.6);
}

