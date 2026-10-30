import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, expect, test, vi } from "vitest"
import type { TemplateAssignmentsResponse } from "../../src/template-assignments"

const api = vi.hoisted(() => ({ templateProducts: vi.fn() }))
vi.mock("../../src/admin/lib/api", () => ({
  attributesApi: api,
  attributesKeys: { template: (id: string) => ["attributes", "templates", id] },
}))
import { TemplateProducts } from "../../src/admin/components/template-products"

const response: TemplateAssignmentsResponse = {
  assignments: [
    {
      product: { id: "product/one", title: "Core switch", status: "published" },
      template_version: 1,
    },
    {
      product: { id: "product_two", title: "Access switch", status: "draft" },
      template_version: 2,
    },
  ],
  current_version: 2,
  count: 41,
  offset: 0,
  limit: 20,
}
const mount = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          basename="/app"
          initialEntries={["/app/settings/product-attributes/template"]}
        >
          <TemplateProducts templateId="template" />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}
beforeEach(() => {
  api.templateProducts.mockReset().mockResolvedValue(response)
})

test("impact lists native products with assigned/current versions and supports paging and earlier-version filtering", async () => {
  const user = userEvent.setup()
  mount()
  const region = screen.getByRole("region", { name: "Assigned products" })
  expect(
    await within(region).findByRole("link", { name: "Core switch product/one" })
  ).toHaveAttribute("href", "/app/products/product%2Fone")
  expect(within(region).getByText("published")).toBeInTheDocument()
  expect(within(region).getByText("draft")).toBeInTheDocument()
  expect(within(region).getAllByText("Update available")).toHaveLength(1)
  expect(within(region).getByText("Version 1")).toBeInTheDocument()
  expect(within(region).getByText("Assignments: 41")).toBeInTheDocument()
  expect(
    within(region).getByRole("button", { name: "Previous" })
  ).toBeDisabled()
  await user.click(within(region).getByRole("button", { name: "Next" }))
  await waitFor(() =>
    expect(api.templateProducts).toHaveBeenLastCalledWith("template", {
      offset: 20,
      limit: 20,
      outdated: false,
    })
  )
  await user.click(within(region).getByRole("button", { name: "Previous" }))
  await waitFor(() =>
    expect(api.templateProducts).toHaveBeenLastCalledWith("template", {
      offset: 0,
      limit: 20,
      outdated: false,
    })
  )
  await user.click(within(region).getByRole("button", { name: "Next" }))
  await user.click(within(region).getByLabelText("Earlier versions only"))
  await waitFor(() =>
    expect(api.templateProducts).toHaveBeenLastCalledWith("template", {
      offset: 0,
      limit: 20,
      outdated: true,
    })
  )
  await user.click(within(region).getByLabelText("Earlier versions only"))
  await waitFor(() =>
    expect(
      within(region).getByLabelText("Earlier versions only")
    ).not.toBeChecked()
  )
})

test("impact loading and product access denial recover within their own card", async () => {
  api.templateProducts.mockImplementationOnce(() => new Promise(() => {}))
  const first = mount()
  expect(screen.getByText("Loading assigned products…")).toBeInTheDocument()
  first.unmount()
  api.templateProducts.mockRejectedValueOnce({ status: 403 })
  mount()
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Product access required"
  )
  expect(
    screen.getByText(/Access to assigned products is required/)
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(
    await screen.findByRole("link", { name: "Core switch product/one" })
  ).toBeInTheDocument()
})

test("impact failures retain a local retry and hide potentially stale totals", async () => {
  const { client } = mount()
  expect(await screen.findByText("Assignments: 41")).toBeInTheDocument()
  api.templateProducts.mockRejectedValueOnce(new Error("Network unavailable"))
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ["attributes", "templates", "template", "products"],
    })
  })
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Network unavailable"
  )
  expect(screen.queryByText("Assignments: 41")).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(await screen.findByText("Assignments: 41")).toBeInTheDocument()
})

test("empty and current-version-only results distinguish assignment state", async () => {
  api.templateProducts.mockResolvedValue({
    ...response,
    assignments: [],
    count: 0,
  })
  mount()
  expect(await screen.findByText("No assigned products")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()
  await userEvent.click(screen.getByLabelText("Earlier versions only"))
  expect(
    await screen.findByText("No assignments on earlier versions")
  ).toBeInTheDocument()
  expect(
    screen.getByText("No assigned products are using an earlier version.")
  ).toBeInTheDocument()
})

test("pages omitting deleted or inaccessible products keep assignment counts and pagination", async () => {
  api.templateProducts.mockResolvedValue({ ...response, assignments: [] })
  mount()
  expect(
    await screen.findByText("No accessible products on this page")
  ).toBeInTheDocument()
  expect(screen.getByText("Assignments: 41")).toBeInTheDocument()
  expect(screen.getByText(/Totals may include products/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Next" }))
  await waitFor(() =>
    expect(api.templateProducts).toHaveBeenLastCalledWith("template", {
      offset: 20,
      limit: 20,
      outdated: false,
    })
  )
})

test("a single assignment uses the same neutral total label", async () => {
  api.templateProducts.mockResolvedValue({
    ...response,
    assignments: response.assignments.slice(0, 1),
    count: 1,
  })
  mount()
  expect(await screen.findByText("Assignments: 1")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()
})
