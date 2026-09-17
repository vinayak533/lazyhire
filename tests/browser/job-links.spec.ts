import { test, expect, type Page } from "@playwright/test";
import type { ApplicationRecord, CareerBrief } from "@/lib/career/types";
import type { NormalizedJob } from "@/lib/jobs/types";
import type { SearchResponse } from "@/lib/jobs/search";

const testPassword = "StrongPass123!";

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Create an Account" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

async function mockCareerApis(page: Page) {
  let storedBrief: CareerBrief | null = null;
  const applications: ApplicationRecord[] = [];
  await page.route("**/api/profile/brief", async (route) => {
    if (route.request().method() === "POST") storedBrief = route.request().postDataJSON() as CareerBrief;
    await route.fulfill({ json: { brief: storedBrief } });
  });
  await page.route("**/api/applications", async (route) => {
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON() as { job: NormalizedJob; status: ApplicationRecord["status"] };
      const now = new Date().toISOString();
      const record: ApplicationRecord = { id: payload.job.id, jobId: payload.job.id, status: payload.status, jobSnapshot: payload.job, notes: "", createdAt: now, updatedAt: now, appliedAt: payload.status === "applied" ? now : null };
      const index = applications.findIndex((item) => item.id === record.id);
      if (index >= 0) applications[index] = record; else applications.unshift(record);
      await route.fulfill({ json: { application: record } });
      return;
    }
    await route.fulfill({ json: { applications } });
  });
  await page.route("**/api/jobs/insights", (route) => route.fulfill({ status: 503, json: { error: { message: "off" } } }));
}

const base = (): NormalizedJob => ({
  id: "",
  title: "",
  company: "",
  location: "Kochi, Kerala",
  locationBasis: "job",
  datePosted: null,
  datePostedIsApproximate: false,
  applyUrl: null,
  applicationEmail: null,
  applicationLinks: [],
  source: "technopark",
  sourceUrl: null,
  sources: [],
  description: "Build Python services with Django and PostgreSQL for a product team in Kochi, with Docker-based releases and code review.",
  snippet: "Build Python services with Django and PostgreSQL for a product team in Kochi.",
  jobType: "full-time",
  closingDate: null,
  experience: null,
  salary: null,
  skills: ["Python", "Django"],
});

/**
 * What the server hands the client after apply-link validation: an employer
 * page that only qualifies as a company website, a verified employer apply
 * page found on the web, and an undated board posting.
 */
const jobs: NormalizedJob[] = [
  {
    ...base(),
    id: "technopark-1",
    title: "Python Developer",
    company: "Acme Soft",
    datePosted: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    sourceUrl: "https://technopark.in/job-details/4321",
    applicationLinks: [{ label: "Company website", url: "https://www.acmesoft.example/" }],
    applicationEmail: "hr@acmesoft.example",
    sources: [{ source: "technopark", label: "Technopark", url: "https://technopark.in/job-details/4321" }],
  },
  {
    ...base(),
    id: "web-1",
    title: "Python Backend Engineer",
    company: "Kochi Fintech",
    source: "web",
    datePosted: new Date().toISOString(),
    datePostedIsApproximate: true,
    sourceUrl: "https://careers.kochifintech.example/jobs/python-backend-engineer",
    applyUrl: "https://careers.kochifintech.example/jobs/python-backend-engineer",
    applicationLinks: [{ label: "Apply on company website", url: "https://careers.kochifintech.example/jobs/python-backend-engineer" }],
    sources: [{ source: "web", label: "Company Website", url: "https://careers.kochifintech.example/jobs/python-backend-engineer" }],
  },
  {
    ...base(),
    id: "web-2",
    title: "Junior Python Developer",
    company: "Board Listed Ltd",
    source: "web",
    sourceUrl: "https://in.linkedin.com/jobs/view/4000000009",
    applyUrl: "https://in.linkedin.com/jobs/view/4000000009",
    applicationLinks: [{ label: "Apply on LinkedIn", url: "https://in.linkedin.com/jobs/view/4000000009" }],
    sources: [{ source: "web", label: "Web · LinkedIn", url: "https://in.linkedin.com/jobs/view/4000000009" }],
  },
];

