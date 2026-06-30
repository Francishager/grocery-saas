import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalBranches } from '@/db/hybrid'
import { Users, Search, Download } from 'lucide-react'

interface StaffTill {
  id: string
  staffId: string
  staff?: { id: string; fname: string; lname: string; role: string }
  branchId?: string
  branch?: { id: string; name: string }
  openingBalance: number
  closingBalance: number
  cashIn: number
  cashOut: number
  expectedBalance: number
  variance: number
  date: string
  status: string
  notes?: string
}

interface Branch {
  id: string
  name: string
}

export default function StaffTillSheetPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [tills, setTills] = useState<StaffTill[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterDate, setFilterDate] = useState('')

  const fetchTills = async () => {
    try {
      const res = await apiFetch('/api/hr/till-sheets')
      if (res.ok) setTills(await res.json())
    } catch {
      setTills([])
    } finally {
      setLoading(false)
    }
  }

  const fetchBranches = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/branches')
        if (res.ok) setBranches(await res.json())
      } else {
        setBranches(await getLocalBranches())
      }
    } catch {
      try { setBranches(await getLocalBranches()) } catch {}
    }
  }

  const fetchStaff = async () => {
    try {
      const res = await apiFetch('/api/staff')
      if (res.ok) setStaff(await res.json())
    } catch {
      setStaff([])
    }
  }

  useEffect(() => {
    fetchTills()
    fetchBranches()
    fetchStaff()
  }, [])

  const filteredTills = tills.filter(t => {
    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      const staffName = t.staff ? `${t.staff.fname} ${t.staff.lname}`.toLowerCase() : ''
      if (!staffName.includes(lower) && !t.id.toLowerCase().includes(lower)) return false
    }
    if (filterBranch && t.branchId !== filterBranch) return false
    if (filterDate && new Date(t.date).toISOString().split('T')[0] !== filterDate) return false
    return true
  })

  const fmt = (val: number) => Number(val || 0).toFixed(2)

  const totalOpening = filteredTills.reduce((s, t) => s + Number(t.openingBalance || 0), 0)
  const totalClosing = filteredTills.reduce((s, t) => s + Number(t.closingBalance || 0), 0)
  const totalVariance = filteredTills.reduce((s, t) => s + Number(t.variance || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff Till Sheet</h1>
        <p className="text-muted-foreground">Track staff till balances, cash movements, and variances</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Opening Balance</p>
            <p className="text-lg font-bold text-blue-600">{fmt(totalOpening)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Closing Balance</p>
            <p className="text-lg font-bold text-green-600">{fmt(totalClosing)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Variance</p>
            <p className={`text-lg font-bold ${totalVariance < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalVariance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by staff name..."
                className="pl-9"
              />
            </div>
            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full sm:w-44" />
            <Button variant="outline" onClick={() => { setSearchTerm(''); setFilterBranch(''); setFilterDate('') }}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      {/* Till Sheet Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Till Sheets</CardTitle>
            <Button variant="outline" size="sm" onClick={() => toast({ title: 'Export started' })}>
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium">Date</th>
                  <th className="text-left py-2 px-2 font-medium">Staff</th>
                  <th className="text-left py-2 px-2 font-medium">Branch</th>
                  <th className="text-right py-2 px-2 font-medium">Opening</th>
                  <th className="text-right py-2 px-2 font-medium">Cash In</th>
                  <th className="text-right py-2 px-2 font-medium">Cash Out</th>
                  <th className="text-right py-2 px-2 font-medium">Expected</th>
                  <th className="text-right py-2 px-2 font-medium">Closing</th>
                  <th className="text-right py-2 px-2 font-medium">Variance</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTills.map(till => (
                  <tr key={till.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-2 whitespace-nowrap">{new Date(till.date).toLocaleDateString()}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        {till.staff ? `${till.staff.fname} ${till.staff.lname}` : '—'}
                      </div>
                    </td>
                    <td className="py-2 px-2">{till.branch?.name || '—'}</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(till.openingBalance)}</td>
                    <td className="py-2 px-2 text-right font-mono text-green-600">{fmt(till.cashIn)}</td>
                    <td className="py-2 px-2 text-right font-mono text-red-600">{fmt(till.cashOut)}</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(till.expectedBalance)}</td>
                    <td className="py-2 px-2 text-right font-mono font-bold">{fmt(till.closingBalance)}</td>
                    <td className={`py-2 px-2 text-right font-mono ${till.variance < 0 ? 'text-red-600' : till.variance > 0 ? 'text-green-600' : ''}`}>
                      {fmt(till.variance)}
                    </td>
                    <td className="py-2 px-2">
                      <Badge variant={till.status === 'balanced' ? 'default' : till.status === 'short' ? 'destructive' : 'secondary'}>
                        {till.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {filteredTills.length === 0 && !loading && (
                  <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">No till sheets found</td></tr>
                )}
              </tbody>
              {filteredTills.length > 0 && (
                <tfoot>
                  <tr className="font-bold border-t-2">
                    <td colSpan={3} className="py-2 px-2">Total</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(totalOpening)}</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(filteredTills.reduce((s, t) => s + Number(t.cashIn || 0), 0))}</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(filteredTills.reduce((s, t) => s + Number(t.cashOut || 0), 0))}</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(filteredTills.reduce((s, t) => s + Number(t.expectedBalance || 0), 0))}</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(totalClosing)}</td>
                    <td className={`py-2 px-2 text-right font-mono ${totalVariance < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalVariance)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
