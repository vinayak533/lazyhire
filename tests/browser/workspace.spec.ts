import { test, expect, type Page } from "@playwright/test";
import { docxFixture } from "../fixtures";
import type { ApplicationRecord, CareerBrief } from "@/lib/career/types";
import { sourceIds, sourceLabels, type NormalizedJob } from "@/lib/jobs/types";

const testPassword = "StrongPass123!";

function jobFixture(index: number): NormalizedJob {
  return {
    id: `test-job-${index}`,
    title: `${index % 2 ? "React Developer" : "Frontend Engineer"} ${index}`,
    company: `Example Studio ${index}`,
    location: "Kochi, Kerala",
    locationBasis: "job",
    datePosted: "2026-09-05T00:00:00.000Z",
    datePostedIsApproximate: false,
    applyUrl: `https://example.com/jobs/${index}/apply`,
    applicationEmail:
      index === 1 || index % 3 === 0 ? `jobs${index}@example.com` : null,
    applicationLinks: [
      {
        label: "Apply on company site",
        url: `https://example.com/jobs/${index}`,
      },
    ],
    source: "technopark",
    sourceUrl: `https://example.com/jobs/${index}`,
    sources: [
      {
        source: "technopark",
        label: "Technopark",
        url: `https://example.com/jobs/${index}`,
      },
    ],
    description:
      "Build accessible React and TypeScript interfaces, integrate REST APIs, write Playwright tests, use Docker for releases, and collaborate with designers on product workflows.",
    snippet:
      "React and TypeScript role focused on accessible UI, API integration, automated tests, Docker releases, and design collaboration.",
    jobType: index % 2 ? "full-time" : "contract",
    closingDate: null,
    experience: index % 2 ? "2+ years" : null,
    salary: null,
    skills: ["React", "TypeScript", "REST", "Playwright"],
  };
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Create an Account" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

async function csrf(page: Page) {
  let token = "";
  await expect
    .poll(async () => {
      token = await page.evaluate(async () => {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return "";
        return ((await response.json()).csrfToken as string) ?? "";
      });
      return token;
    })
    .not.toBe("");
  return token;
}

async function cookieHeader(page: Page) {
  return (await page.context().cookies())
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

async function mockCareerApis(page: Page) {
  let storedBrief: CareerBrief | null = null;
  const applications: ApplicationRecord[] = [];
  await page.route("**/api/profile/brief", async (route) => {
    if (route.request().method() === "POST") {
      storedBrief = route.request().postDataJSON() as CareerBrief;
      await route.fulfill({ json: { brief: storedBrief } });
      return;
    }
    await route.fulfill({ json: { brief: storedBrief } });
  });
  await page.route("**/api/applications", async (route) => {
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON() as {
        job: NormalizedJob;
        status: ApplicationRecord["status"];
        notes?: string;
      };
      const now = new Date().toISOString();
      const existing = applications.find(
        (record) => record.jobId === payload.job.id,
      );
      const record: ApplicationRecord = {
        id: payload.job.id,
        jobId: payload.job.id,
        status: payload.status,
        jobSnapshot: payload.job,
        notes: payload.notes ?? existing?.notes ?? "",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        appliedAt:
          payload.status === "applied" || payload.status === "interview"
            ? (existing?.appliedAt ?? now)
            : (existing?.appliedAt ?? null),
      };
      const index = applications.findIndex((item) => item.id === record.id);
      if (index >= 0) applications[index] = record;
      else applications.unshift(record);
      await route.fulfill({ json: { application: record } });
      return;
    }
    await route.fulfill({ json: { applications } });
  });
  return { applications, storedBrief: () => storedBrief };
}

test("guided brief, ranked matches, pipeline and CV upload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const jobs = Array.from({ length: 10 }, (_, index) => jobFixture(index + 1));
  await signUp(page, `guided-${Date.now()}@example.test`);
  const mocks = await mockCareerApis(page);
  await page.route("**/api/jobs/search**", (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("q")).toBe("react developer");
    expect(url.searchParams.get("location")).toBe("kochi");
    expect(url.searchParams.get("sources")).toBe(sourceIds.join(","));
    expect(mocks.storedBrief()?.sources).toEqual([...sourceIds]);
    return route.fulfill({
      json: {
        query: "react developer",
        location: "kochi",
        jobs,
        total: jobs.length,
        sources: sourceIds.map((source) => ({
          source,
          label: sourceLabels[source],
          status: "ok",
          count: source === "technopark" ? jobs.length : 0,
          hasMore: false,
        })),
        partial: false,
        cache: {
          hit: false,
          fetchedAt: "2026-09-06T00:00:00.000Z",
          expiresAt: "2026-09-06T00:45:00.000Z",
          stored: false,
        },
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Target role").fill("react developer");
  await page
    .getByLabel("Skills")
    .fill("React, TypeScript, REST API, Playwright");
  await expect(page.getByText("Role suggestions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Frontend Engineer" })).toBeVisible();
  await page.getByLabel("Kochi").check();
  await page.getByLabel(sourceLabels.indeed).uncheck();
  await page
    .getByRole("button", { name: "Select all companies", exact: true })
    .click();
  await expect(page.getByLabel(sourceLabels.indeed)).toBeChecked();
  await page.getByRole("button", { name: "Find matches", exact: true }).click();
  await expect(page.locator("article").first()).toBeVisible({
    timeout: 45_000,
  });
  expect(await page.locator("article").count()).toBeLessThanOrEqual(8);
  await expect(page.getByText("Why this fits").first()).toBeVisible();
  await expect(page.getByText("Missing: docker").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Apply", exact: true }).first(),
  ).toHaveAttribute("href", /https:\/\/example\.com\/jobs\/1\/apply/);
  await expect(
    page.getByRole("link", { name: "Email", exact: true }).first(),
  ).toHaveAttribute("href", "mailto:jobs1@example.com");
  await page
    .getByRole("button", { name: "Saved", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Application status").selectOption("saved");
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByLabel("Application status").selectOption("all");
  await page.screenshot({
    path: "artifacts/jobs-desktop.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("2 /", { exact: false }).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(page.getByText("1 /", { exact: false }).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Applied", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Application Pipeline" }).click();
  await expect(page.getByText("Example Studio 1")).toBeVisible();
  await expect(page.getByText("React Developer 1")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Application Pipeline" }).click();
  await expect(page.getByText("React Developer 1")).toBeVisible();
  await page
    .getByRole("button", { name: "React Developer 1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Review my CV", exact: true }).click();
  await expect(page).toHaveURL(/\/cv$/);
  await page.getByLabel("Upload CV", { exact: true }).setInputFiles({
    name: "test-cv.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docxFixture(),
  });
  await expect(page.getByRole("img", { name: /CV writing score/ })).toBeVisible(
    { timeout: 30_000 },
  );
  await expect(page.getByRole("meter")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: /Responsible for.*Name the action/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/cv-desktop.png",
    fullPage: true,
    caret: "initial",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/cv-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  expect(errors).toEqual([]);
  await page.unroute("**/api/jobs/search**");
});

test("search skeleton, empty/error states and mobile layout", async ({
  page,
}) => {
  await signUp(page, `states-${Date.now()}@example.test`);
  await mockCareerApis(page);
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Target role")).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByLabel("Indeed India")).toBeEnabled();
  await page.getByLabel("Indeed India").uncheck();
  await page.screenshot({
    path: "artifacts/home-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  await page.route("**/api/jobs/search**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 503,
      json: {
        error: {
          message:
            "Job sources are temporarily unavailable. Please try again shortly.",
        },
      },
    });
  });
  await page.getByLabel("Target role").fill("test developer");
  await page.getByRole("button", { name: "Find matches", exact: true }).click();
  await expect(
    page.getByText("Searching job sources. Please wait."),
  ).toBeAttached();
  await expect(page.locator("main [role=alert]")).toContainText(
    "temporarily unavailable",
  );
  await page.unroute("**/api/jobs/search**");
  await page.route("**/api/jobs/search**", (route) =>
    route.fulfill({
      json: {
        query: "test developer",
        location: "kerala",
        jobs: [],
        total: 0,
        sources: [],
        partial: false,
        cache: { hit: true },
      },
    }),
  );
  await page.getByRole("button", { name: "Retry search", exact: true }).click();
  await expect(page.getByText("No live matches yet.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("search handles unavailable sources without pausing the workspace", async ({
  page,
}) => {
  await signUp(page, `source-outage-${Date.now()}@example.test`);
  await mockCareerApis(page);
  await page.route("**/api/jobs/search**", (route) =>
    route.fulfill({
      json: {
        query: "react developer",
        location: "kochi",
        jobs: [],
        total: 0,
        sources: [
          {
            source: "indeed",
            label: "Indeed India",
            status: "unavailable",
            count: 0,
            hasMore: false,
            code: "UPSTREAM_BLOCKED",
            message:
              "Indeed blocked automated access and no fallback search key is configured.",
          },
        ],
        partial: true,
        cache: {
          hit: false,
          fetchedAt: "2026-09-08T00:00:00.000Z",
          expiresAt: "2026-09-08T00:00:00.000Z",
          stored: false,
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Target role")).toBeEnabled({ timeout: 15_000 });
  await page.getByLabel("Target role").fill("react developer");
  await page.getByLabel("Kochi").check();
  for (const source of sourceIds.filter((source) => source !== "indeed")) {
    await page.getByLabel(sourceLabels[source]).uncheck();
  }
  await page.getByRole("button", { name: "Find matches", exact: true }).click();
  await expect(page.getByText("Search paused.")).toHaveCount(0);
  await expect(page.getByText("No live matches yet.")).toBeVisible();
  await expect(
    page.getByText("Indeed India", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("unavailable")).toBeVisible();
  await page.unroute("**/api/jobs/search**");
});

test("AI fallback retains the instant score", async ({ page }) => {
  await signUp(page, `cv-${Date.now()}@example.test`);
  await page.goto("/cv");
  await expect(
    page.getByRole("button", { name: "Choose file", exact: true }),
  ).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({
    name: "test-cv.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docxFixture(),
  });
  await expect(page.getByRole("meter")).toHaveCount(5, { timeout: 30_000 });
  await page
    .getByLabel("Job description for AI review")
    .fill(
      "Frontend role using React and TypeScript. Build accessible interfaces, integrate APIs and write automated tests. Collaborate with designers and improve web performance.",
    );
  await page.route("**/api/cv/ai-review", (route) =>
    route.fulfill({
      status: 503,
      json: {
        fallback: true,
        error: {
          message:
            "AI suggestions temporarily unavailable — here's your instant score.",
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: "Get AI Deep Review", exact: true })
    .click();
  await expect(page.locator("main [role=alert]")).toContainText(
    "AI suggestions temporarily unavailable",
  );
  await expect(
    page.getByRole("img", { name: /CV writing score/ }),
  ).toBeVisible();
  await page.unroute("**/api/cv/ai-review");
});

test("CV tailoring analyzes fit, compares drafts and keeps the original recoverable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page, `tailor-${Date.now()}@example.test`);
  await page.goto("/cv");
  await expect(
    page.getByRole("button", { name: "Choose file", exact: true }),
  ).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({
    name: "test-cv.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docxFixture(),
  });
  await expect(page.getByRole("meter")).toHaveCount(5, { timeout: 30_000 });
  await page.getByLabel("Target job role").fill("Frontend Engineer");
  await page
    .getByLabel("Job description for AI review")
    .fill(
      "Frontend Engineer role using React, TypeScript, REST APIs, Playwright, accessibility, and performance optimization. GraphQL and CI pipelines are useful but optional.",
    );
  await page.route("**/api/cv/tailor", async (route) => {
    const payload = route.request().postDataJSON() as {
      targetRole: string;
      jobDescription: string;
    };
    expect(payload.targetRole).toBe("Frontend Engineer");
    expect(payload.jobDescription).toContain("React");
    await route.fulfill({
      json: {
        tailored: {
          match_score: 82,
          score_explanation:
            "The CV documents React, TypeScript, REST API, accessibility, Playwright, and performance evidence. GraphQL and CI pipelines are not documented.",
          score_factors: [
            {
              factor: "React and TypeScript interfaces",
              evidence: "strong",
              detail: "The experience section documents React components and a TypeScript dashboard.",
            },
            {
              factor: "GraphQL",
              evidence: "missing",
              detail: "No GraphQL work appears anywhere in the CV.",
            },
          ],
          missing_keywords: ["GraphQL", "CI pipelines"],
          strong_matches: [
            "React",
            "TypeScript",
            "REST APIs",
            "Playwright",
            "Accessibility",
          ],
          weak_areas: ["GraphQL", "CI pipelines"],
          recommendations: [
            "Move accessibility and testing evidence higher in the experience section.",
            "Keep GraphQL as a gap unless the candidate can truthfully add it.",
          ],
          tailored_cv:
            "Alex Example\nalex@example.com | +91 90000 12345 | Kochi, Kerala\n\nProfessional Summary\nFrontend Engineer with React, TypeScript, REST API, accessibility, Playwright, and web performance experience.\n\nExperience\nFrontend Developer - Example Studio | 2022 - 2026\n- Built 12 reusable React components for the customer support dashboard.\n- Reduced the page load time by 35% through image optimization and code splitting.\n- Implemented automated tests covering 40 key customer workflows.",
          changes: [
            {
              section: "Professional Summary",
              original: "React Developer with TypeScript",
              tailored:
                "Frontend Engineer with React, TypeScript, REST API, accessibility, Playwright, and web performance experience.",
              reason:
                "The summary now leads with role-relevant evidence already present in the CV.",
            },
          ],
          safety_notes: [
            "GraphQL and CI pipelines were treated as gaps because they were not documented in the CV.",
          ],
        },
        cached: false,
      },
    });
  });
  await page
    .getByRole("button", { name: "Tailor CV to This Job", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Job Match Score" })).toBeVisible();
  await expect(page.getByText("82%")).toBeVisible();
  // The score has to be explainable, and undocumented requirements have to read
  // as gaps rather than as skills the candidate now claims.
  const factors = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "What the score is based on" }) })
    .last();
  await expect(factors).toContainText("React and TypeScript interfaces");
  await expect(factors).toContainText("missing");
  const gaps = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Missing / Weak Areas" }) })
    .last();
  await expect(gaps.getByText("GraphQL", { exact: true }).first()).toBeVisible();
  await expect(gaps).toContainText("CI pipelines");
  await expect(page.getByRole("heading", { name: "Original CV" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tailored CV" })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Edit tailored CV").fill("Edited tailored CV draft");
  await page.getByRole("button", { name: "Apply Changes", exact: true }).click();
  await expect(
    page.locator("pre", { hasText: "Edited tailored CV draft" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByText("Responsible for maintaining internal web applications"),
  ).not.toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  await page.unroute("**/api/cv/tailor");
});

test("shared device logout clears state and isolates user data", async ({
  page,
}) => {
  await signUp(page, `owner-a-${Date.now()}@example.test`);
  await page.evaluate(() => {
    sessionStorage.setItem("orvio:selected-job", "private-a");
    sessionStorage.setItem("orvio:resume-profile", "resume-a");
    sessionStorage.setItem("job-hunter:selected-job", "legacy-private-a");
    sessionStorage.setItem("job-hunter:resume-profile", "legacy-resume-a");
  });
  const tokenA = await csrf(page);
  const cookiesA = await cookieHeader(page);
  const cvResponse = await page.request.post("/api/cv/analyze", {
    headers: { cookie: cookiesA, "x-csrf-token": tokenA },
    multipart: {
      file: {
        name: "owner-a.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: docxFixture(),
      },
    },
  });
  expect(cvResponse.ok()).toBeTruthy();
  const cvId = (await cvResponse.json()).id as string;
  await page.request.patch("/api/applications", {
    headers: {
      cookie: cookiesA,
      "content-type": "application/json",
      "x-csrf-token": tokenA,
    },
    data: { job: jobFixture(99), status: "saved", notes: "user a only" },
  });
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/login");
  expect(
    await page.evaluate(
      () =>
        !sessionStorage.getItem("orvio:selected-job") &&
        !sessionStorage.getItem("orvio:resume-profile") &&
        !sessionStorage.getItem("job-hunter:selected-job") &&
        !sessionStorage.getItem("job-hunter:resume-profile"),
    ),
  ).toBeTruthy();
  await signUp(page, `owner-b-${Date.now()}@example.test`);
  const applications = await page.request.get("/api/applications", {
    headers: { cookie: await cookieHeader(page) },
  });
  expect((await applications.json()).applications).toEqual([]);
  const review = await page.request.post("/api/cv/ai-review", {
    headers: {
      cookie: await cookieHeader(page),
      "content-type": "application/json",
      "x-csrf-token": await csrf(page),
    },
    data: {
      cvId,
      jobDescription:
        "Frontend role using React and TypeScript. Build accessible interfaces, integrate APIs and write automated tests. Collaborate with designers and improve web performance.",
    },
  });
  expect(review.status()).toBe(404);
  await page.goto("/");
  await expect(page.getByText("user a only")).toHaveCount(0);
});

test("account actions handle expired sessions without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page, `expired-action-${Date.now()}@example.test`);
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Privacy controls" }),
  ).toBeVisible();
  await page.context().clearCookies();
  await page
    .getByRole("button", { name: "Log out from all devices", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test("account delete asks for confirmation and removes the user", async ({
  page,
}) => {
  const email = `account-delete-${Date.now()}@example.test`;
  await signUp(page, email);
  await page.goto("/account");
  await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Permanently delete this account?",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await page.getByRole("button", { name: "Permanently delete", exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/, { timeout: 15_000 });
});
