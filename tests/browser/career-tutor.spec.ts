import { expect, test, type Page } from "@playwright/test";
import { docxFixture } from "../fixtures";

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`tutor-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("StrongPass123!");
  await page.getByRole("button", {name: "Create an Account"}).click();
  await expect(page).toHaveURL(/\/$/, {timeout: 15_000});
  await page.goto("/career-os");
}

test("AI Career Assistant has accessible session history, resource cards, feedback and mobile layout", async ({page}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await signUp(page);
  await page.getByRole("button", {name: "Open AI Career Assistant"}).click();
  const dialog = page.getByRole("dialog", {name: "AI Career Assistant"});
  await expect(dialog).toBeVisible();
  const suggestion = dialog.getByRole("button", {name: "How can I improve my resume?", exact: true});
  await expect(suggestion).toBeEnabled({timeout: 15_000});
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "assistant-cv.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docxFixture(),
  });
  await expect(dialog.getByText(/assistant-cv\.docx is now in your private career profile/)).toBeVisible({timeout: 30_000});
  await page.screenshot({path: "artifacts/career-tutor/desktop-welcome.png"});
  await suggestion.click();
  await expect(dialog.getByText("Career guide", {exact: true})).toBeVisible({timeout: 30_000});
  await expect(dialog.getByRole("link", {name: /Harvard guide/})).toBeVisible({timeout: 15_000});
  await dialog.getByRole("button", {name: "Helpful", exact: true}).click();
  await expect(dialog.getByRole("button", {name: "Helpful", exact: true})).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", {name: "Open AI Career Assistant"})).toBeFocused();
  await page.reload();
  await page.getByRole("button", {name: "Open AI Career Assistant"}).click();
  await expect(dialog.getByText("Career guide", {exact: true})).toBeVisible({timeout: 15_000});
  await expect(dialog.getByRole("button", {name: "Helpful", exact: true})).toHaveAttribute("aria-pressed", "true", {timeout: 15_000});
  await page.setViewportSize({width: 390, height: 844});
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390); expect(box!.height).toBeLessThanOrEqual(844);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  await page.screenshot({path: "artifacts/career-tutor/mobile-conversation.png"});
  await dialog.getByRole("button", {name: "Chat settings"}).click();
  await expect(dialog.getByRole("checkbox", {name: /Use my career profile/})).not.toBeChecked();
  await dialog.getByRole("button", {name: "Chat settings"}).click();
  await dialog.getByRole("button", {name: "New chat"}).click();
  await expect(suggestion).toBeEnabled();
  await expect(dialog.getByText("Career guide", {exact: true})).toHaveCount(0);
  expect(errors).toEqual([]);
  await dialog.getByRole("button", {name: "Close career tutor"}).click();
  const session = await (await page.request.get("/api/auth/session")).json();
  await page.request.delete("/api/account/delete", {headers: {"x-csrf-token": session.csrfToken}});
});

test("chat API requires authentication and CSRF, and rejects oversized questions", async ({page, request}) => {
  expect((await request.post("/api/career-tutor/conversations")).status()).toBe(401);
  await signUp(page);
  expect((await page.request.post("/api/career-tutor/conversations")).status()).toBe(403);
  const session = await (await page.request.get("/api/auth/session")).json();
  const headers = {"x-csrf-token": session.csrfToken};
  const chat = await (await page.request.post("/api/career-tutor/conversations", {headers})).json();
  const result = await page.request.post("/api/career-tutor/messages", {headers, data: {question: "x".repeat(2001), conversationId: chat.conversationId, requestId: "f951f0b4-6846-430d-ae17-a7a8f1ffb9fb"}});
  expect(result.status()).toBe(400);
  await page.request.delete("/api/account/delete", {headers});
});

test("answers show grouped resources with verified YouTube cards, and career context never leaks between questions", async ({page}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await signUp(page);
  await page.getByRole("button", {name: "Open AI Career Assistant"}).click();
  const dialog = page.getByRole("dialog", {name: "AI Career Assistant"});
  const input = dialog.getByLabel("Your career question");
  await expect(input).toBeEnabled({timeout: 15_000});

  // 1. A data science roadmap: data-science videos and official resources.
  await input.fill("Give me a Data Scientist roadmap.");
  await input.press("Enter");
  const first = dialog.locator("article.career-tutor-turn").nth(0);
  await expect(first.getByText("Career guide", {exact: true})).toBeVisible({timeout: 45_000});
  await expect(first.getByRole("region", {name: "Video resources"})).toBeVisible({timeout: 15_000});
  const firstVideos = first.locator(".career-tutor-video-card");
  expect(await firstVideos.count()).toBeGreaterThan(0);
  await expect(firstVideos.first().getByRole("link", {name: /^Watch .* on YouTube$/})).toHaveAttribute("href", /youtube\.com\/watch\?v=/);
  await expect(firstVideos.first().getByRole("link", {name: "Watch video"})).toBeVisible();
  await expect(firstVideos.first().locator("strong")).not.toBeEmpty();
  await expect(firstVideos.first().locator("small")).not.toBeEmpty();
  const firstTitles = (await firstVideos.locator("strong").allTextContents()).join(" | ");
  expect(firstTitles).toMatch(/data|statistic/i);

  // 2. Immediately ask about accounting: the answer and its videos are about accounting.
  await input.fill("How do I become an Accountant?");
  await input.press("Enter");
  const second = dialog.locator("article.career-tutor-turn").nth(1);
  await expect(second.getByText("Career guide", {exact: true})).toBeVisible({timeout: 45_000});
  await expect(second.locator(".career-tutor-copy")).toContainText(/bookkeeping|accounting equation/i, {timeout: 15_000});
  await expect(second.locator(".career-tutor-copy")).not.toContainText(/data scien|pandas/i);
  await expect(second.getByRole("region", {name: "Official resources"}).getByRole("link", {name: /Chartered Accountants of India/})).toBeVisible({timeout: 20_000});
  const secondTitles = (await second.locator(".career-tutor-video-card strong").allTextContents()).join(" | ");
  expect(secondTitles).toMatch(/account/i);
  expect(secondTitles).not.toMatch(/data scien/i);
  const kinds = await second.locator(".career-tutor-kind").allTextContents();
  expect(kinds.length).toBeGreaterThan(0);

  // 3. A comparison question is answered from the authored comparison entry.
  await input.fill("Should I learn Python or Java for backend development?");
  await input.press("Enter");
  const third = dialog.locator("article.career-tutor-turn").nth(2);
  await expect(third.getByText("Career guide", {exact: true})).toBeVisible({timeout: 45_000});
  await expect(third.locator(".career-tutor-copy")).toContainText(/Spring Boot/, {timeout: 15_000});
  await expect(third.getByRole("region", {name: "Official resources"})).toBeVisible({timeout: 20_000});

  // Resource cards never dump raw URLs into the answer text.
  for (const turn of [first, second, third]) await expect(turn.locator(".career-tutor-copy")).not.toContainText(/https?:\/\//);
  await page.screenshot({path: "artifacts/career-tutor/resource-cards.png", fullPage: false});
  expect(errors).toEqual([]);
  const session = await (await page.request.get("/api/auth/session")).json();
  await page.request.delete("/api/account/delete", {headers: {"x-csrf-token": session.csrfToken}});
});
