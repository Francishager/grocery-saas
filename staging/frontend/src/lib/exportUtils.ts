import { appNotify } from '@/lib/appFeedback'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency } from './utils'

type ExportColumn = {
  key: string
  label: string
  format?: 'currency' | 'number' | 'date' | 'text'
}

type ExportChart = {
  title: string
  labelKey: string
  rows: any[]
  series: Array<{ key: string; label: string; color: string; format: 'currency' | 'number' }>
}

export type BusinessInfo = {
  name?: string
  address?: string | null
  phone?: string | null
  email?: string | null
  taxId?: string | null
  logo?: string | null
  currency?: string
}

function businessInfoToArray(biz?: BusinessInfo): string[] {
  if (!biz || !biz.name) return []
  const lines: string[] = [biz.name]
  if (biz.address) lines.push(biz.address)
  const contactParts: string[] = []
  if (biz.phone) contactParts.push(`Tel: ${biz.phone}`)
  if (biz.email) contactParts.push(`Email: ${biz.email}`)
  if (contactParts.length) lines.push(contactParts.join(' | '))
  if (biz.taxId) lines.push(`TIN: ${biz.taxId}`)
  return lines
}

function formatExportValue(value: any, format?: string): string {
  if (value === null || value === undefined) return ''
  switch (format) {
    case 'currency': return formatCurrency(Number(value) || 0)
    case 'number': return new Intl.NumberFormat('en-US').format(Number(value) || 0)
    case 'date': {
      if (!value) return ''
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return ''
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = String(d.getFullYear()).slice(-2)
      return `${day}/${month}/${year}`
    }
    default: {
      if (Array.isArray(value)) return value.map(v => formatExportValue(v)).filter(Boolean).join(', ')
      if (typeof value === 'object') {
        const objectValue = value as Record<string, any>
        const preferredKeys = ['name', 'label', 'email', 'description', 'title', 'code', 'reference', 'number', 'type']
        for (const key of preferredKeys) {
          const candidate = objectValue[key]
          if (candidate !== null && candidate !== undefined && candidate !== '') return String(candidate)
        }

        const numericKeys = ['amount', 'total', 'balance', 'value', 'price', 'cost', 'revenue', 'profit', 'quantity', 'count']
        for (const key of numericKeys) {
          const candidate = objectValue[key]
          if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate)
        }

        for (const entry of Object.values(objectValue)) {
          if (entry == null || entry === '') continue
          if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') return String(entry)
          if (typeof entry === 'object') {
            const nestedText = formatExportValue(entry)
            if (nestedText) return nestedText
          }
        }

        return ''
      }
      return String(value)
    }
  }
}

function extractRows(data: any, columns?: ExportColumn[]): { headers: string[]; rows: string[][] } {
  if (!data) return { headers: [], rows: [] }

  // Handle different data shapes
  let rowsArr: any[] = []
  if (Array.isArray(data)) {
    rowsArr = data
  } else if (data.transactions && Array.isArray(data.transactions)) {
    // Handle statement data with transactions array
    rowsArr = data.transactions
  } else if (data.data && Array.isArray(data.data)) {
    rowsArr = data.data
  } else if (data.accounts && Array.isArray(data.accounts)) {
    rowsArr = data.accounts
  } else {
    rowsArr = [data]
  }

  if (rowsArr.length === 0) return { headers: [], rows: [] }

  let headers: string[]
  let rows: string[][]

  if (columns && columns.length > 0) {
    headers = columns.map(c => c.label)
    rows = rowsArr.map(row => columns.map(c => formatExportValue(row[c.key], c.format)))
  } else {
    // Auto-detect columns from first row
    const keys = Object.keys(rowsArr[0]).filter(k => !k.startsWith('_') && k !== 'id' && k !== 'relatedId')
    headers = keys.map(k => k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()))
    rows = rowsArr.map(row => keys.map(k => {
      const val = row[k]
      // Auto-detect format based on key name and value
      let fmt = undefined
      if (k.toLowerCase().includes('date')) fmt = 'date'
      else if (k.toLowerCase().includes('balance') || k.toLowerCase().includes('debit') || k.toLowerCase().includes('credit') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('total') || k.toLowerCase().includes('currency')) fmt = 'currency'
      else if (k.toLowerCase().includes('count') || k.toLowerCase().includes('quantity') || k.toLowerCase().includes('number')) fmt = 'number'
      return formatExportValue(val, fmt)
    }))
  }

  return { headers, rows }
}

