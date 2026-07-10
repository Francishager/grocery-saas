import { useState, useRef } from 'react'
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertMessage } from '@/components/ui/AlertMessage'
import { Badge } from '@/components/ui/badge'
import { apiFetch } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import * as XLSX from 'xlsx'

interface ValidationError {
  row: number
  name: string
  errors: string[]
}

export default function DataImporterPage() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedCount, setParsedCount] = useState(0)

  const TEMPLATE_HEADERS = [
    'Product Name',
    'Category',
    'SKU',
    'Barcode',
    'Selling Price',
    'Cost Price',
    'Stock Quantity',
    'Reorder Level',
    'Base Unit',
    'Description',
    'Item Type',
  ]

  const handleDownloadTemplate = () => {
    const exampleRow = [
      'Rice 1kg',
      'Groceries',
      'RICE-001',
      '8901234567890',
      5000,
      4000,
      100,
      10,
      'Piece',
      'Premium quality rice 1kg bag',
      'product',
    ]

    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, exampleRow])
    ws['!cols'] = [
      { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 18 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 12 }, { wch: 35 }, { wch: 12 },
    ]

    // Add a second sheet with instructions
    const instructions = [
      ['Field', 'Required?', 'Description', 'Example'],
      ['Product Name', 'Yes', 'Name of the product', 'Rice 1kg'],
      ['Category', 'Yes', 'Category name (must already exist)', 'Groceries'],
      ['SKU', 'No', 'Ignored — system auto-generates SKU from the selected category and product name', ''],
      ['Barcode', 'No', 'Product barcode (must be unique)', '8901234567890'],
      ['Selling Price', 'Yes', 'Selling price (must be > 0)', '5000'],
      ['Cost Price', 'Yes', 'Purchase/cost price (>= 0)', '4000'],
      ['Stock Quantity', 'Yes', 'Current stock (must be a non-negative integer)', '100'],
      ['Reorder Level', 'No', 'Minimum stock alert level (default 10)', '10'],
      ['Base Unit', 'No', 'Unit of measure (default Piece)', 'Piece'],
      ['Description', 'No', 'Product description', 'Premium quality rice'],
      ['Item Type', 'Yes', 'product, service, or rental', 'product'],
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(instructions)
    ws2['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 40 }, { wch: 25 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Data')
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions')
    XLSX.writeFile(wb, 'inventory_import_template.xlsx')
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast({ variant: 'destructive', title: 'Please upload an Excel (.xlsx, .xls) or CSV file' })
      return
    }
    setSelectedFile(file)
    setValidationErrors([])
    setSuccessMsg(null)
    setParsedCount(0)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setValidationErrors([])
    setSuccessMsg(null)

    try {
      const data = await selectedFile.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (jsonRows.length === 0) {
        toast({ variant: 'destructive', title: 'The file has no data rows' })
        setUploading(false)
        return
      }

      setParsedCount(jsonRows.length)

      const res = await apiFetch('/api/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: jsonRows }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (result.validationErrors) {
          setValidationErrors(result.validationErrors)
          toast({
            variant: 'destructive',
            title: `Validation failed: ${result.errorCount} row(s) with errors`,
            description: `${result.validCount} row(s) were valid but import was rejected. Fix the errors and re-upload.`,
          })
        } else {
          toast({ variant: 'destructive', title: result.error || 'Import failed' })
        }
        setUploading(false)
        return
      }

      setSuccessMsg(result.message)
      toast({ title: result.message })
      setSelectedFile(null)
      setParsedCount(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      console.error('Import error:', err)
      toast({ variant: 'destructive', title: 'Failed to process file. Please try again.' })
    }
    setUploading(false)
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data Importer</h1>
        <p className="text-muted-foreground mt-1">Bulk import inventory items from an Excel file</p>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500" />
            How to Use
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li><strong>Download the Excel template</strong> using the button below. It contains the correct column headers and an example row.</li>
            <li><strong>Open the template</strong> in Excel, Google Sheets, or any spreadsheet application.</li>
            <li><strong>Fill in your inventory data</strong> — one product per row, following the column headers exactly.</li>
            <li><strong>Save the file</strong> as <code>.xlsx</code>, <code>.xls</code>, or <code>.csv</code>.</li>
            <li><strong>Upload the filled file</strong> using the upload button on this page.</li>
            <li>If any rows have errors, the system will <strong>reject the entire upload</strong> and show you exactly which rows and fields need fixing.</li>
            <li>Fix the errors in your file and re-upload. All rows must be valid for the import to succeed.</li>
          </ol>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-semibold">Field Reference:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div><Badge variant="destructive" className="mr-1">Required</Badge> <strong>Product Name</strong> — Name of the product</div>
              <div><Badge variant="destructive" className="mr-1">Required</Badge> <strong>Selling Price</strong> — Must be a number greater than 0</div>
              <div><Badge variant="destructive" className="mr-1">Required</Badge> <strong>Category</strong> — Must match an existing category name</div>
              <div><Badge variant="secondary" className="mr-1">Optional</Badge> <strong>SKU</strong> — Ignored; the system auto-generates it from the selected category and product name</div>
              <div><Badge variant="secondary" className="mr-1">Optional</Badge> <strong>Barcode</strong> — Must be unique within the branch</div>
              <div><Badge variant="destructive" className="mr-1">Required</Badge> <strong>Cost Price</strong> — Non-negative number</div>
              <div><Badge variant="destructive" className="mr-1">Required</Badge> <strong>Stock Quantity</strong> — Non-negative integer</div>
              <div><Badge variant="secondary" className="mr-1">Optional</Badge> <strong>Reorder Level</strong> — Default: 10</div>
              <div><Badge variant="secondary" className="mr-1">Optional</Badge> <strong>Base Unit</strong> — Default: Piece (e.g. KG, Bottle, Tablet)</div>
              <div><Badge variant="secondary" className="mr-1">Optional</Badge> <strong>Description</strong> — Product description text</div>
              <div><Badge variant="destructive" className="mr-1">Required</Badge> <strong>Item Type</strong> — product, service, or rental</div>
            </div>
          </div>

          <AlertMessage severity="info" variant="standard" dismissible={false} title="Important Notes">
            <ul className="list-disc list-inside space-y-1 mt-1 text-sm">
              <li>Category names must already exist in your system. Create them first in the Inventory page if needed.</li>
              <li>Product names must be unique within the branch; duplicates will be rejected.</li>
              <li>SKUs are auto-generated from the selected category and product name, and barcodes must still be unique.</li>
              <li>The entire upload is rejected if <strong>any</strong> row has an error. Fix all errors before re-uploading.</li>
              <li>For service items, stock quantity and reorder level are automatically set to 0.</li>
            </ul>
          </AlertMessage>
        </CardContent>
      </Card>

      {/* Download Template */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            Step 1: Download Template
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Download the pre-formatted Excel template with the correct column headers and an example row to guide you.
          </p>
          <Button onClick={handleDownloadTemplate} className="gap-2">
            <Download className="h-4 w-4" />
            Download Excel Template
          </Button>
        </CardContent>
      </Card>

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-500" />
            Step 2: Upload Filled File
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploading ? 'Importing...' : 'Upload & Import'}
            </Button>
          </div>

          {selectedFile && !uploading && (
            <p className="text-sm text-muted-foreground">
              Selected: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)
              {parsedCount > 0 && ` • ${parsedCount} rows detected`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Success Message */}
      {successMsg && (
        <AlertMessage severity="success" variant="standard" dismissible={false} title="Import Successful">
          {successMsg}
        </AlertMessage>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Validation Errors ({validationErrors.length} row{validationErrors.length !== 1 ? 's' : ''})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The upload was rejected because the following rows have errors. Fix them in your Excel file and re-upload.
            </p>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {validationErrors.map((ve, idx) => (
                <div key={idx} className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="destructive">Row {ve.row}</Badge>
                    <span className="text-sm font-medium">{ve.name}</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-red-700 dark:text-red-400 space-y-0.5 ml-2">
                    {ve.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
