export const restoreFocus = (element: Element | null, preventScroll = true) => {
  if (element instanceof HTMLElement) element.focus({ preventScroll })
}
