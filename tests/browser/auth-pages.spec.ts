import { expect, test, type Page } from "@playwright/test";

const initialPassword = "StrongPass123!";

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(initialPassword);
  await page.getByRole("button", { name: "Create an Account" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

test("design preview page loads, controls respond and stays responsive", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/design-preview");
  await expect(page.getByAltText(/LazyHire/).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Good design gets out of the way." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Explore components" }).click();
  await expect(page.getByRole("heading", { name: "Buttons" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "Primary action selected",
  );
  await page.getByRole("button", { name: "Save example" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(page.getByText("Everything in its place.")).toBeVisible({
    timeout: 4_000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test("email and password signup can log out and sign back in", async ({
  page,
}) => {
  const email = `login-browser-${Date.now()}@example.test`;
  await signUp(page, email);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(initialPassword);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
