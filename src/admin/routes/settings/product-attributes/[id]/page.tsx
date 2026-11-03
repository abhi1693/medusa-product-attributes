import { ArrowLeft } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link, useParams, useNavigate } from "react-router-dom"
import { attributesApi, attributesKeys } from "../../../../lib/api"
import { errorMessage, Feedback } from "../../../../components/feedback"
import { TemplateEditor } from "../../../../components/template-editor"
import { TemplateProducts } from "../../../../components/template-products"

const TemplateDetailPage = () => {
  const { id = "" } = useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const prompt = usePrompt()
  const [editing, setEditing] = useState<"edit" | "duplicate">()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const query = useQuery({
    queryKey: attributesKeys.template(id),
    queryFn: () => attributesApi.template(id),
  })
  if (query.isPending)
    return (
      <Container>
        <Feedback title="Loading template…" />
      </Container>
    )
  if (query.isError)
    return (
      <Container>
        <Feedback
          title="Template could not be loaded"
          retry={() => {
            void query.refetch()
          }}
          error
        >
          {errorMessage(query.error)}
        </Feedback>
      </Container>
    )
  const { template, revisions, can_write } = query.data
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: attributesKeys.templates })
  }
  const archive = async () => {
    const confirmed = await prompt({
      title: "Archive template?",
      description:
        "Existing assignments keep their version and values. This template will no longer be available for new assignments.",
      confirmText: "Archive",
      cancelText: "Cancel",
    })
    if (!confirmed) return
    setPending(true)
    setError(undefined)
    try {
      await attributesApi.archiveTemplate(id, template.version)
      await refresh()
      toast.success("Template archived")
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setPending(false)
    }
  }
  const remove = async () => {
    if (
      !(await prompt({
        title: "Delete template?",
        description:
          "Remove this template from assigned products first. Previous specification history is retained.",
        confirmText: "Delete",
        cancelText: "Cancel",
      }))
    )
      return
    setPending(true)
    setError(undefined)
    try {
      await attributesApi.deleteTemplate(id, template.version)
      await refresh()
      toast.success("Template deleted")
      navigate("..", { relative: "path" })
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <Link
        to=".."
        className="flex w-fit items-center gap-2 text-sm text-ui-fg-subtle hover:text-ui-fg-base"
      >
        <ArrowLeft />
        Attribute templates
      </Link>
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div>
            <Heading level="h1">{template.name}</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              {template.key} · Version {template.version}
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="small"
              variant="secondary"
              disabled={!can_write}
              onClick={() => setEditing("duplicate")}
            >
              Duplicate
            </Button>
            <Button
              size="small"
              variant="secondary"
              disabled={
                !can_write ||
                template.source === "configuration" ||
                template.archived ||
                pending
              }
              onClick={() => {
                void archive()
              }}
              isLoading={pending}
            >
              Archive
            </Button>
            <Button
              size="small"
              variant="danger"
              disabled={
                !can_write || template.source === "configuration" || pending
              }
              onClick={() => {
                void remove()
              }}
            >
              Delete
            </Button>
            <Button
              size="small"
              disabled={
                !can_write ||
                template.source === "configuration" ||
                template.archived
              }
              onClick={() => setEditing("edit")}
            >
              Create version
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-6 py-4">
          <div className="flex flex-wrap gap-2">
            <Badge size="xsmall" color={template.archived ? "grey" : "green"}>
              {template.archived ? "Archived" : "Active"}
            </Badge>
            <Badge size="xsmall" color="grey">
              {template.source === "configuration"
                ? "Managed in configuration"
                : "Managed in Admin"}
            </Badge>
          </div>
          {template.description && (
            <Text size="small" className="text-ui-fg-subtle">
              {template.description}
            </Text>
          )}
          {template.source === "configuration" && (
            <Text size="small" className="text-ui-fg-subtle">
              Update this definition in your application configuration, or
              duplicate it to create an editable template.
            </Text>
          )}
          {!can_write && (
            <Text size="small" className="text-ui-fg-subtle">
              You have read-only access.
            </Text>
          )}
          {error && (
            <Text role="alert" size="small" className="text-ui-fg-error">
              {error}
            </Text>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Field</Table.HeaderCell>
                <Table.HeaderCell>Type</Table.HeaderCell>
                <Table.HeaderCell>Applies to</Table.HeaderCell>
                <Table.HeaderCell>Properties</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {template.fields.map((field) => (
                <Table.Row key={`${field.scope}-${field.key}`}>
                  <Table.Cell>
                    <Text weight="plus">{field.label}</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {field.key}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    {field.type.replace(/_/g, " ")}
                    {field.unit && ` · ${field.unit}`}
                  </Table.Cell>
                  <Table.Cell>
                    {field.scope === "product" ? "Product" : "Variant"}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap gap-1">
                      {field.required && <Badge size="xsmall">Required</Badge>}
                      {field.searchable && <Badge size="xsmall">Search</Badge>}
                      {field.filterable && <Badge size="xsmall">Filter</Badge>}
                      {field.comparable && <Badge size="xsmall">Compare</Badge>}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </Container>
      <TemplateProducts templateId={template.id} />
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Version history</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Previous versions remain available to their assigned products.
          </Text>
        </div>
        <div className="flex flex-col divide-y">
          {revisions.map((revision) => (
            <div
              key={revision.version}
              className="flex flex-wrap items-center justify-between gap-2 px-6 py-3"
            >
              <Text size="small">
                Version {revision.version} · Fields: {revision.fields.length}
              </Text>
              {revision.version === template.version && (
                <Badge size="xsmall" color="blue">
                  Current
                </Badge>
              )}
            </div>
          ))}
        </div>
      </Container>
      {editing && (
        <TemplateEditor
          template={template}
          duplicate={editing === "duplicate"}
          onClose={() => setEditing(undefined)}
          onSave={async (draft) => {
            if (editing === "duplicate")
              await attributesApi.createTemplate(draft)
            else await attributesApi.reviseTemplate(id, draft)
            await refresh()
            toast.success(
              editing === "duplicate"
                ? "Template duplicated"
                : "Template version created"
            )
          }}
        />
      )}
    </div>
  )
}

export const handle = { breadcrumb: () => "Template" }
export default TemplateDetailPage
