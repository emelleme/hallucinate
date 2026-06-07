type AnalyticsRange = {
  key: string
  label: string
}

export function analyticsHtml(ranges: AnalyticsRange[]) {
  const buttons = ranges.map((range, index) => `
        <button type="button" data-range="${range.key}" aria-selected="${index === 0}">
          ${range.label}
        </button>`).join('')
  const rangeData = JSON.stringify(ranges.map(({ key, label }) => ({ key, label })))

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Club Analytics</title>
    <link rel="stylesheet" href="/analytics/uPlot.min.css">
    <style>
      * {
        box-sizing: border-box;
      }

      html {
        background: #f7f8fb;
        color: #17202a;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        margin: 0;
        min-height: 100dvh;
        width: 100dvw;
      }

      main {
        display: grid;
        gap: 16px;
        grid-template-rows: auto auto minmax(0, 1fr);
        margin: 0 auto;
        min-height: 100dvh;
        padding: 24px;
        width: min(1180px, 100dvw);
      }

      header {
        align-items: end;
        border-bottom: 1px solid #d7dee8;
        display: flex;
        gap: 16px;
        justify-content: space-between;
        padding-bottom: 16px;
      }

      h1 {
        font-size: 28px;
        font-weight: 720;
        letter-spacing: 0;
        line-height: 1.1;
        margin: 0;
      }

      p {
        color: #607084;
        margin: 6px 0 0;
      }

      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }

      button {
        appearance: none;
        background: #ffffff;
        border: 1px solid #bdc7d4;
        border-radius: 6px;
        color: #17202a;
        cursor: pointer;
        font: inherit;
        font-size: 14px;
        line-height: 1;
        min-height: 36px;
        padding: 0 12px;
      }

      button[aria-selected="true"] {
        background: #17202a;
        border-color: #17202a;
        color: #ffffff;
      }

      #metrics {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .metric {
        background: #ffffff;
        border: 1px solid #d7dee8;
        border-radius: 8px;
        min-width: 0;
        padding: 12px;
      }

      .metric span {
        color: #607084;
        display: block;
        font-size: 12px;
        line-height: 1;
        margin-bottom: 8px;
        text-transform: uppercase;
      }

      .metric strong {
        display: block;
        font-size: 24px;
        font-weight: 720;
        letter-spacing: 0;
        line-height: 1;
        min-height: 24px;
      }

      #chart {
        background: #ffffff;
        border: 1px solid #d7dee8;
        border-radius: 8px;
        height: min(680px, calc(100dvh - 218px));
        min-height: 360px;
        min-width: 0;
        overflow: hidden;
        width: 100%;
      }

      #chart .uplot {
        color: #17202a;
        font-family: inherit;
      }

      #chart .u-axis {
        color: #607084;
      }

      #chart .u-cursor-x,
      #chart .u-cursor-y {
        border-color: #d85532;
      }

      @media (max-width: 720px) {
        main {
          padding: 16px;
          width: 100dvw;
        }

        header {
          align-items: stretch;
          flex-direction: column;
        }

        nav {
          justify-content: start;
        }

        #metrics {
          grid-template-columns: 1fr;
        }

        #chart {
          height: calc(100dvh - 348px);
          min-height: 300px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Online Analytics</h1>
          <p>Connected total, idle included</p>
        </div>
        <nav aria-label="Time range">${buttons}
        </nav>
      </header>
      <section id="metrics" aria-live="polite">
        <div class="metric">
          <span>Current</span>
          <strong id="current">0</strong>
        </div>
        <div class="metric">
          <span>Latest average</span>
          <strong id="latest">0</strong>
        </div>
        <div class="metric">
          <span id="readout-label">Bucket</span>
          <strong id="readout">-</strong>
        </div>
      </section>
      <div id="chart"></div>
    </main>
    <script src="/analytics/uPlot.iife.min.js"></script>
    <script>
      const ranges = ${rangeData}
      const chart = document.querySelector('#chart')
      const current = document.querySelector('#current')
      const latest = document.querySelector('#latest')
      const readout = document.querySelector('#readout')
      const readoutLabel = document.querySelector('#readout-label')
      const buttons = [...document.querySelectorAll('[data-range]')]
      const rangeKeys = ranges.map(range => range.key)
      const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
      const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      const shortDayFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
      const shortDateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
      const shortHourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })
      let plot
      let range = new URLSearchParams(location.search).get('range') ?? ranges[0].key

      if (!rangeKeys.includes(range)) {
        throw new Error('Invalid analytics range ' + range)
      }

      function size() {
        const box = chart.getBoundingClientRect()

        return {
          height: Math.max(300, Math.floor(box.height)),
          width: Math.max(320, Math.floor(box.width)),
        }
      }

      function onlineText(value) {
        return value === undefined ? '-' : numberFormat.format(value)
      }

      function timeText(seconds) {
        return dateFormat.format(new Date(seconds * 1000))
      }

      function axisText(seconds) {
        const date = new Date(seconds * 1000)

        if (range === 'day') {
          return shortDayFormat.format(date)
        }

        return shortDateFormat.format(date) + '\\n' + shortHourFormat.format(date)
      }

      function xAxisSize() {
        return range === 'day' ? 42 : 58
      }

      function xAxisSpace() {
        return range === 'day'
          ? 78
          : range === '3days'
          ? 108
          : range === 'week'
          ? 116
          : range === 'month'
          ? 124
          : 132
      }

      function options() {
        return {
          ...size(),
          legend: { show: false },
          padding: [16, 16, 8, 8],
          scales: {
            x: { time: true },
            y: {
              range: (_u, _min, max) => [0, Math.max(1, Math.ceil((max ?? 0) + 1))],
            },
          },
          axes: [
            {
              font: '12px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              gap: 8,
              grid: { stroke: '#e4e9f1', width: 1 },
              lineGap: 1.1,
              size: xAxisSize,
              space: xAxisSpace,
              stroke: '#607084',
              values: (_u, values) => values.map(axisText),
            },
            {
              grid: { stroke: '#e4e9f1', width: 1 },
              size: 48,
              stroke: '#607084',
              values: (_u, values) => values.map(value => numberFormat.format(value)),
            },
          ],
          series: [
            {},
            {
              label: 'Online',
              points: { show: false },
              stroke: '#146c6c',
              width: 2,
            },
          ],
          hooks: {
            setCursor: [
              u => {
                const index = u.cursor.idx

                if (index === null) {
                  readoutLabel.textContent = 'Bucket'
                  readout.textContent = '-'
                  return
                }

                readoutLabel.textContent = timeText(u.data[0][index])
                readout.textContent = onlineText(u.data[1][index])
              },
            ],
          },
        }
      }

      function selectRange(next) {
        range = next
        buttons.forEach(button => {
          button.setAttribute('aria-selected', String(button.dataset.range === range))
        })
        history.replaceState(null, '', '/analytics?range=' + encodeURIComponent(range))
      }

      async function load(next) {
        selectRange(next)
        const response = await fetch('/api/analytics/online?range=' + encodeURIComponent(range), { cache: 'no-store' })

        if (!response.ok) {
          throw new Error('Analytics request failed ' + response.status)
        }

        const payload = await response.json()
        const data = [payload.times, payload.online]

        current.textContent = onlineText(payload.currentOnline)
        latest.textContent = onlineText(payload.online.at(-1))
        readoutLabel.textContent = 'Bucket'
        readout.textContent = payload.times.length === 0 ? 'No data' : timeText(payload.times.at(-1))

        if (plot) {
          plot.setData(data)
          plot.setSize(size())
          return
        }

        plot = new uPlot(options(), data, chart)
      }

      buttons.forEach(button => {
        button.addEventListener('click', () => load(button.dataset.range))
      })

      new ResizeObserver(() => {
        plot?.setSize(size())
      }).observe(chart)

      load(range).catch(error => {
        console.error(error)
        throw error
      })
    </script>
  </body>
</html>`
}
