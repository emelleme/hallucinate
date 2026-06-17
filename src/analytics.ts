import 'uplot/dist/uPlot.min.css'
import './analytics.css'
import uPlot from 'uplot'

type AnalyticsRange = {
  key: string
  label: string
}

type OnlineAnalyticsPayload = {
  times: number[]
  online: (number | undefined)[]
  currentOnline: number
}

const ranges: AnalyticsRange[] = [
  { key: 'day', label: 'Day' },
  { key: '3days', label: '3 days' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
]

const chart = document.querySelector('#chart') as HTMLElement
const current = document.querySelector('#current') as HTMLElement
const latest = document.querySelector('#latest') as HTMLElement
const readout = document.querySelector('#readout') as HTMLElement
const readoutLabel = document.querySelector('#readout-label') as HTMLElement
const nav = document.querySelector('#time-range-nav') as HTMLElement

// Dynamically render time range buttons
ranges.forEach((rangeItem, index) => {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.dataset.range = rangeItem.key
  btn.setAttribute('aria-selected', String(index === 0))
  btn.textContent = rangeItem.label
  nav.append(btn)
})

const buttons = [...document.querySelectorAll('[data-range]')] as HTMLButtonElement[]
const rangeKeys = ranges.map(rangeItem => rangeItem.key)
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const shortDayFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const shortDateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const shortHourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })
let plot: uPlot | undefined
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

function onlineText(value: number | undefined) {
  return value === undefined ? '-' : numberFormat.format(value)
}

function timeText(seconds: number) {
  return dateFormat.format(new Date(seconds * 1000))
}

function axisText(seconds: number) {
  const date = new Date(seconds * 1000)

  if (range === 'day') {
    return shortDayFormat.format(date)
  }

  return shortDateFormat.format(date) + '\n' + shortHourFormat.format(date)
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

function options(): uPlot.Options {
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
        grid: { stroke: '#223039', width: 1 },
        lineGap: 1.1,
        size: xAxisSize,
        space: xAxisSpace,
        stroke: '#91a5ad',
        values: (_u, values) => values.map(axisText),
      },
      {
        grid: { stroke: '#223039', width: 1 },
        size: 48,
        stroke: '#91a5ad',
        values: (_u, values) => values.map(value => numberFormat.format(value)),
      },
    ],
    series: [
      {},
      {
        label: 'Online',
        points: { show: false },
        stroke: '#3fd6c6',
        width: 2,
      },
    ],
    hooks: {
      setCursor: [
        u => {
          const index = u.cursor.idx

          if (index === null || index === undefined) {
            readoutLabel.textContent = 'Bucket'
            readout.textContent = '-'
            return
          }

          const seconds = u.data[0][index]
          const val = u.data[1][index]

          if (seconds !== undefined) {
            readoutLabel.textContent = timeText(seconds)
          }
          readout.textContent = onlineText(val === null ? undefined : val)
        },
      ],
    },
  }
}

function selectRange(next: string) {
  range = next
  buttons.forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.range === range))
  })
  history.replaceState(null, '', '/analytics?range=' + encodeURIComponent(range))
}

async function load(next: string) {
  selectRange(next)
  const response = await fetch('/api/analytics/online?range=' + encodeURIComponent(range), { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('Analytics request failed ' + response.status)
  }

  const payload: OnlineAnalyticsPayload = await response.json()
  const data: uPlot.AlignedData = [payload.times, payload.online]

  current.textContent = onlineText(payload.currentOnline)
  latest.textContent = onlineText(payload.online.at(-1))
  readoutLabel.textContent = 'Bucket'
  readout.textContent = payload.times.length === 0 ? 'No data' : timeText(payload.times.at(-1)!)

  if (plot) {
    plot.setData(data)
    plot.setSize(size())
    return
  }

  plot = new uPlot(options(), data, chart)
}

buttons.forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.range) {
      load(button.dataset.range).catch(error => {
        console.error(error)
      })
    }
  })
})

new ResizeObserver(() => {
  plot?.setSize(size())
}).observe(chart)

load(range).catch(error => {
  console.error(error)
  throw error
})
