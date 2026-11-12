import { drawCreative } from './advisorCreativeLayout'

export type CreativeCopy = { headline: string; subheading: string; body: string; cta: string; caption: string; hashtags: string[]; offer?: string }
export type VisualReport = { title: string; metrics: { label: string; value: number; format: string }[];
  charts: { title: string; format: string; rows: { label: string; value: number }[] }[];
  tables: { title: string; columns: { key: string; label: string; format?: string }[]; rows: Record<string, any>[] }[];
  sources: string[]; limitations: string[]; asOf: string; period: { from: string; to: string }; scope: { branch: string; sales?: string } }
export type AdvisorVisual = { id: string; conversationId: string; kind: 'report' | 'flyer' | 'social'; title: string; status: string; imageMime?: string; createdAt: string;
  data?: { brand: { name: string; currency: string; logo?: string | null }; copy: CreativeCopy; product?: { name: string; price: number; unit: string }; format: string; palette: string; platform: string;
    report?: VisualReport; warnings: string[]; imageSource?: string; brief: string; tone?: string; reportType?: string; productId?: string; layout?: string; artwork?: string;
    externalPhoto?: { title: string; sourceUrl: string; creator: string; license: string; licenseUrl: string; retrievedAt: string } } }
const palettes: Record<string, { accent: string; pale: string; secondary: string; ink: string; soft: string }> = {
  green: { accent: '#11634c', pale: '#eff8f3', secondary: '#e3b648', ink: '#11251d', soft: '#d8eee4' },
  blue: { accent: '#1f5aa6', pale: '#eff5fc', secondary: '#dd6158', ink: '#132238', soft: '#dbeafe' },
  berry: { accent: '#992651', pale: '#fcf0f4', secondary: '#167d89', ink: '#311321', soft: '#f7d9e4' },
}
const font = (size: number, bold = false) => `${bold ? 600 : 400} ${size}px "Geist Variable", Arial, sans-serif`
const displayDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
export const visualValue = (value: unknown, format: string | undefined, currency: string) => {
  if (value == null) return '-'
  if (format === 'date') return displayDate(String(value))
  if (typeof value === 'number') return `${format === 'currency' ? `${currency} ` : ''}${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(value)}`
  return String(value)
}
function lines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const result: string[] = []
  for (const paragraph of String(text || '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (ctx.measureText(candidate).width <= width) { line = candidate; continue }
      if (line) { result.push(line); line = '' }
      for (const char of Array.from(word)) {
        if (ctx.measureText(line + char).width > width && line) { result.push(line); line = '' }
        line += char
      }
    }
    result.push(line)
  }
  return result
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size = 28, bold = false, color = '#16241f') {
  ctx.font = font(size, bold); ctx.fillStyle = color; ctx.textBaseline = 'top'
  const rows = lines(ctx, value, width)
  rows.forEach((row, index) => ctx.fillText(row, x, y + index * size * 1.3))
  return y + rows.length * size * 1.3
}
function fitted(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, height: number, maxSize: number, color = '#16241f', bold = true) {
  let size = maxSize
  while (size > 12) { ctx.font = font(size, bold); if (lines(ctx, value, width).length * size * 1.3 <= height) break; size-- }
  return text(ctx, value, x, y, width, size, bold, color)
}
function canvas(width: number, height: number) {
  const element = document.createElement('canvas'); element.width = width; element.height = height
  const ctx = element.getContext('2d')
  if (!ctx) throw new Error('Your browser could not prepare the visual. Please try another browser.')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height)
  return { element, ctx }
}
async function loadImage(url?: string) {
  if (!url) return null
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); const timer = window.setTimeout(() => reject(new Error('The artwork could not be loaded. Reopen the preview and try again.')), 15000)
    image.crossOrigin = 'anonymous'; image.onload = () => { window.clearTimeout(timer); resolve(image) }; image.onerror = () => { window.clearTimeout(timer); reject(new Error('The image could not be loaded.')) }; image.src = url
  })
}
function contain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale, drawHeight = image.naturalHeight * scale
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}
async function loadOptionalImage(url?: string | null) {
  try { return await loadImage(url || undefined) } catch { return null }
}
function drawBrandMark(ctx: CanvasRenderingContext2D, data: AdvisorVisual['data'], logo: HTMLImageElement | null, x: number, y: number, width: number, height: number, color: string) {
  if (logo) { contain(ctx, logo, x, y, Math.min(width, 260), height); return y + height }
  return fitted(ctx, data?.brand.name || 'Business', x, y, width, height, 38, color)
}

