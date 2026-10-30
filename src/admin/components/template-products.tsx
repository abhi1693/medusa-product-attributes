import {
  Badge,
  Button,
  Checkbox,
  Container,
  Heading,
  Table,
  Text,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router-dom"
import { attributesApi, attributesKeys } from "../lib/api"
import { errorMessage, Feedback } from "./feedback"

export const TemplateProducts = ({ templateId }: { templateId: string }) => {
  const [offset, setOffset] = useState(0)
  const [outdated, setOutdated] = useState(false)
  const query = useQuery({
    queryKey: [
      ...attributesKeys.template(templateId),
      "products",
      { offset, outdated },
    ],
    queryFn: () =>
      attributesApi.templateProducts(templateId, {
        offset,
        limit: 20,
        outdated,
      }),
  })
  const denied =
    query.isError && (query.error as { status?: number }).status === 403
  return (
    <Container
      role="region"
      aria-label="Assigned products"
      className="divide-y p-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">Assigned products</Heading>
          <Text size="small" className="mt-1 max-w-xl text-ui-fg-subtle">
            Review products using this template. Each product keeps its assigned
            version until you explicitly adopt another version.
          </Text>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={outdated}
            onCheckedChange={(checked) => {
              setOutdated(checked === true)
              setOffset(0)
            }}
          />
          Earlier versions only
        </label>
      </div>
      {query.isPending ? (
        <Feedback title="Loading assigned products…" />
      ) : query.isError ? (
        <Feedback
          title={
            denied
              ? "Product access required"
              : "Assigned products could not be loaded"
          }
          error
          retry={() => {
            void query.refetch()
          }}
        >
          {denied
            ? "You can view this template. Access to assigned products is required to review its impact."
            : errorMessage(query.error)}
        </Feedback>
      ) : query.data.assignments.length === 0 ? (
        <Feedback
          title={
            query.data.count > 0
              ? "No accessible products on this page"
              : outdated
                ? "No assignments on earlier versions"
                : "No assigned products"
          }
        >
          {query.data.count > 0
            ? "These assignments refer to products that are unavailable to your account. Try another page."
            : outdated
              ? "No assigned products are using an earlier version."
              : "Products appear here after this template is assigned to them."}
        </Feedback>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Product</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Assigned version</Table.HeaderCell>
                <Table.HeaderCell>Current version</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {query.data.assignments.map(({ product, template_version }) => (
                <Table.Row key={product.id}>
                  <Table.Cell>
                    <Link
                      to={`/products/${encodeURIComponent(product.id)}`}
                      className="text-ui-fg-base hover:underline"
                    >
                      <Text weight="plus">{product.title}</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {product.id}
                      </Text>
                    </Link>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      size="xsmall"
                      color={product.status === "published" ? "green" : "grey"}
                    >
                      {product.status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Text size="small">Version {template_version}</Text>
                      {template_version < query.data!.current_version && (
                        <Badge size="xsmall" color="orange">
                          Update available
                        </Badge>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>Version {query.data!.current_version}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
      {query.data && !query.isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <Text size="small" className="text-ui-fg-subtle">
              {query.data.count} assignments
            </Text>
            <Text size="xsmall" className="mt-1 text-ui-fg-muted">
              Totals may include products that are unavailable to your account.
            </Text>
          </div>
          <div className="flex gap-2">
            <Button
              size="small"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="secondary"
              disabled={offset + 20 >= query.data.count}
              onClick={() => setOffset(offset + 20)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Container>
  )
}
