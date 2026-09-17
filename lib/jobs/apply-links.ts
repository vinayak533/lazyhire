/**
 * Apply-link protection.
 *
 * A job card may only show an Apply button for a URL that plausibly leads to an
 * application for that specific vacancy. Everything else a scraper or a search
 * engine hands us (site navigation, government portals, social profiles, app
 * stores, privacy pages, bare company homepages, search-result pages) is either
 * downgraded to a "Company website" link or dropped entirely.
 *
 * The classifier is deliberately conservative: when in doubt it returns
 * "company-website" rather than "apply", and "reject" rather than "company-website".
 */

export type LinkClass = "apply" | "company-website" | "reject";
export interface LinkVerdict {
  kind: LinkClass;
  reason: string;
  url: string;
}

/** Sites that host job listings people can apply through. */
const jobBoardHosts = [
  "technopark.in",
  "infopark.in",
  "ulcyberpark.com",
  "evaniosjobs.com",
  "indeed.com",
  "linkedin.com",
  "naukri.com",
  "glassdoor.com",
  "glassdoor.co.in",
  "foundit.in",
  "monsterindia.com",
  "shine.com",
  "timesjobs.com",
  "hirist.tech",
  "hirist.com",
  "instahyre.com",
  "wellfound.com",
  "cutshort.io",
  "freshersworld.com",
  "internshala.com",
  "apna.co",
  "iimjobs.com",
  "simplyhired.co.in",
  "simplyhired.com",
  "jooble.org",
  "talent.com",
  "adzuna.in",
  "ziprecruiter.com",
  "careerjet.co.in",
  "jobsnear.in",
  "keralajobs.com",
  "bebee.com",
  "jobrapido.com",
  "whatjobs.com",
  "expertia.ai",
  "learn4good.com",
  "workindia.in",
  "quikr.com",
  "olx.in",
  "jobsora.com",
  "mitula.in",
  "trovit.co.in",
  "recruit.net",
  "grabjobs.co",
  "snaphunt.com",
  "glints.com",
  "hireclap.com",
  "placementindia.com",
  "jobs.trabajo.org",
  "trabajo.org",
  "kitjob.in",
  "jobleads.com",
  "jobgether.com",
  "himalayas.app",
  "remotive.com",
  "weworkremotely.com",
  "remoteok.com",
  "lensa.com",
  "dice.com",
  "monster.com",
  "jobaaj.com",
  "builtin.com",
  "joinsaarthi.com",
  "applyall.com",
  "sorce.jobs",
  "getmereferred.com",
  "expertini.com",
  "jobeka.in",
  "jobtensor.com",
  "careerjet.com",
  "jobstreet.com",
  "jobisjob.co.in",
  "whatjobs.co.in",
  "jobsinkerala.com",
  "keralajobsonline.com",
  "nexxt.com",
];

/**
 * Whether a host plausibly belongs to the named employer: a significant word of
 * the company name appears in the registrable domain. "Cubet Techno Labs" and
 * cubet.com match; "Experion Technologies" and jobaaj.com do not, so an unknown
 * board is never labelled as the employer's own site.
 */
export function hostMatchesCompany(host: string, company: string): boolean {
  const domain = host.toLowerCase().replace(/^www\./, "").split(".").slice(0, -1).join("").replace(/[^a-z0-9]/g, "");
  if (!domain) return false;
  const stop = new Set(["private", "pvt", "limited", "ltd", "llp", "inc", "llc", "company", "technologies", "technology", "tech", "techno", "solutions", "solution", "services", "service", "systems", "system", "software", "softwares", "labs", "lab", "group", "global", "india", "international", "consulting", "consultancy", "digital", "infotech", "innovations", "innovation", "enterprises", "enterprise", "corporation", "corp", "the", "and"]);
  const parts = company.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const words = parts.filter((word) => word.length >= 4 && !stop.has(word));
  const initials = parts.map((word) => word[0]).join("");
  return words.some((word) => domain.includes(word)) || (initials.length >= 3 && domain === initials);
}