export async function renderAdvisorVisual(artifact: AdvisorVisual, imageUrl?: string): Promise<HTMLCanvasElement[]> {
  await document.fonts.ready
  if (!artifact.data || artifact.status !== 'complete') throw new Error('This visual is not ready yet.')
  const data = artifact.data, palette = palettes[data.palette] || palettes.green
  const currency = data.brand.currency || 'UGX'
  const brandLogo = await loadOptionalImage(data.brand.logo)
  if (artifact.kind !== 'report') {
    const height = data.format === 'story' ? 1920 : data.format === 'square' ? 1080 : 1350
    const { element, ctx } = canvas(1080, height)
    const productImage = await loadImage(imageUrl)
    drawCreative(ctx, data, productImage, brandLogo, palette, height)
    return [element]
  }

  const report = data.report!
  const width = 1240, height = 1754, margin = 72, usable = width - margin * 2
  const pages: HTMLCanvasElement[] = []
  let ctx: CanvasRenderingContext2D, y = 0
  const newPage = () => {
    const page = canvas(width, height); ctx = page.ctx; pages.push(page.element)
    ctx.fillStyle = palette.accent; ctx.fillRect(0, 0, width, 16)
    y = drawBrandMark(ctx, data, brandLogo, margin, 52, usable, 58, palette.accent) + 16
    if (data.brand.logo) y = text(ctx, data.brand.name, margin, y, usable, 23, true, palette.accent) + 10
    y = text(ctx, report.title, margin, y, usable, 44, true) + 12
    y = text(ctx, `${displayDate(report.period.from)} - ${displayDate(report.period.to)} | ${report.scope.branch}`, margin, y, usable, 21, false, '#46554d') + 12
    if (report.scope.sales) y = text(ctx, report.scope.sales, margin, y, usable, 19, false, '#46554d') + 12
    ctx.strokeStyle = '#cedbd3'; ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(width - margin, y); ctx.stroke(); y += 30
  }
  const ensure = (space: number) => { if (y + space > height - 90) newPage() }
  const paragraph = (value: string, size = 24, bold = false) => {
    ctx.font = font(size, bold)
    for (const row of lines(ctx, value, usable)) { ensure(size * 1.4); text(ctx, row, margin, y, usable, size, bold); y += size * 1.4 }
    y += 14
  }
  newPage()
  for (let i = 0; i < report.metrics.length; i += 2) {
    ensure(145)
    report.metrics.slice(i, i + 2).forEach((metric, index) => {
      const x = margin + index * (usable / 2 + 12), w = usable / 2 - 24
      fitted(ctx, metric.label, x, y, w, 54, 22, '#46554d', false)
      fitted(ctx, visualValue(metric.value, metric.format, currency), x, y + 62, w, 58, 44, palette.accent)
    }); y += 145
  }
  for (const chart of report.charts) {
    const rows = chart.rows.slice(0, 12)
    ensure(70 + Math.max(rows.length, 1) * 82)
    paragraph(chart.title, 29, true)
    if (!rows.length) { paragraph('No records in this snapshot.', 23); continue }
    const max = Math.max(1, ...rows.map(row => Math.abs(row.value)))
    for (const row of rows) {
      fitted(ctx, row.label, margin, y, 290, 68, 21, '#16241f', false)
      const value = visualValue(row.value, chart.format, currency)
      const barWidth = 500 * Math.abs(row.value) / max
      ctx.fillStyle = '#e9efec'; ctx.fillRect(margin + 310, y + 8, 500, 30)
      ctx.fillStyle = row.value < 0 ? '#a93448' : palette.accent; ctx.fillRect(margin + 310, y + 8, barWidth, 30)
      fitted(ctx, value, margin + 832, y, usable - 832, 64, 22, '#16241f', true)
      y += 82
    }
    y += 20
  }
  if (data.copy.body) { ensure(120); paragraph('Advisor commentary', 29, true); paragraph(data.copy.body) }
  for (const table of report.tables) {
    newPage(); paragraph(table.title, 29, true)
    const count = table.columns.length
    const widths = table.columns.map((_, index) => count > 2 ? usable * (index === 0 ? 0.38 : 0.62 / (count - 1)) : usable / count)
    const header = () => {
      let x = margin; ctx.fillStyle = palette.pale; ctx.fillRect(margin, y, usable, 70)
      table.columns.forEach((column, index) => { fitted(ctx, column.label, x + 12, y + 10, widths[index] - 24, 52, 20, palette.accent); x += widths[index] }); y += 78
    }
    header()
    if (!table.rows.length) paragraph('No records in this snapshot.', 23)
    for (const row of table.rows) {
      ctx.font = font(21)
      const values = table.columns.map(column => visualValue(row[column.key], column.format, currency))
      const rowHeight = Math.max(58, ...values.map((value, index) => lines(ctx, value, widths[index] - 24).length * 28 + 24))
      if (y + rowHeight > height - 90) { newPage(); paragraph(`${table.title} (continued)`, 27, true); header() }
      let x = margin
      values.forEach((value, index) => { text(ctx, value, x + 12, y + 12, widths[index] - 24, 21); x += widths[index] })
      y += rowHeight; ctx.strokeStyle = '#dbe4df'; ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(width - margin, y); ctx.stroke()
    }
  }
  newPage(); paragraph('Sources and scope', 30, true)
  paragraph(`Snapshot generated ${displayDate(report.asOf || artifact.createdAt)}. Private business report.`, 23)
  for (const source of report.sources) paragraph(source, 23, true)
  for (const limitation of report.limitations) paragraph(limitation, 22)
  paragraph('Charts and tables use recorded system figures. Commentary is AI-generated and should be reviewed. This planning report is not an audited financial statement.', 22)
  pages.forEach((page, index) => { const footer = page.getContext('2d')!; fitted(footer, `${data.brand.name} | ${index + 1} / ${pages.length}`, margin, height - 52, usable, 42, 17, '#46554d', false) })
  return pages
}

