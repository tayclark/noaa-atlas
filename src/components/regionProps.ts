// One pattern for a named region of a panel (#352). A region that scrolls is in the Tab order too,
// so a keyboard can scroll it even when nothing inside it can take focus (axe's
// scrollable-region-focusable rule).

export function regionProps(label: string, { scrolls }: { scrolls: boolean }) {
  return { role: 'region', 'aria-label': label, ...(scrolls ? { tabIndex: 0 } : {}) } as const
}
