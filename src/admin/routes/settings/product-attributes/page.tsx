import { defineRouteConfig } from "@medusajs/admin-sdk"
import { SquaresPlus } from "@medusajs/icons"
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Heading,
  Input,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router-dom"
import { attributesApi, attributesKeys } from "../../../lib/api"
import { errorMessage, Feedback } from "../../../components/feedback"
import { TemplateEditor } from "../../../components/template-editor"

const ProductAttributesPage = () => {
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const [archived, setArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [...attributesKeys.templates, { search, offset, archived }],
    queryFn: () =>
      attributesApi.templates({
        q: search,
        offset,
        limit: 20,
        include_archived: archived,
      }),
  })
  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">Product attributes</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Reusable specifications for products and variants.
          </Text>
        </div>
        <Button
          size="small"
          onClick={() => setCreating(true)}
          disabled={!query.data?.can_write}
        >
          Create template
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <Input
          aria-label="Search templates"
          placeholder="Search templates"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setOffset(0)
          }}
          className="max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={archived}
            onCheckedChange={(checked) => {
              setArchived(checked === true)
              setOffset(0)
            }}
          />
          Include archived
        </label>
      </div>
      {query.isPending ? (
        <Feedback title="Loading templates…" />
      ) : query.isError ? (
        <Feedback
          title="Templates could not be loaded"
          retry={() => {
            void query.refetch()
          }}
          error
        >
          {errorMessage(query.error)}
        </Feedback>
      ) : query.data.templates.length === 0 ? (
        <Feedback title={search ? "No matching templates" : "No templates yet"}>
          {search
            ? "Try another name or key."
            : "Create a reusable specification template, then assign it to a product."}
        </Feedback>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Version</Table.HeaderCell>
                <Table.HeaderCell>Source</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {query.data.templates.map((template) => (
                <Table.Row key={template.id}>
                  <Table.Cell>
                    <Link
                      to={`${template.id}`}
                      className="text-ui-fg-base hover:underline"
                    >
                      <Text weight="plus">{template.name}</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {template.key}
                      </Text>
                    </Link>
                  </Table.Cell>
                  <Table.Cell>{template.version}</Table.Cell>
                  <Table.Cell>
                    <Badge
                      size="xsmall"
                      color={
                        template.source === "configuration" ? "purple" : "grey"
                      }
                    >
                      {template.source === "configuration"
                        ? "Configuration"
                        : "Admin"}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      size="xsmall"
                      color={template.archived ? "grey" : "green"}
                    >
                      {template.archived ? "Archived" : "Active"}
                    </Badge>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
      {query.data && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {query.data.count} templates
            {!query.data.can_write && " · Read-only access"}
          </Text>
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
      {creating && (
        <TemplateEditor
          onClose={() => setCreating(false)}
          onSave={async (draft) => {
            await attributesApi.createTemplate(draft)
            await queryClient.invalidateQueries({
              queryKey: attributesKeys.templates,
            })
            toast.success("Template created")
          }}
        />
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Product attributes",
  icon: SquaresPlus,
})
export default ProductAttributesPage
