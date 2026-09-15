import { expect, test } from "@playwright/test"

test.describe("database workspace", () => {
  test("loads the lazy diagram route and shows schema relationships", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/workspace\/sample-commerce\/diagram/)
    await expect(page.getByText("customers", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("orders", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("order_items", { exact: true }).first()).toBeVisible()
  })

  test("opens table data directly without requiring SQL", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: /orders/i }).first().click()
    await expect(page).toHaveURL(/\/data$/)
    await expect(page.getByText("Avery Chen")).toBeVisible()
    await page.getByPlaceholder("Filter results").fill("Zara")
    await expect(page.getByText("Zara Khan")).toBeVisible()
    await expect(page.getByText("Avery Chen")).not.toBeVisible()
  })

  test("runs a query and records its session history", async ({ page }) => {
    await page.goto("/#/workspace/sample-commerce/query")
    await expect(page.getByLabel("SQL query")).toBeVisible()
    await page.getByRole("button", { name: /^Run/ }).click()
    await expect(page.getByText("Avery Chen")).toBeVisible()
    await page.getByRole("tab", { name: /History/ }).click()
    await expect(page.getByRole("button", { name: /SELECT \* FROM/i })).toBeVisible()
  })

  test("exposes connection methods and SQL import", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Add connection" }).click()
    await expect(page.getByRole("dialog", { name: "Connect a database" })).toBeVisible()
    await expect(page.getByRole("tab", { name: /PostgreSQL/ })).toBeVisible()
    await expect(page.getByRole("tab", { name: /MySQL/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Import a SQL schema file/ })).toBeVisible()
  })
})
