import { datasetsForService } from '../../data/nceiDatasets'
import { datasetLink, formatDatasetFrequency, formatDatasetRange } from './nodeDetailFormat'

export function NodeDatasetsSection({ serviceId }: { serviceId: string }) {
  const datasets = datasetsForService(serviceId)
  if (datasets.length === 0) return null

  return (
    <section className="node-datasets" aria-label="Datasets">
      <details>
        <summary>Datasets ({datasets.length})</summary>
        <ul>
          {datasets.map((d) => {
            const link = datasetLink(d.doi)
            const range = formatDatasetRange(d.startDate, d.endDate)
            const frequency = formatDatasetFrequency(d.frequency)
            const meta = [range, frequency, d.formats.join(', ')].filter(Boolean)
            return (
              <li key={d.id}>
                <span className="node-datasets-name">{d.name}</span>
                {meta.length > 0 && <span className="node-datasets-meta">{meta.join(' · ')}</span>}
                {link && (
                  <a href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      </details>
    </section>
  )
}