/** Applicant-tracking systems: a URL on one of these is an application page. */
const atsHosts = [
  "greenhouse.io",
  "boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "jobvite.com",
  "icims.com",
  "bamboohr.com",
  "recruitee.com",
  "workable.com",
  "apply.workable.com",
  "breezy.hr",
  "freshteam.com",
  "zohorecruit.com",
  "zoho.com",
  "keka.com",
  "darwinbox.com",
  "successfactors.com",
  "taleo.net",
  "oraclecloud.com",
  "eightfold.ai",
  "phenom.com",
  "rippling.com",
  "personio.de",
  "teamtailor.com",
  "pinpointhq.com",
  "applytojob.com",
  "jobs.jobvite.com",
  "recruiterbox.com",
  "hire.trakstar.com",
  "dover.com",
  "wellfound.com",
  "forms.gle",
  "docs.google.com",
  "forms.office.com",
  "typeform.com",
  "jotform.com",
];

/** Never an application path, whatever the surrounding text says. */
const blockedHosts = [
  "facebook.com",
  "fb.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com/company",
  "linkedin.com/in",
  "t.me",
  "wa.me",
  "whatsapp.com",
  "apps.apple.com",
  "itunes.apple.com",
  "play.google.com",
  "kerala.gov.in",
  "keralait.org",
  "india.gov.in",
  "google.com",
  "google.co.in",
  "bing.com",
  "duckduckgo.com",
  "wikipedia.org",
  "github.com",
  "medium.com",
  "reddit.com",
  "quora.com",
];

const blockedPaths =
  /(^|\/)(privacy|privacy-policy|terms|terms-of-service|terms-and-conditions|cookie|cookies|disclaimer|sitemap|login|signin|sign-in|signup|sign-up|register|contact|contact-us|about|about-us|faq|help|support|blog|news|press|events|tenders|gallery|visitor|feedback|search|unsubscribe|refund|legal)\/?$/i;

const searchLike =
  /\/(?:search|results)\/?$|[?&](?:q|query|search|keyword|keywords|s|k|what|where)=|\/q-[^/]+-jobs\.html$|\/jobs-in-[^/]+$|\/[^/]+-jobs-in-[^/]+\/?$|\/jobs\?/i;
/** A company's own careers index lists vacancies but is not one of them. */
const careersIndex =
  /^\/(?:jobs|careers?|vacancies|openings|opportunities|join-us|work-with-us|current-openings|job-openings)\/?$/i;

function hostname(url: URL) {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}
function hostMatches(host: string, pattern: string) {
  if (pattern.includes("/")) return false;
  return host === pattern || host.endsWith(`.${pattern}`);
}
function pathHostMatches(url: URL, pattern: string) {
  const [patternHost, ...rest] = pattern.split("/");
  if (!rest.length) return false;
  return (
    hostMatches(hostname(url), patternHost) &&
    url.pathname.toLowerCase().startsWith(`/${rest.join("/")}`)
  );
}

export function parseHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    if (!url.hostname.includes(".")) return null;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)) return null;
    if (/^(?:localhost|.*\.(?:local|internal|test|invalid))$/i.test(url.hostname))
      return null;
    return url;
  } catch {
    return null;
  }
}

export function isJobBoardHost(host: string) {
  return jobBoardHosts.some((board) => hostMatches(host, board));
}
export function isAtsHost(host: string) {
  return atsHosts.some((ats) => hostMatches(host, ats));
}
export function isBlockedHost(url: URL) {
  const host = hostname(url);
  return blockedHosts.some(
    (blocked) => hostMatches(host, blocked) || pathHostMatches(url, blocked),
  );
}

/** A path with real segments; "/" and "/index.html" are homepages. */
function isHomepage(url: URL) {
  const path = url.pathname.replace(/\/+$/, "");
  return (
    (path === "" || /^\/(?:index|home|default)(?:\.[a-z]+)?$/i.test(path)) &&
    !url.search
  );
}

/**
 * Board-specific rules for URLs that look like a single posting rather than a
 * board's search, category or company page.
 */