export function exportToExcel(
  data: any,
  reportLabel: string,
  columns?: ExportColumn[],
  summary?: Record<string, any>,
  businessInfo?: BusinessInfo,
  charts: ExportChart[] = []
) {
  const { headers, rows } = extractRows(data, columns)
  const wb = XLSX.utils.book_new()

  const sheetData: any[] = []

  // Business header
  const bizLines = businessInfoToArray(businessInfo)
  if (bizLines.length > 0) {
    sheetData.push(...bizLines.map(l => [l]))
    sheetData.push([])
  }

  // Report title
  sheetData.push([reportLabel])
  sheetData.push([])

  // Summary rows if present
  if (summary && typeof summary === 'object') {
    const summaryEntries = Object.entries(summary).filter(([_, v]) => v != null && v !== '')
    for (const [k, v] of summaryEntries) {
      let displayVal = String(v)
      if (typeof v === 'number') {
        // Check if it looks like currency
        if (k.toLowerCase().includes('balance') || k.toLowerCase().includes('total') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('revenue') || k.toLowerCase().includes('payment')) {
          displayVal = formatCurrency(v)
        } else if (!k.toLowerCase().includes('count')) {
          displayVal = new Intl.NumberFormat('en-US').format(v)
        }
      }
      sheetData.push([k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), displayVal])
    }
    sheetData.push([])
  }

  if (headers.length > 0) {
    sheetData.push(headers)
    sheetData.push(...rows)
  } else if (Array.isArray(data)) {
    // Fallback for array data
    sheetData.push(['Data'])
    sheetData.push(...data.map(d => [String(d)]))
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData.length > 0 ? sheetData : [[reportLabel], ['No data available']])
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  if (charts.length) {
    const chartRows: any[][] = []
    charts.forEach(chart => {
      chartRows.push([chart.title])
      chartRows.push([chart.labelKey, ...chart.series.map(metric => metric.label)])
      chart.rows.forEach(row => chartRows.push([row[chart.labelKey], ...chart.series.map(metric => row[metric.key] ?? 0)]))
      chartRows.push([])
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chartRows), 'Chart Data')
  }
  XLSX.writeFile(wb, `${reportLabel.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`)
}

function appendPerformanceCharts(doc: jsPDF, charts: ExportChart[]) {
  if (!charts.length) return

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  doc.addPage()
  let y = 18
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Performance charts', margin, y)
  y += 10

  charts.forEach(chart => {
    const rowHeight = chart.series.length > 1 ? 7.2 : 5.8
    const legendHeight = 6
    const blockHeight = 12 + legendHeight + chart.rows.length * rowHeight + 9
    if (y + blockHeight > pageHeight - margin) {
      doc.addPage()
      y = 18
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(35, 45, 55)
    doc.text(chart.title, margin, y)
    y += 6

    let legendX = margin
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    chart.series.forEach(metric => {
      const rgb = hexToRgb(metric.color)
      doc.setFillColor(rgb.r, rgb.g, rgb.b)
      doc.rect(legendX, y - 2.4, 3, 3, 'F')
      doc.setTextColor(75, 85, 95)
      doc.text(metric.label, legendX + 4.5, y)
      legendX += 4.5 + doc.getTextWidth(metric.label) + 9
    })
    y += 4

    const labelWidth = 58
    const plotX = margin + labelWidth
    const plotWidth = pageWidth - margin * 2 - labelWidth - 4
    const values = chart.rows.flatMap(row => chart.series.map(metric => Number(row[metric.key]) || 0))
    const minValue = Math.min(0, ...values)
    const maxValue = Math.max(0, ...values)
    const range = maxValue - minValue || 1
    const zeroX = plotX + ((0 - minValue) / range) * plotWidth

    for (let tick = 0; tick <= 4; tick++) {
      const gridX = plotX + (plotWidth * tick) / 4
      doc.setDrawColor(225, 230, 235)
      doc.setLineWidth(0.15)
      doc.line(gridX, y - 1, gridX, y + chart.rows.length * rowHeight - 1)
      const tickValue = minValue + (range * tick) / 4
      doc.setFontSize(6)
      doc.setTextColor(110, 120, 130)
      const tickText = chart.series[0]?.format === 'currency'
        ? formatCurrency(tickValue)
        : Math.round(tickValue).toLocaleString()
      doc.text(tickText, gridX, y + chart.rows.length * rowHeight + 3, { align: tick === 0 ? 'left' : tick === 4 ? 'right' : 'center' })
    }
    doc.setDrawColor(120, 130, 140)
    doc.setLineWidth(0.25)
    doc.line(zeroX, y - 1, zeroX, y + chart.rows.length * rowHeight - 1)

    chart.rows.forEach((row, rowIndex) => {
      const rowY = y + rowIndex * rowHeight
      const label = String(row[chart.labelKey] ?? 'Unknown')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(55, 65, 75)
      doc.text(label.length > 25 ? `${label.slice(0, 22)}...` : label, margin, rowY + rowHeight / 2 + 1)
      chart.series.forEach((metric, seriesIndex) => {
        const value = Number(row[metric.key]) || 0
        const valueX = plotX + ((value - minValue) / range) * plotWidth
        const barY = rowY + 0.5 + seriesIndex * (chart.series.length > 1 ? 3 : 0)
        const rgb = hexToRgb(metric.color)
        doc.setFillColor(rgb.r, rgb.g, rgb.b)
        doc.rect(Math.min(zeroX, valueX), barY, Math.max(Math.abs(valueX - zeroX), 0.35), 2.2, 'F')
      })
    })
    y += chart.rows.length * rowHeight + 12
  })
}

function hexToRgb(color: string) {
  const hex = color.replace('#', '')
  return {
    r: parseInt(hex.slice(0, 2), 16) || 0,
    g: parseInt(hex.slice(2, 4), 16) || 0,
    b: parseInt(hex.slice(4, 6), 16) || 0,
  }
}

function escapeHtml(value: any): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
}

