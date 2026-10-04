// The shape every try-it loader returns (#240, #241): small tables the detail panel renders in place
// of the static response excerpt.

export interface TryItTable {
  caption: string
  columns: string[]
  rows: string[][]
}
