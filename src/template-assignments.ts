export type TemplateAssignmentsQuery = {
  offset?: number
  limit?: number
  outdated?: boolean
}

export type TemplateAssignmentsResponse = {
  assignments: Array<{
    product: { id: string; title: string; status: string }
    template_version: number
  }>
  current_version: number
  count: number
  offset: number
  limit: number
}
