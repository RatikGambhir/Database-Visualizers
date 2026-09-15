import { expect, test } from "@playwright/test"

test.describe("database workspace", () => {
  test("loads the lazy diagram route and shows schema relationships", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/workspace\/sample-commerce\/diagram/)
    await expect(page.getByText("customers", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("orders", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("order_items", { exact: true }).first()).toBeVisible()
  })

  test("rearranges tables and opens rows from the schema map", async ({ page }) => {
    await page.goto("/")
    const ordersNode = page.locator('.react-flow__node[data-id="public.orders"]')
    await ordersNode.click()
    await expect(page.getByRole("button", { name: /Browse rows/i })).toBeVisible()

    const before = await ordersNode.getAttribute("style")
    const box = await ordersNode.boundingBox()
    if (!box) throw new Error("Orders node was not laid out")
    await page.mouse.move(box.x + 80, box.y + 22)
    await page.mouse.down()
    await page.mouse.move(box.x + 140, box.y + 72, { steps: 5 })
    await page.mouse.up()
    await expect.poll(() => ordersNode.getAttribute("style")).not.toBe(before)

    await page.getByRole("button", { name: /Browse rows/i }).click()
    await expect(page).toHaveURL(/\/data$/)
    await expect(page.getByText("Avery Chen")).toBeVisible()
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
    await expect(page.getByRole("tab", { name: /SQLite/ })).toBeVisible()
    await page.getByRole("tab", { name: /Other database/ }).click()
    await expect(page.getByRole("group", { name: "Server location" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Local/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Remote/ })).toBeVisible()
    await expect(page.getByLabel("Connection URL")).toBeVisible()
    await expect(page.getByRole("button", { name: /Import a SQL schema file/ })).toBeVisible()
    await page.getByRole("button", { name: /Remote/ }).click()
    await page.getByLabel("Connection name").fill("Remote Store")
    await page.getByLabel("Connection URL").fill("mysql://user:secret@db.example.com/store")
    await page.getByRole("button", { name: /^Connect$/ }).click()
    await expect(page.getByRole("dialog", { name: "Connect a database" })).not.toBeVisible()
    await expect(page.getByText("MYSQL", { exact: true })).toBeVisible()
  })
})
