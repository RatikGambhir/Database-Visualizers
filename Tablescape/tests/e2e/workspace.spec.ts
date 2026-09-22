import { expect, test } from "@playwright/test"

test.describe("database workspace", () => {
  test("starts in an honest empty state without bundled records", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "See the structure before you touch the data." })).toBeVisible()
    await expect(page.getByText("No connections", { exact: true })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Diagram" })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Search" })).toBeDisabled()
    await expect(page.locator(".react-flow")).toHaveCount(0)
  })

  test("exposes native connection methods without faking a browser connection", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Connect database" }).click()
    const dialog = page.getByRole("dialog", { name: "Connect a database" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("status")).toContainText("Browser preview")
    await dialog.getByRole("tab", { name: /Other database/ }).click()
    await expect(dialog.getByRole("group", { name: "Server location" })).toBeVisible()
    await expect(dialog.getByLabel("Connection URL")).toBeVisible()
    await expect(dialog.getByRole("button", { name: /Import a SQL schema file/ })).toBeVisible()
    await dialog.getByLabel("Connection name").fill("Remote Store")
    await dialog.getByLabel("Connection URL").fill("mysql://user:secret@db.example.com/store")
    await dialog.getByRole("button", { name: /^Connect$/ }).click()
    await expect(dialog).toBeVisible()
    await expect(page.getByText(/requires the Tablescape desktop app/)).toBeVisible()
    await expect(page.getByText("No connections", { exact: true })).toBeVisible()
  })

  test("documents keyboard workflows", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Help" }).click()
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("Search schema")).toBeVisible()
    await expect(dialog.getByText("Run current query")).toBeVisible()
  })

  test("recomposes onboarding and connection controls for a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "See the structure before you touch the data." })).toBeVisible()
    await expect(page.getByRole("button", { name: "Connect database" })).toBeVisible()
    await expect(page.getByLabel("Schema diagram preview")).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

    await page.getByRole("button", { name: "Connect database" }).click()
    const dialog = page.getByRole("dialog", { name: "Connect a database" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("tab", { name: "SQLite", exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