function performanceChartsHtml(charts: ExportChart[]): string {
  if (!charts.length) return ''
  return `<h2 class="chart-heading">Performance charts</h2>${charts.map(chart => {
    const width = 1000
    const labelWidth = 230
    const plotWidth = 540
    const valueX = labelWidth + plotWidth + 12
    const rowHeight = chart.series.length > 1 ? 34 : 26
    const top = 58
    const height = top + chart.rows.length * rowHeight + 20
    const values = chart.rows.flatMap(row => chart.series.map(metric => Number(row[metric.key]) || 0))
    const minValue = Math.min(0, ...values)
    const maxValue = Math.max(0, ...values)
    const range = maxValue - minValue || 1
    const zeroX = labelWidth + ((0 - minValue) / range) * plotWidth
    const grid = Array.from({ length: 5 }, (_, index) => {
      const x = labelWidth + (plotWidth * index) / 4
      return `<line x1="${x}" y1="${top - 8}" x2="${x}" y2="${height - 14}" stroke="#e2e8f0"/><text x="${x}" y="${height - 1}" text-anchor="middle" fill="#64748b" font-size="11">${escapeHtml(chart.series[0]?.format === 'currency' ? formatCurrency(minValue + (range * index) / 4) : Math.round(minValue + (range * index) / 4).toLocaleString())}</text>`
    }).join('')
    const legend = chart.series.map((metric, index) => `<g transform="translate(${labelWidth + index * 170},34)"><rect width="12" height="12" rx="3" fill="${metric.color}"/><text x="18" y="10" fill="#475569" font-size="12">${escapeHtml(metric.label)}</text></g>`).join('')
    const bars = chart.rows.map((row, rowIndex) => {
      const rowY = top + rowIndex * rowHeight
      const label = String(row[chart.labelKey] ?? 'Unknown')
      const shortLabel = label.length > 32 ? `${label.slice(0, 29)}...` : label
      const metricBars = chart.series.map((metric, seriesIndex) => {
        const value = Number(row[metric.key]) || 0
        const x = labelWidth + ((Math.min(0, value) - minValue) / range) * plotWidth
        const endX = labelWidth + ((Math.max(0, value) - minValue) / range) * plotWidth
        const y = rowY + (chart.series.length > 1 ? seriesIndex * 13 : 4)
        const text = metric.format === 'currency' ? formatCurrency(value) : value.toLocaleString()
        return `<rect x="${x}" y="${y}" width="${Math.max(endX - x, 1)}" height="9" rx="3" fill="${metric.color}"/><text x="${valueX}" y="${y + 8}" fill="#334155" font-size="11">${escapeHtml(text)}</text>`
      }).join('')
      return `<text x="${labelWidth - 12}" y="${rowY + rowHeight / 2 + 4}" text-anchor="end" fill="#334155" font-size="12">${escapeHtml(shortLabel)}</text>${metricBars}`
    }).join('')
    return `<section class="chart-block"><h3>${escapeHtml(chart.title)}</h3><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chart.title)}">${grid}${legend}<line x1="${zeroX}" y1="${top - 8}" x2="${zeroX}" y2="${height - 14}" stroke="#64748b" stroke-width="1.5"/>${bars}</svg></section>`
  }).join('')}`
}

export function exportToPDF(
  data: any,
  reportLabel: string,
  categoryLabel?: string,
  columns?: ExportColumn[],
  summary?: Record<string, any>,
  businessInfo?: BusinessInfo,
  charts: ExportChart[] = []
) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14

  let startY = 20

  // Business header
  const bizLines = businessInfoToArray(businessInfo)
  if (bizLines.length > 0) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(bizLines[0], margin, startY)
    startY += 5
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    for (let i = 1; i < bizLines.length; i++) {
      doc.text(bizLines[i], margin, startY)
      startY += 4
    }
    startY += 3
    doc.setDrawColor(200)
    doc.setLineWidth(0.3)
    doc.line(margin, startY, pageWidth - margin, startY)
    startY += 6
  }

  // Report title
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(reportLabel, margin, startY)
  startY += 6

  // Category + date
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  if (categoryLabel) {
    doc.text(categoryLabel, margin, startY)
  }
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin - 60, startY)
  startY += 6

  // Summary section
  if (summary && typeof summary === 'object') {
    const summaryEntries = Object.entries(summary).filter(([_, v]) => v != null && v !== '')
    if (summaryEntries.length > 0) {
      autoTable(doc, {
        startY,
        head: [['Metric', 'Value']],
        body: summaryEntries.map(([k, v]) => {
          let displayVal = String(v)
          if (typeof v === 'number') {
            if (k.toLowerCase().includes('balance') || k.toLowerCase().includes('total') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('revenue') || k.toLowerCase().includes('payment') || k.toLowerCase().includes('discount') || k.toLowerCase().includes('tax')) {
              displayVal = formatCurrency(v)
            } else if (!k.toLowerCase().includes('count')) {
              displayVal = new Intl.NumberFormat('en-US').format(v)
            }
          }
          return [k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), displayVal]
        }),
        theme: 'striped',
        headStyles: { fillColor: [217, 91, 60] },
        margin: { left: margin, right: margin },
      })
      startY = (doc as any).lastAutoTable.finalY + 10
    }
  }

  // Data table
  const { headers, rows } = extractRows(data, columns)
  if (headers.length > 0) {
    autoTable(doc, {
      startY,
      head: [headers],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: margin, right: margin },
    })
  } else {
    doc.text('No data available for this report.', margin, startY + 6)
  }

  appendPerformanceCharts(doc, charts)

  doc.save(`${reportLabel.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`)
}

export function printReport(
  data: any,
  reportLabel: string,
  categoryLabel: string,
  columns?: ExportColumn[],
  summary?: Record<string, any>,
  businessInfo?: BusinessInfo,
  charts: ExportChart[] = []
) {
  const { headers, rows } = extractRows(data, columns)

  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) {
    appNotify('Please allow popups to print reports')
    return
  }

  const styles = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 24px; line-height: 1.4; }
      .business-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #333; }
      .business-header .biz-name { font-size: 22px; font-weight: bold; }
      .business-header .biz-address { font-size: 12px; color: #555; margin-top: 2px; }
      .business-header .biz-contact { font-size: 12px; color: #555; margin-top: 1px; }
      .business-header .biz-tin { font-size: 12px; color: #555; margin-top: 1px; }
      h1 { font-size: 20px; margin-bottom: 4px; text-align: center; }
      .category { font-size: 13px; color: #666; margin-bottom: 4px; text-align: center; }
      .generated { font-size: 11px; color: #999; margin-bottom: 20px; text-align: center; }
      .summary { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
      .summary-item { background: #f5f5f5; padding: 10px 16px; border-radius: 6px; }
      .summary-item .label { font-size: 11px; color: #666; font-weight: 500; }
      .summary-item .value { font-size: 14px; font-weight: bold; margin-top: 4px; color: #1a1a1a; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
      thead th { background: #2980b9; color: #fff; text-align: left; padding: 10px; font-weight: 600; border: 1px solid #1f5b8b; }
      tbody td { padding: 8px 10px; border: 1px solid #e0e0e0; }
      tbody tr:nth-child(even) { background: #f9f9f9; }
      tbody tr:hover { background: #f0f0f0; }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .currency { text-align: right; font-family: 'Courier New', monospace; }
      .number { text-align: right; font-family: 'Courier New', monospace; }
      .no-data { text-align: center; padding: 40px; color: #999; }
      .chart-heading { font-size: 18px; margin: 28px 0 12px; page-break-before: always; }
      .chart-block { margin: 0 0 24px; page-break-inside: avoid; }
      .chart-block h3 { font-size: 13px; margin: 0 0 8px; color: #1f2937; }
      .chart-block svg { display: block; width: 100%; height: auto; max-height: 175mm; }
      @media print { 
        body { padding: 12px; } 
        table { page-break-inside: avoid; }
        tr { page-break-inside: avoid; }
      }
    </style>
  `

  // Business header HTML
  let bizHtml = ''
  const bizLines = businessInfoToArray(businessInfo)
  if (bizLines.length > 0) {
    bizHtml = '<div class="business-header">'
    bizHtml += `<div class="biz-name">${bizLines[0]}</div>`
    if (bizLines[1]) bizHtml += `<div class="biz-address">${bizLines[1]}</div>`
    if (bizLines[2]) bizHtml += `<div class="biz-contact">${bizLines[2]}</div>`
    if (bizLines[3]) bizHtml += `<div class="biz-tin">${bizLines[3]}</div>`
    bizHtml += '</div>'
  }

  let summaryHtml = ''
  if (summary && typeof summary === 'object') {
    const summaryEntries = Object.entries(summary).filter(([_, v]) => v != null && v !== '')
    if (summaryEntries.length > 0) {
      summaryHtml = '<div class="summary">' +
        summaryEntries.map(([k, v]) => {
          let displayVal = String(v)
          if (typeof v === 'number') {
            if (k.toLowerCase().includes('balance') || k.toLowerCase().includes('total') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('revenue') || k.toLowerCase().includes('payment') || k.toLowerCase().includes('discount') || k.toLowerCase().includes('tax')) {
              displayVal = formatCurrency(v)
            } else if (!k.toLowerCase().includes('count')) {
              displayVal = new Intl.NumberFormat('en-US').format(Number(v) || 0)
            }
          }
          return `
            <div class="summary-item">
              <div class="label">${k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</div>
              <div class="value">${displayVal}</div>
            </div>
          `
        }).join('') + '</div>'
    }
  }

  let tableHtml = ''
  if (headers.length > 0) {
    // Determine column alignments based on headers
    const columnAlignments = headers.map(h => {
      const lh = h.toLowerCase()
      if (lh.includes('date') || lh.includes('time')) return 'text-center'
      if (lh.includes('amount') || lh.includes('balance') || lh.includes('debit') || lh.includes('credit') || lh.includes('total') || lh.includes('revenue') || lh.includes('cost') || lh.includes('profit') || lh.includes('tax') || lh.includes('discount')) return 'text-right'
      if (lh.includes('quantity') || lh.includes('count') || lh.includes('number')) return 'text-right'
      return ''
    })
    
    tableHtml = `
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map(r => `<tr>${r.map((c, idx) => `<td class="${columnAlignments[idx]}">${c}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    `
  } else {
    tableHtml = '<p class="no-data">No data available for this report.</p>'
  }
  const chartsHtml = performanceChartsHtml(charts)

  printWindow.document.write(`
    <html>
      <head>
        <title>${reportLabel}</title>
        ${styles}
      </head>
      <body>
        ${bizHtml}
        <h1>${reportLabel}</h1>
        <div class="category">${categoryLabel}</div>
        <div class="generated">Generated: ${new Date().toLocaleString()}</div>
        ${summaryHtml}
        ${tableHtml}
        ${chartsHtml}
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 300)
}