const response: SearchResponse = {
  query: "python developer",
  location: "kochi",
  jobs,
  total: jobs.length,
  partial: true,
  sources: [
    { source: "technopark", label: "Technopark", status: "ok", count: 1, hasMore: false },
    { source: "indeed", label: "Indeed India", status: "unavailable", count: 0, hasMore: false, code: "TIMEOUT", message: "Indeed India is taking longer than expected. Other job sources were loaded successfully." },
    { source: "web", label: "Web discovery", status: "ok", count: 2, hasMore: false },
  ],
  cache: { hit: false, fetchedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), stored: false },
};

test("Apply buttons appear only for validated application pages; employer homepages say Company Website; slow sources are reported", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page, `links-${Date.now()}@example.test`);
  await mockCareerApis(page);
  await page.route("**/api/jobs/search**", (route) => route.fulfill({ json: response }));
  await page.goto("/");
  await expect(page.getByLabel("Target role")).toBeEnabled({ timeout: 15_000 });
  await page.getByLabel("Target role").fill("python developer");
  await page.getByLabel("Kochi").check();
  await page.getByRole("button", { name: "Find matches", exact: true }).click();
  await expect(page.locator("article").first()).toBeVisible({ timeout: 30_000 });

  // The slow provider is named, and the other sources still rendered.
  await expect(page.getByRole("status").filter({ hasText: "Indeed India is taking longer than expected" })).toBeVisible();
  await expect(page.getByText("slow", { exact: true })).toBeVisible();
  expect(await page.locator("article").count()).toBe(3);

  // Technopark job: employer homepage only -> Company Website, never Apply.
  const technopark = page.locator("article").filter({ hasText: "Acme Soft" });
  await expect(technopark.getByRole("link", { name: "Company Website" })).toHaveAttribute("href", "https://www.acmesoft.example/");
  await expect(technopark.getByRole("link", { name: "Apply", exact: true })).toHaveCount(0);
  await expect(technopark.getByRole("link", { name: "View Job" })).toHaveAttribute("href", "https://technopark.in/job-details/4321");
  await expect(technopark.getByText("2 days ago")).toBeVisible();
  await expect(technopark.getByText("Technopark", { exact: true })).toBeVisible();

  // Web job with an employer application page -> Apply, badge says Company Website.
  const employer = page.locator("article").filter({ hasText: "Kochi Fintech" });
  await expect(employer.getByRole("link", { name: "Apply", exact: true })).toHaveAttribute("href", /careers\.kochifintech\.example/);
  await expect(employer.getByText("Company Website", { exact: true })).toBeVisible();
  await expect(employer.getByText("Posted today")).toBeVisible();

  // Board posting without a date is labelled honestly.
  const board = page.locator("article").filter({ hasText: "Board Listed Ltd" });
  await expect(board.getByText("Date not verified")).toBeVisible();
  await expect(board.getByText("Web · LinkedIn")).toBeVisible();

  // Save and mark applied from the card, then check the pipeline.
  await employer.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(employer.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
  await employer.getByRole("button", { name: "Applied", exact: true }).click();
  await page.getByRole("button", { name: "Application Pipeline" }).click();
  await expect(page.getByText("Kochi Fintech").first()).toBeVisible();

  // The detail dialog also refuses to invent an Apply button.
  await page.getByRole("button", { name: "Top Matches" }).click();
  await technopark.getByRole("button", { name: "Python Developer", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Company Website", exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Apply", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "View Job" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close job details" }).click();
  expect(errors).toEqual([]);
});

test("web discovery is a selectable source and is sent with the search", async ({ page }) => {
  await signUp(page, `web-source-${Date.now()}@example.test`);
  await mockCareerApis(page);
  let sourcesParam = "";
  await page.route("**/api/jobs/search**", (route) => {
    sourcesParam = new URL(route.request().url()).searchParams.get("sources") ?? "";
    return route.fulfill({ json: { ...response, jobs: [], total: 0, sources: [{ source: "web", label: "Web discovery", status: "skipped", count: 0, hasMore: false, message: "Direct sources returned enough openings; web discovery was not needed." }], partial: false } });
  });
  await page.goto("/");
  await expect(page.getByLabel("Target role")).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByLabel("Web discovery")).toBeChecked();
  await page.getByLabel("Target role").fill("python developer");
  await page.getByRole("button", { name: "Find matches", exact: true }).click();
  await expect(page.getByText("No live matches yet.")).toBeVisible({ timeout: 30_000 });
  expect(sourcesParam.split(",")).toContain("web");
  await expect(page.getByText("not needed")).toBeVisible();
});
