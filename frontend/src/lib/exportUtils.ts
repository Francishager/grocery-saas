import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency } from './utils'

type ExportColumn = {
  key: string
  label: string
  format?: 'currency' | 'number' | 'date' | 'text'
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
    case 'date': return value ? new Date(value).toLocaleDateString() : ''
    default:
      if (typeof value === 'object') {
        if (value.name) return String(value.name)
        if (value.label) return String(value.label)
        if (value.email) return String(value.email)
        const firstVal = Object.values(value)[0]
        return firstVal != null ? String(firstVal) : ''
      }
      return String(value)
  }
}

function extractRows(data: any, columns?: ExportColumn[]): { headers: string[]; rows: string[][] } {
  if (!data) return { headers: [], rows: [] }

  // Handle different data shapes
  let rowsArr: any[] = []
  if (Array.isArray(data)) {
    rowsArr = data
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
    const keys = Object.keys(rowsArr[0])
    headers = keys.map(k => k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()))
    rows = rowsArr.map(row => keys.map(k => formatExportValue(row[k])) )
  }

  return { headers, rows }
}

export function exportToExcel(
  data: any,
  reportLabel: string,
  columns?: ExportColumn[],
  summary?: Record<string, any>,
  businessInfo?: BusinessInfo
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
  if (summary) {
    for (const [k, v] of Object.entries(summary)) {
      sheetData.push([k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), typeof v === 'number' ? formatCurrency(v) : String(v)])
    }
    sheetData.push([])
  }

  if (headers.length > 0) {
    sheetData.push(headers)
    sheetData.push(...rows)
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData.length > 0 ? sheetData : [[reportLabel], ['No data available']])
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  XLSX.writeFile(wb, `${reportLabel.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`)
}

export function exportToPDF(
  data: any,
  reportLabel: string,
  categoryLabel?: string,
  columns?: ExportColumn[],
  summary?: Record<string, any>,
  businessInfo?: BusinessInfo
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
  if (summary) {
    const summaryEntries = Object.entries(summary)
    if (summaryEntries.length > 0) {
      autoTable(doc, {
        startY,
        head: [['Metric', 'Value']],
        body: summaryEntries.map(([k, v]) => [
          k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
          typeof v === 'number' ? formatCurrency(v) : String(v)
        ]),
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

  doc.save(`${reportLabel.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`)
}

export function printReport(
  data: any,
  reportLabel: string,
  categoryLabel: string,
  columns?: ExportColumn[],
  summary?: Record<string, any>,
  businessInfo?: BusinessInfo
) {
  const { headers, rows } = extractRows(data, columns)

  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) {
    alert('Please allow popups to print reports')
    return
  }

  const styles = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 24px; }
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
      .summary-item .label { font-size: 11px; color: #666; }
      .summary-item .value { font-size: 16px; font-weight: bold; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      thead th { background: #2980b9; color: #fff; text-align: left; padding: 8px 10px; }
      tbody td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; }
      tbody tr:nth-child(even) { background: #f9f9f9; }
      .no-data { text-align: center; padding: 40px; color: #999; }
      @media print { body { padding: 12px; } }
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
  if (summary) {
    summaryHtml = '<div class="summary">' +
      Object.entries(summary).map(([k, v]) => `
        <div class="summary-item">
          <div class="label">${k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</div>
          <div class="value">${typeof v === 'number' ? formatCurrency(Number(v) || 0) : String(v)}</div>
        </div>
      `).join('') + '</div>'
  }

  let tableHtml = ''
  if (headers.length > 0) {
    tableHtml = `
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    `
  } else {
    tableHtml = '<p class="no-data">No data available for this report.</p>'
  }

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
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 300)
}