export async function downloadVisualPdf(artifact: AdvisorVisual, pages: HTMLCanvasElement[]) {
  const { jsPDF } = await import('jspdf')
  const first = pages[0], w = 210, h = w * first.height / first.width
  const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait', compress: true })
  for (const [index, page] of pages.entries()) {
    if (index) pdf.addPage([w, h], 'portrait')
    pdf.addImage(page.toDataURL('image/png'), 'PNG', 0, 0, w, h, undefined, 'FAST')
    await new Promise(resolve => window.setTimeout(resolve, 0))
  }
  pdf.setProperties({ title: artifact.title, author: artifact.data?.brand.name || 'JibuSales' })
  await pdf.save(`${fileName(artifact.title)}.pdf`, { returnPromise: true })
}
export async function downloadVisualPng(artifact: AdvisorVisual, page: HTMLCanvasElement, index = 0) {
  const blob = await new Promise<Blob>((resolve, reject) => page.toBlob(value => value ? resolve(value) : reject(new Error('Unable to prepare the image download.')), 'image/png'))
  saveBlob(blob, `${fileName(artifact.title)}${artifact.kind === 'report' ? `-page-${index + 1}` : ''}.png`)
}
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}
export const fileName = (value: string) => value.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 90) || 'business-visual'
export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(value); return } catch { /* Fall back for restricted browser clipboard contexts. */ } }
  const input = document.createElement('textarea'); input.value = value; input.style.position = 'fixed'; input.style.left = '-10000px'; document.body.appendChild(input); input.select()
  const copied = document.execCommand('copy'); input.remove()
  if (!copied) throw new Error('Copy was blocked by your browser. Select the text and copy it manually.')
}
