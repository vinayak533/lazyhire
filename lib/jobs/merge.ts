import { canonicalUrl, classifyApplyLink } from "./apply-links";
import { matchesLocation } from "./locations";
import type { NormalizedJob } from "./types";
import { destinationKind } from "./validate";

function words(value: string, company = false): string[] {
  let text = value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/react\.?js/g, "react")
    .replace(/node\.?js/g, "node")
    .replace(/front[- ]end/g, "frontend")
    .replace(/back[- ]end/g, "backend")
    .replace(/full[- ]stack/g, "fullstack")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ");
  if (company)
    text = text.replace(
      /\b(private|pvt|limited|ltd|llp|inc|incorporated|llc|p)\b/g,
      " ",
    );
  return [...new Set(text.trim().split(/\s+/).filter(Boolean))];
}

function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const common = a.filter((word) => b.includes(word)).length;
  return (2 * common) / (a.length + b.length);
}

/**
 * The same posting reached through the same canonical link is one vacancy.
 * Only per-posting links count: an employer's shared careers index or homepage
 * is attached to every vacancy it advertises and must not collapse them.
 */
function sharesDestination(a: NormalizedJob, b: NormalizedJob): boolean {
  const links = (job: NormalizedJob) =>
    [job.applyUrl, job.sourceUrl]
      .filter((url): url is string => Boolean(url))
      .filter((url) => classifyApplyLink(url, "apply").kind === "apply")
      .map((url) => canonicalUrl(url))
      .filter((url): url is string => Boolean(url));
  const mine = new Set(links(a));
  return links(b).some((url) => mine.has(url));
}

export function areDuplicateJobs(a: NormalizedJob, b: NormalizedJob): boolean {
  if (sharesDestination(a, b)) return true;
  if (a.company === "Not specified" || b.company === "Not specified")
    return false;
  const titleA = words(a.title),
    titleB = words(b.title);
  // Preserve distinct seniority levels and technical specialisms at one employer.
  const significant = [
    "senior",
    "junior",
    "lead",
    "intern",
    "internship",
    "manager",
    "principal",
    "staff",
    "react",
    "angular",
    "vue",
    "java",
    "python",
    "node",
    "net",
    "c#",
    "c++",
  ];
  if (
    significant.some((term) => titleA.includes(term) !== titleB.includes(term))
  )
    return false;
  const locationA = a.location.toLowerCase(),
    locationB = b.location.toLowerCase();
  const sameMetro =
    matchesLocation(locationA, "kochi") && matchesLocation(locationB, "kochi");
  // Avoid collapsing identical positions advertised in different cities.
  const cityNames = [
    "kochi",
    "kozhikode",
    "thiruvananthapuram",
    "thrissur",
    "kannur",
    "kollam",
  ] as const;
  if (
    !sameMetro &&
    cityNames.some(
      (city) =>
        matchesLocation(locationA, city) !== matchesLocation(locationB, city),
    )
  )
    return false;
  return (
    similarity(words(a.company, true), words(b.company, true)) >= 0.92 &&
    similarity(titleA, titleB) >= 0.86
  );
}

/**
 * Which copy of a duplicated vacancy people should land on: the employer's own
 * application page first, then a trusted job platform, then an aggregator.
 * Within a tier, LazyHire's direct Kerala sources beat web discovery.
 */
export function authority(job: NormalizedJob): number {
  const destination = destinationKind(job);
  const tier =
    destination === "employer" ? 30 : destination === "platform" ? 20 : destination === "aggregator" ? 10 : 0;
  const direct = ["infopark", "technopark", "ul-cyberpark", "evanios"].indexOf(job.source);
  const applyBonus = job.applyUrl ? 3 : 0;
  return tier + (direct >= 0 ? 4 - direct : 0) + applyBonus;
}

function mergePair(a: NormalizedJob, b: NormalizedJob): NormalizedJob {
  const primary = authority(b) > authority(a) ? b : a;
  const other = primary === a ? b : a;
  const description =
    a.description.length >= b.description.length
      ? a.description
      : b.description;
  const sources = [...a.sources, ...b.sources].filter(
    (item, i, all) =>
      all.findIndex(
        (other) => other.source === item.source && other.url === item.url,
      ) === i,
  );
  const applicationLinks = [
    ...primary.applicationLinks,
    ...other.applicationLinks,
  ].filter(
    (item, i, all) => all.findIndex((other) => other.url === item.url) === i,
  );
  const dated = [a, b]
    .filter((job) => job.datePosted)
    .sort((x, y) => Date.parse(y.datePosted!) - Date.parse(x.datePosted!));
  return {
    ...primary,
    sources,
    applicationLinks,
    description,
    snippet: description.replace(/\s+/g, " ").slice(0, 240),
    applyUrl: primary.applyUrl ?? other.applyUrl,
    applicationEmail: primary.applicationEmail ?? other.applicationEmail,
    jobType: primary.jobType ?? other.jobType,
    closingDate: primary.closingDate ?? other.closingDate,
    datePosted: dated[0]?.datePosted ?? null,
    datePostedIsApproximate: dated[0]?.datePostedIsApproximate ?? false,
  };
}

export function mergeJobs(...groups: NormalizedJob[][]): NormalizedJob[] {
  const merged: NormalizedJob[] = [];
  for (const job of groups.flat()) {
    const index = merged.findIndex((existing) =>
      areDuplicateJobs(existing, job),
    );
    if (index === -1) merged.push({ ...job });
    else merged[index] = mergePair(merged[index], job);
  }
  return merged.sort((a, b) => {
    const dateA = a.datePosted ? Date.parse(a.datePosted) : -Infinity;
    const dateB = b.datePosted ? Date.parse(b.datePosted) : -Infinity;
    return (
      (dateA === dateB ? 0 : dateB - dateA) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id)
    );
  });
}
