import { Button, Text } from "@medusajs/ui"

export const errorMessage = (error: unknown): string => {
  const response = (error ?? {}) as { status?: number; message?: string }
  if (response.status === 409)
    return "This item changed while you were editing. Your edits are preserved. Reload the latest version before trying again."
  if (response.status === 403)
    return "You do not have permission for this operation."
  return response.message || "Something went wrong. Please try again."
}

export const Feedback = ({
  title,
  children,
  retry,
  error = false,
}: {
  title: string
  children?: React.ReactNode
  retry?: () => void
  error?: boolean
}) => (
  <div
    className="flex flex-col items-center gap-3 px-6 py-10 text-center"
    role={error ? "alert" : "status"}
  >
    <Text weight="plus">{title}</Text>
    {children && (
      <Text size="small" className="max-w-md text-ui-fg-subtle">
        {children}
      </Text>
    )}
    {retry && (
      <Button size="small" variant="secondary" onClick={retry}>
        Try again
      </Button>
    )}
  </div>
)