function boardPostingPath(url: URL): boolean | null {
  const host = hostname(url);
  const path = url.pathname;
  if (hostMatches(host, "technopark.in")) return /^\/job-details\/\d+\/?$/i.test(path);
  if (hostMatches(host, "infopark.in"))
    return /^\/(?:company-jobs\/details\/\d+\/\d+|jobs\/[a-z0-9-]+\/[a-z0-9-]+)\/?$/i.test(
      path,
    );
  if (hostMatches(host, "ulcyberpark.com")) return /\/(?:job|jobs|career|careers)\/[^/]+/i.test(path) && !/\/(?:jobs|careers)\/?$/i.test(path);
  if (hostMatches(host, "evaniosjobs.com")) return /\/job\/[^/]+/i.test(path) || /\/jobs\/[^/]+\/?$/i.test(path);
  if (hostMatches(host, "indeed.com"))
    return /^\/(?:rc\/clk|pagead\/clk|viewjob)/i.test(path) || url.searchParams.has("jk");
  if (hostMatches(host, "linkedin.com"))
    return /^\/jobs\/view\/[^/]+/i.test(path);
  if (hostMatches(host, "naukri.com")) return /-\d{6,}(?:\?|$)/.test(url.href) || /\/job-listings-/i.test(path);
  if (hostMatches(host, "glassdoor.com") || hostMatches(host, "glassdoor.co.in"))
    return /\/job-listing\//i.test(path) || /JV_/i.test(path);
  if (hostMatches(host, "foundit.in")) return /\/job\//i.test(path);
  if (hostMatches(host, "shine.com")) return /\/jobs\/[^/]+\/[^/]+\/\d+/i.test(path);
  if (hostMatches(host, "timesjobs.com")) return /\/job-detail\//i.test(path);
  if (hostMatches(host, "internshala.com")) return /\/(?:internship|job)\/detail\//i.test(path);
  if (hostMatches(host, "freshersworld.com")) return /\/jobs\/[^/]+\/\d+/i.test(path) || /-\d{5,}/.test(path);
  if (hostMatches(host, "apna.co")) return /\/job\//i.test(path);
  if (hostMatches(host, "instahyre.com")) return /\/job-\d+/i.test(path);
  if (hostMatches(host, "cutshort.io")) return /\/job\//i.test(path);
  if (hostMatches(host, "wellfound.com")) return /\/jobs\/\d+/i.test(path);
  if (hostMatches(host, "iimjobs.com")) return /\/j\//i.test(path);
  if (hostMatches(host, "hirist.tech") || hostMatches(host, "hirist.com")) return /\/j\//i.test(path);
  return null;
}

/**
 * Decide whether a URL may be shown as an Apply button, a Company Website
 * link, or must be rejected. `context` is any wording surrounding the link on
 * the page (anchor text, nearby description); it can promote a company URL to
 * an apply link but never rescue a blocked destination.
 */
export function classifyApplyLink(
  value: unknown,
  context = "",
): LinkVerdict {
  const url = parseHttpUrl(value);
  if (!url) return { kind: "reject", reason: "not-http", url: String(value ?? "") };
  const href = url.href;
  const host = hostname(url);
  const path = url.pathname;
  const ats = isAtsHost(host);
  // Google Forms live on docs.google.com; the form host is trusted, the search engine is not.
  if (isBlockedHost(url) && !ats) return { kind: "reject", reason: "blocked-host", url: href };
  if (blockedPaths.test(path)) return { kind: "reject", reason: "site-page", url: href };
  if (/^mailto:|^javascript:|^tel:/i.test(href)) return { kind: "reject", reason: "not-http", url: href };

  const board = boardPostingPath(url);
  if (board === true) return { kind: "apply", reason: "board-posting", url: href };
  if (board === false) return { kind: "reject", reason: "board-category-page", url: href };

  if (ats) {
    if (isHomepage(url)) return { kind: "reject", reason: "ats-homepage", url: href };
    return { kind: "apply", reason: "ats", url: href };
  }
  if (searchLike.test(`${path}${url.search}`))
    return { kind: "reject", reason: "search-page", url: href };
  if (isHomepage(url)) return { kind: "company-website", reason: "homepage", url: href };
  if (careersIndex.test(path) && !url.search)
    return { kind: "company-website", reason: "careers-index", url: href };

  const text = `${href} ${context}`;
  if (/\b(?:apply|application|applications|careers?|jobs?|vacanc(?:y|ies)|openings?|recruit(?:ment)?|hiring|join-us|join_us|joinus|work-with-us|opportunit(?:y|ies))\b/i.test(text))
    return { kind: "apply", reason: "apply-wording", url: href };
  return { kind: "company-website", reason: "unclassified-page", url: href };
}

/** Canonical form for deduplication: lower-case host, no tracking parameters, no hash. */
export function canonicalUrl(value: string | null | undefined): string | null {
  const url = parseHttpUrl(value);
  if (!url) return null;
  url.hash = "";
  const drop = [...url.searchParams.keys()].filter((key) =>
    /^(?:utm_|fbclid|gclid|ref|source|src|trk|tracking|campaign|mc_|_ga|ref_)/i.test(key),
  );
  drop.forEach((key) => url.searchParams.delete(key));
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let href = url.href.replace(/\/+$/, "");
  href = href.replace(/^http:\/\//, "https://");
  return href;
}
