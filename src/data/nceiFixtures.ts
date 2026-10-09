// Real NCEI response shapes (checked 2026-10-09) for unit and e2e tests (#242).

const ATLANTA = 'ATLANTA HARTSFIELD JACKSON INTERNATIONAL AIRPORT, GA US'

/** ADS daily-summaries for USW00013874 with units=metric&includeStationName=true, trimmed to three days. */
export function makeDailySummaries() {
  return [
    { DATE: '2026-10-02', STATION: 'USW00013874', TMAX: '28.9', TMIN: '21.1', PRCP: '0.0', NAME: ATLANTA },
    { DATE: '2026-10-03', STATION: 'USW00013874', TMAX: '30.0', TMIN: '21.1', PRCP: '5.1', NAME: ATLANTA },
    { DATE: '2026-10-04', STATION: 'USW00013874', TMAX: '25.6', TMIN: '21.1', PRCP: '9.1', NAME: ATLANTA },
  ]
}

/** ADS's answer to a bad request (HTTP 400). */
export function makeAccessDataError() {
  return { errorCode: 400, errorMessage: 'Bad Request', errors: [{ field: 'dataset', message: 'Unsupported dataset.', value: 'bogus' }] }
}

const FILE = (day: string, posted: string, size: string) =>
  `<tr><td><a href="sci_xrsf-l2-avg1m_g19_d202610${day}_v2-2-1.nc">sci_xrsf-l2-avg1m_g19_d202610${day}_v2-2-1.nc</a></td><td align="right">${posted}  </td><td align="right">${size}</td></tr>`

/** The GOES-19 XRS 2026/10 directory listing, trimmed to its first three files (or none). */
export function makeGoesListingHtml({ empty = false } = {}) {
  const dir = '/platforms/solar-space-observing-satellites/goes/goes19/l2/data/xrsf-l2-avg1m_science/2026/10'
  const files = empty ? [] : [FILE('01', '2026-10-08 04:31', '287K'), FILE('02', '2026-10-09 04:30', '289K'), FILE('03', '2026-10-09 04:33', '286K')]
  return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">
<html>
 <head>
  <title>Index of ${dir}</title>
 </head>
 <body>
  <table>
   <tr><th><a href="?C=N;O=D">Name</a></th><th><a href="?C=M;O=A">Last modified</a></th><th><a href="?C=S;O=A">Size</a></th></tr>
   <tr><th colspan="3"><hr></th></tr>
<tr><td><a href="${dir.replace(/10$/, '')}">Parent Directory</a></td><td>&nbsp;</td><td align="right">  - </td></tr>
${files.join('\n')}
   <tr><th colspan="3"><hr></th></tr>
</table>
</body></html>`
}
