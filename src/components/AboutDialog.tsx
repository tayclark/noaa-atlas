// The NOAA disclaimer: not an official product, not for emergency or life-safety decisions, the
// data terms and the credit. A wide screen shows it in full in the footer; a phone has room for one
// line there, so the full text opens from the header's ⓘ and the footer's About in this dialog (#78).

import { useEffect, useRef } from 'react'
import './AboutDialog.css'

export function Disclaimer() {
  return (
    <p>
      Data from NOAA and partner services. Not an official NOAA product and not endorsed by NOAA. Not for emergency or life-safety
      decisions; use{' '}
      <a href="https://www.weather.gov" target="_blank" rel="noreferrer">
        weather.gov
      </a>
      .{' '}
      <a href="https://github.com/tayclark/noaa-atlas#data-terms-and-attribution" target="_blank" rel="noreferrer">
        Data terms
      </a>
      . Made with{' '}
      <span role="img" aria-label="love">
        ❤️
      </span>{' '}
      in Ocean Springs.
    </p>
  )
}

interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // A native modal dialog: focus is trapped, Escape closes it, and the page behind is inert. jsdom
  // (the unit-test environment) has no showModal or close, so it falls back to the open attribute.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="about-dialog"
      aria-labelledby="about-dialog-title"
      onClose={onClose}
      // A click on the backdrop lands on the dialog itself, which has no padding of its own.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="about-dialog-body">
        <h2 id="about-dialog-title">About NOAA Atlas</h2>
        <Disclaimer />
        <button type="button" className="about-dialog-close" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  )
}
