import { expect, test } from "@playwright/test";

const password = "StrongPass123!";

async function signUp(page: import("@playwright/test").Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create an Account" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

test("Career OS dashboard smoke loads and stays responsive", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page, `career-os-${Date.now()}@example.test`);
  await page.goto("/career-os");
  await expect(page.getByRole("heading", { name: "LazyHire turns your career evidence into a focused plan." })).toBeVisible();
  await expect(page.getByText("Career Profile onboarding", { exact: true })).toBeVisible();
  await expect(page.getByText("Career Readiness", { exact: true })).toBeVisible();
  await expect(page.getByText("Career Roadmap", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pipeline and next actions" })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("AI Career Assistant", { exact: true })).toBeVisible();
  await expect(page.getByText("0%", { exact: true })).toBeVisible();
  await expect(page.getByText("Unavailable until setup", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "LazyHire turns your career evidence into a focused plan." })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
