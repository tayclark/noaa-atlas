// A copy-to-clipboard button that confirms the copy (#272). The status span is always mounted so
// screen readers announce its text changes. When the clipboard refuses (permission denied, an
// insecure origin, no `navigator.clipboard` at all) the text is revealed, selected, to copy by hand.

import { useEffect, useRef, useState } from 'react'
import './CopyButton.css'

const COPIED_MS = 2000

type CopyState = 'idle' | 'copied' | 'failed'

const STATUS_TEXT: Record<CopyState, string> = {
  idle: '',
  copied: 'Copied',
  failed: 'Copy failed. Copy it from the box below.',
}

const STATUS_CLASS: Record<CopyState, string> = {
  idle: 'visually-hidden',
  copied: 'copy-button-status',
  failed: 'copy-button-status copy-button-failed',
}

export function CopyButton({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fallbackRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    if (state !== 'failed') return
    fallbackRef.current?.focus()
    fallbackRef.current?.select()
  }, [state])

  const onClick = () => {
    clearTimeout(timerRef.current)
    // Promise.resolve().then turns a missing navigator.clipboard (a sync TypeError) into a rejection.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => {
          setState('copied')
          timerRef.current = setTimeout(() => setState('idle'), COPIED_MS)
        },
        () => setState('failed'),
      )
  }

  return (
    <>
      <button type="button" onClick={onClick}>
        {label}
      </button>
      {/* Idle, it's visually hidden rather than display: none, so it stays out of the flex row's
          gaps but remains a live region in the accessibility tree. */}
      <span role="status" className={STATUS_CLASS[state]}>
        {STATUS_TEXT[state]}
      </span>
      {state === 'failed' && (
        <textarea ref={fallbackRef} className="copy-button-fallback" aria-label={`${label} text`} readOnly value={text} rows={3} />
      )}
    </>
  )
}
