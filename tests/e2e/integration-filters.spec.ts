import { test, expect } from "@playwright/test";

test("blog filters reset after Clear, tag navigation, and browser history", async ({
  page,
}) => {
  await page.goto("http://localhost:3101/blog?q=room&tag=journal&order=desc");
  const search = page.getByLabel("Search articles");
  const tag = page.getByLabel("Find a tag");
  const order = page.getByLabel("Date order");
  await search.fill("unsent edits");
  await tag.fill("unsent tag");
  await order.selectOption("asc");
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3101/blog");
  await expect(search).toHaveValue("");
  await expect(tag).toHaveValue("");
  await expect(order).toHaveValue("desc");
  // Clear must also reset unsent edits when the URL is already /blog.
  await search.fill("another unsent edit");
  await order.selectOption("asc");
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(order).toHaveValue("desc");
  await search.fill("unsent before tag navigation");
  await page.getByRole("link", { name: "journal", exact: true }).click();
  await expect(page).toHaveURL(/\?tag=journal$/);
  await expect(search).toHaveValue("");
  await expect(tag).toHaveValue("journal");
  await order.selectOption("asc");
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3101/blog");
  await page.goBack();
  await expect(page).toHaveURL(/\?tag=journal$/);
  await expect(search).toHaveValue("");
  await expect(tag).toHaveValue("journal");
  await expect(order).toHaveValue("desc");
  await expect(search).toHaveAttribute("maxlength", "200");
  await expect(tag).toHaveAttribute("maxlength", "60");
});

test("invalid direct blog URLs show recoverable validation instead of a server error", async ({
  page,
  request,
}) => {
  const cases = [
    [
      new URLSearchParams({ q: "a".repeat(201) }),
      "Search must be 200 characters or fewer.",
    ],
    [
      new URLSearchParams({ tag: "a".repeat(61) }),
      "Tag must be 60 characters or fewer.",
    ],
    [
      new URLSearchParams({ page: "100001" }),
      "Page must be a whole number from 1 to 100000.",
    ],
    [
      new URLSearchParams({ page: "1.5" }),
      "Page must be a whole number from 1 to 100000.",
    ],
    [
      new URLSearchParams({ order: "invalid" }),
      "Choose ascending or descending date order.",
    ],
    [
      new URLSearchParams([
        ["q", "one"],
        ["q", "two"],
      ]),
      "Use only one q parameter.",
    ],
  ] as const;
  for (const [params, message] of cases) {
    const url = `http://localhost:3101/blog?${params}`;
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(message);
    await page.goto(url);
    await expect(page.locator("main").getByRole("alert")).toContainText(
      message,
    );
    await expect(page.getByText("No stories match your filters.")).toHaveCount(
      0,
    );
    await page.getByRole("link", { name: "Clear", exact: true }).click();
    await expect(page).toHaveURL("http://localhost:3101/blog");
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  }
  await page.goto("http://localhost:3101/blog?page=100001");
  await page.getByLabel("Search articles").fill("room");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page).toHaveURL(/q=room/);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: "A little room for big ideas",
      exact: true,
    }),
  ).toBeVisible();
});
