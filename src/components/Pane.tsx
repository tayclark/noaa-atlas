import './Pane.css'

interface PaneProps {
  title: string
  note: string
}

export function Pane({ title, note }: PaneProps) {
  return (
    <section className="pane" aria-label={title}>
      <h2 className="pane-title">{title}</h2>
      <p className="pane-note">{note}</p>
    </section>
  )
}
