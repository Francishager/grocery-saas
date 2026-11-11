import { useCallback, useEffect, useState } from 'react'
import { Activity, CalendarDays, ClipboardList, FilePlus2, Loader2, MoreHorizontal, Plus, RefreshCw, Users } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

type Row = Record<string, any>
const tabs = ['Patients', 'Appointments', 'Encounters', 'Prescriptions'] as const
type Tab = typeof tabs[number] | 'Overview'
type ClinicSection = 'patients' | 'appointments' | 'encounters' | 'prescriptions'
const sectionTabs: Record<ClinicSection, Tab> = {
  patients: 'Patients',
  appointments: 'Appointments',
  encounters: 'Encounters',
  prescriptions: 'Prescriptions',
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed.')
  return data as T
}

const inputClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground'
const emptyPrescriptionLine = () => ({ productId: '', quantity: '1', dosage: '', frequency: '', durationDays: '', instructions: '' })

export default function ClinicManagementPage({ section }: { section: ClinicSection }) {
  const { hasPermission: granted } = useJWTAuth()
  const hasPermission = useCallback((key: string) => {
    const legacyGrant: Record<string, string[]> = {
      canCreateClinicPatients: ['canManageClinicPatients'], canEditClinicPatients: ['canManageClinicPatients'],
      canCreateClinicAppointments: ['canManageClinicAppointments'], canEditClinicAppointments: ['canManageClinicAppointments'],
      canCreateClinicEncounters: ['canManageClinicEncounters'], canCreateClinicPrescriptions: ['canManageClinicPrescriptions'],
    }
    return granted(key) || (legacyGrant[key] || []).some(granted)
  }, [granted])
  const tab = sectionTabs[section]
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [summary, setSummary] = useState({ patients: 0, appointmentsToday: 0, encountersToday: 0, openPrescriptions: 0 })
  const [patients, setPatients] = useState<Row[]>([])
  const [appointments, setAppointments] = useState<Row[]>([])
  const [encounters, setEncounters] = useState<Row[]>([])
  const [prescriptions, setPrescriptions] = useState<Row[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [patientMedicationHistory, setPatientMedicationHistory] = useState<Row[]>([])
  const [medicationHistoryLoading, setMedicationHistoryLoading] = useState(false)
  const [medicines, setMedicines] = useState<Row[]>([])
  const [patientForm, setPatientForm] = useState({ name: '', phone: '', email: '', address: '', medicalRecordNo: '', dateOfBirth: '', gender: '', bloodGroup: '', allergies: '', emergencyContact: '', emergencyPhone: '' })
  const [editingPatientId, setEditingPatientId] = useState('')
  const [appointmentForm, setAppointmentForm] = useState({ customerId: '', startsAt: '', providerName: '', reason: '', notes: '' })
  const [encounterForm, setEncounterForm] = useState({ customerId: '', appointmentId: '', clinicianName: '', chiefComplaint: '', assessment: '', diagnosis: '', treatmentPlan: '', notes: '' })
  const [prescriptionForm, setPrescriptionForm] = useState({ customerId: '', encounterId: '', prescriberName: '', items: [emptyPrescriptionLine()], notes: '' })

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const jobs: Array<Promise<void>> = []
    const canLoadPatients = hasPermission('canViewClinicPatients') || hasPermission('canEditClinicPatients')
    if (section === 'patients' && canLoadPatients) jobs.push(request<any>('/api/clinic/patients').then(data => setPatients(data.patients || [])))
    if (section === 'appointments') {
      if (hasPermission('canViewClinicAppointments')) jobs.push(request<any>('/api/clinic/appointments').then(data => setAppointments(data.appointments || [])))
      if (canLoadPatients && hasPermission('canCreateClinicAppointments')) jobs.push(request<any>('/api/clinic/patients').then(data => setPatients(data.patients || [])))
    }
    if (section === 'encounters') {
      if (hasPermission('canViewClinicEncounters')) jobs.push(request<any>('/api/clinic/encounters').then(data => setEncounters(data.encounters || [])))
      if (canLoadPatients && hasPermission('canCreateClinicEncounters')) jobs.push(request<any>('/api/clinic/patients').then(data => setPatients(data.patients || [])))
    }
    if (section === 'prescriptions') {
      if (hasPermission('canViewClinicPrescriptions')) jobs.push(request<any>('/api/clinic/prescriptions').then(data => setPrescriptions(data.prescriptions || [])))
      if (canLoadPatients && hasPermission('canCreateClinicPrescriptions')) jobs.push(request<any>('/api/clinic/patients').then(data => setPatients(data.patients || [])))
      if (hasPermission('canCreateClinicPrescriptions')) jobs.push(request<any>('/api/clinic/catalogue').then(data => setMedicines(data.medicines || [])).catch(() => {}))
    }
    const results = await Promise.allSettled(jobs)
    const failed = results.some(result => result.status === 'rejected')
    if (failed) setError('Some clinic records could not be refreshed. Check this user’s clinic permissions and retry.')
    setLoading(false)
  }, [hasPermission, section])

  useEffect(() => { void load() }, [load])
  const save = async (path: string, body: unknown, success: string) => {
    setSaving(true); setError(''); setNotice('')
    try { await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); setNotice(success); await load(); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save this record.'); return false }
    finally { setSaving(false) }
  }
  const savePrescription = async (event: React.FormEvent) => {
    event.preventDefault()
    const saved = await save('/api/clinic/prescriptions', {
      ...prescriptionForm,
      items: prescriptionForm.items.map(item => ({ ...item, quantity: Number(item.quantity), durationDays: item.durationDays ? Number(item.durationDays) : null })),
    }, 'Prescription created.')
    if (saved) setPrescriptionForm({ customerId: '', encounterId: '', prescriberName: '', items: [emptyPrescriptionLine()], notes: '' })
  }
  const savePatient = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      const path = editingPatientId ? `/api/clinic/patients/${editingPatientId}` : '/api/clinic/patients'
      await request(path, { method: editingPatientId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patientForm) })
      setNotice(editingPatientId ? 'Patient profile updated.' : 'Patient profile created.')
      setEditingPatientId('')
      setPatientForm({ name: '', phone: '', email: '', address: '', medicalRecordNo: '', dateOfBirth: '', gender: '', bloodGroup: '', allergies: '', emergencyContact: '', emergencyPhone: '' })
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save patient profile.') }
    finally { setSaving(false) }
  }
  const openPatientMedicationHistory = async (customerId: string) => {
    setSelectedPatientId(customerId); setMedicationHistoryLoading(true); setError('')
    try {
      const result = await request<any>(`/api/clinic/patients/${customerId}/medication-history`)
      setPatientMedicationHistory(result.prescriptions || [])
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load patient medication history.') }
    finally { setMedicationHistoryLoading(false) }
  }
  return <main className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div><p className="text-xs font-semibold uppercase text-emerald-700">Care operations</p><h1 className="mt-1 text-2xl font-semibold text-foreground">Clinic Management</h1><p className="mt-1 text-sm text-muted-foreground">Patient records, appointments, clinical encounters and prescriptions.</p></div>
      <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
    </header>
    {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {loading ? <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading clinic records</div> : <>
      {tab === 'Overview' && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        ['Registered patients', summary.patients, Users], ['Appointments today', summary.appointmentsToday, CalendarDays], ['Encounters today', summary.encountersToday, Activity], ['Open prescriptions', summary.openPrescriptions, ClipboardList],
      ].map(([label, value, Icon]: any) => <div key={label} className="rounded-md border border-border bg-card p-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-emerald-700" /></div><p className="mt-3 text-2xl font-semibold text-foreground">{value}</p></div>)}
        <div className="col-span-full rounded-md border border-border p-4 text-sm text-muted-foreground">Clinic charges are recorded through the existing Sales/POS workflow. That is where receipts, stock, tax, cash/receivables and general-ledger entries are created.</div>
      </section>}
      {tab === 'Patients' && <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
        {(hasPermission('canCreateClinicPatients') || hasPermission('canEditClinicPatients')) && <form className="order-1 space-y-3 rounded-md border border-border p-4 xl:order-2" onSubmit={savePatient}><h2 className="font-semibold text-foreground">{editingPatientId ? 'Edit patient' : 'Register patient'}</h2><Input required placeholder="Patient full name" value={patientForm.name} onChange={e => setPatientForm({ ...patientForm, name: e.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Phone" value={patientForm.phone} onChange={e => setPatientForm({ ...patientForm, phone: e.target.value })} /><Input type="email" placeholder="Email" value={patientForm.email} onChange={e => setPatientForm({ ...patientForm, email: e.target.value })} /></div><Input placeholder="Address" value={patientForm.address} onChange={e => setPatientForm({ ...patientForm, address: e.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><Input required placeholder="Medical record number" value={patientForm.medicalRecordNo} onChange={e => setPatientForm({ ...patientForm, medicalRecordNo: e.target.value })} /><Input type="date" aria-label="Date of birth" value={patientForm.dateOfBirth} onChange={e => setPatientForm({ ...patientForm, dateOfBirth: e.target.value })} /></div><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Gender (optional)" value={patientForm.gender} onChange={e => setPatientForm({ ...patientForm, gender: e.target.value })} /><Input placeholder="Blood group (optional)" value={patientForm.bloodGroup} onChange={e => setPatientForm({ ...patientForm, bloodGroup: e.target.value })} /></div><Textarea placeholder="Allergies / clinical alerts" value={patientForm.allergies} onChange={e => setPatientForm({ ...patientForm, allergies: e.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Emergency contact" value={patientForm.emergencyContact} onChange={e => setPatientForm({ ...patientForm, emergencyContact: e.target.value })} /><Input placeholder="Emergency phone" value={patientForm.emergencyPhone} onChange={e => setPatientForm({ ...patientForm, emergencyPhone: e.target.value })} /></div><Button className="w-full" disabled={saving}><Plus className="mr-2 h-4 w-4" />{editingPatientId ? 'Save patient changes' : 'Save patient'}</Button>{editingPatientId && <Button type="button" variant="outline" className="w-full" onClick={() => { setEditingPatientId(''); setPatientForm({ name: '', phone: '', email: '', address: '', medicalRecordNo: '', dateOfBirth: '', gender: '', bloodGroup: '', allergies: '', emergencyContact: '', emergencyPhone: '' }) }}>Cancel edit</Button>}</form>}
        <div className="min-w-0 overflow-hidden rounded-md border border-border"><div className="border-b border-border px-4 py-3 font-semibold text-foreground">Patient register</div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3">Patient</th><th className="p-3">Record no.</th><th className="p-3">Phone</th><th className="p-3">Date of birth</th><th className="p-3">Alerts</th>{(hasPermission('canEditClinicPatients') || hasPermission('canViewClinicPrescriptions')) && <th className="p-3">Action</th>}</tr></thead><tbody>{patients.map(p => <tr key={p.id} className="border-t border-border"><td className="p-3 font-medium text-foreground">{p.name}</td><td className="p-3">{p.medicalRecordNo}</td><td className="p-3">{p.phone || '—'}</td><td className="p-3">{p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : '—'}</td><td className="max-w-48 truncate p-3">{p.allergies || '—'}</td>{(hasPermission('canEditClinicPatients') || hasPermission('canViewClinicPrescriptions')) && <td className="p-3 text-right"><DropdownMenu><DropdownMenuTrigger aria-label={`Actions for ${p.name}`} title="Patient actions"><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger><DropdownMenuContent>{hasPermission('canEditClinicPatients') && <DropdownMenuItem onClick={() => { setEditingPatientId(p.customerId); setPatientForm({ name: p.name || '', phone: p.phone || '', email: p.email || '', address: p.address || '', medicalRecordNo: p.medicalRecordNo || '', dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().slice(0, 10) : '', gender: p.gender || '', bloodGroup: p.bloodGroup || '', allergies: p.allergies || '', emergencyContact: p.emergencyContact || '', emergencyPhone: p.emergencyPhone || '' }) }}>Edit patient</DropdownMenuItem>}{hasPermission('canViewClinicPrescriptions') && <DropdownMenuItem onClick={() => void openPatientMedicationHistory(p.customerId)}>Medication record</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></td>}</tr>)}{!patients.length && <tr><td colSpan={hasPermission('canEditClinicPatients') || hasPermission('canViewClinicPrescriptions') ? 6 : 5} className="p-8 text-center text-muted-foreground">No clinic patients available to this account.</td></tr>}</tbody></table></div></div>
      </div>
      {selectedPatientId && <section className="space-y-3 rounded-md border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Patient medication record</h2><p className="text-sm text-muted-foreground">Prescription fulfillment updates from Pharmacy Management, including quantities supplied and items not supplied.</p></div><Button type="button" variant="outline" onClick={() => setSelectedPatientId('')}>Close</Button></div>{medicationHistoryLoading ? <p className="text-sm text-muted-foreground">Refreshing patient medication record…</p> : patientMedicationHistory.map(rx => <article key={rx.id} className="rounded-md border border-border p-3"><p className="font-medium">{rx.reference} · {new Date(rx.createdAt).toLocaleString()} · {String(rx.status).replaceAll('_', ' ')}</p>{rx.items?.map((item: Row) => <div key={item.id} className="mt-2 border-t border-border pt-2 text-sm"><p><strong>{item.productName}</strong> · prescribed {item.quantity} {item.baseUnit || ''} · supplied {item.dispensedQuantity} · remaining {item.remainingQuantity}</p>{item.fulfillmentHistory?.map((event: Row) => <p key={event.id} className="text-xs text-muted-foreground">{event.outcome === 'dispensed' ? `Supplied ${event.quantityDispensed}` : `Not supplied (${event.outcome.replaceAll('_', ' ')})`}{event.reason ? `: ${event.reason}` : ''}{event.pharmacistName ? ` · ${event.pharmacistName}` : ''} · {new Date(event.createdAt).toLocaleString()}</p>)}{item.legacyDispenses?.map((event: Row) => <p key={event.id} className="text-xs text-muted-foreground">Previously dispensed {event.quantity}{event.pharmacistName ? ` · ${event.pharmacistName}` : ''} · {new Date(event.createdAt).toLocaleString()}</p>)}</div>)}</article>)}{!medicationHistoryLoading && !patientMedicationHistory.length && <p className="text-sm text-muted-foreground">No prescriptions have been recorded for this patient.</p>}</section>}
      </>}
      {tab === 'Appointments' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        {hasPermission('canCreateClinicAppointments') && <form className="space-y-3 rounded-md border border-border p-4" onSubmit={e => { e.preventDefault(); void save('/api/clinic/appointments', appointmentForm, 'Appointment scheduled.') }}><h2 className="font-semibold">Schedule appointment</h2><select required className={inputClass + ' w-full'} value={appointmentForm.customerId} onChange={e => setAppointmentForm({ ...appointmentForm, customerId: e.target.value })}><option value="">Select patient</option>{patients.map(p => <option key={p.customerId} value={p.customerId}>{p.name} · {p.medicalRecordNo}</option>)}</select><Input required type="datetime-local" value={appointmentForm.startsAt} onChange={e => setAppointmentForm({ ...appointmentForm, startsAt: e.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Clinician" value={appointmentForm.providerName} onChange={e => setAppointmentForm({ ...appointmentForm, providerName: e.target.value })} /><Input required placeholder="Visit reason" value={appointmentForm.reason} onChange={e => setAppointmentForm({ ...appointmentForm, reason: e.target.value })} /></div><Textarea placeholder="Scheduling note" value={appointmentForm.notes} onChange={e => setAppointmentForm({ ...appointmentForm, notes: e.target.value })} /><Button className="w-full" disabled={saving}>Schedule</Button></form>}
        <div className="space-y-2">{appointments.map(a => <article key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4"><div><p className="font-medium">{a.patientName} <span className="font-normal text-muted-foreground">· {a.reason}</span></p><p className="mt-1 text-sm text-muted-foreground">{new Date(a.startsAt).toLocaleString()} · {a.providerName || 'Unassigned clinician'}</p></div>{hasPermission('canEditClinicAppointments') && <select className={inputClass} value={a.status} onChange={async e => { try { await request(`/api/clinic/appointments/${a.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: e.target.value }) }); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Could not update appointment.') } }}><option value="scheduled">Scheduled</option><option value="arrived">Arrived</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No show</option></select>}</article>)}{!appointments.length && <div className="rounded-md border border-border p-8 text-center text-muted-foreground">No appointments recorded.</div>}</div>
      </div>}
      {tab === 'Encounters' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
        {hasPermission('canCreateClinicEncounters') && <form className="space-y-3 rounded-md border border-border p-4" onSubmit={e => { e.preventDefault(); void save('/api/clinic/encounters', encounterForm, 'Clinical encounter saved.') }}><h2 className="font-semibold">Record encounter</h2><select required className={inputClass + ' w-full'} value={encounterForm.customerId} onChange={e => setEncounterForm({ ...encounterForm, customerId: e.target.value })}><option value="">Select patient</option>{patients.map(p => <option key={p.customerId} value={p.customerId}>{p.name}</option>)}</select><Input placeholder="Clinician" value={encounterForm.clinicianName} onChange={e => setEncounterForm({ ...encounterForm, clinicianName: e.target.value })} /><Input required placeholder="Chief complaint" value={encounterForm.chiefComplaint} onChange={e => setEncounterForm({ ...encounterForm, chiefComplaint: e.target.value })} /><Textarea placeholder="Assessment" value={encounterForm.assessment} onChange={e => setEncounterForm({ ...encounterForm, assessment: e.target.value })} /><Textarea placeholder="Diagnosis" value={encounterForm.diagnosis} onChange={e => setEncounterForm({ ...encounterForm, diagnosis: e.target.value })} /><Textarea placeholder="Treatment plan" value={encounterForm.treatmentPlan} onChange={e => setEncounterForm({ ...encounterForm, treatmentPlan: e.target.value })} /><Textarea placeholder="Clinical note" value={encounterForm.notes} onChange={e => setEncounterForm({ ...encounterForm, notes: e.target.value })} /><Button className="w-full" disabled={saving}><FilePlus2 className="mr-2 h-4 w-4" />Save encounter</Button></form>}
        <div className="space-y-2">{encounters.map(e => <article key={e.id} className="rounded-md border border-border p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{e.patientName} <span className="font-normal text-muted-foreground">· {e.medicalRecordNo}</span></p><p className="mt-1 text-sm">{e.chiefComplaint}</p></div><time className="shrink-0 text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</time></div><p className="mt-3 text-sm"><strong>Assessment:</strong> {e.assessment || '—'}</p><p className="mt-1 text-sm"><strong>Diagnosis:</strong> {e.diagnosis || '—'}</p><p className="mt-1 text-sm"><strong>Plan:</strong> {e.treatmentPlan || '—'}</p></article>)}{!encounters.length && <div className="rounded-md border border-border p-8 text-center text-muted-foreground">No clinical encounters recorded.</div>}</div>
      </div>}
      {tab === 'Prescriptions' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
        {hasPermission('canCreateClinicPrescriptions') && <form className="space-y-3 rounded-md border border-border p-4" onSubmit={savePrescription}>
          <h2 className="font-semibold">Create prescription</h2>
          <select required className={inputClass + ' w-full'} value={prescriptionForm.customerId} onChange={e => setPrescriptionForm({ ...prescriptionForm, customerId: e.target.value })}><option value="">Select patient</option>{patients.map(p => <option key={p.customerId} value={p.customerId}>{p.name}</option>)}</select>
          <Input placeholder="Prescriber" value={prescriptionForm.prescriberName} onChange={e => setPrescriptionForm({ ...prescriptionForm, prescriberName: e.target.value })} />
          <div className="space-y-3">
            {prescriptionForm.items.map((item, index) => <fieldset key={index} className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-3"><legend className="text-sm font-semibold">Medicine {index + 1}</legend>{prescriptionForm.items.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setPrescriptionForm({ ...prescriptionForm, items: prescriptionForm.items.filter((_, rowIndex) => rowIndex !== index) })}>Remove</Button>}</div>
              <select required className={inputClass + ' w-full'} value={item.productId} onChange={e => setPrescriptionForm({ ...prescriptionForm, items: prescriptionForm.items.map((row, rowIndex) => rowIndex === index ? { ...row, productId: e.target.value } : row) })}><option value="">Select medicine in inventory</option>{medicines.map(m => <option key={m.id} value={m.id}>{m.name} · stock {Number(m.quantity)} {m.baseUnit}</option>)}</select>
              <div className="grid gap-3 sm:grid-cols-2"><Input required aria-label={`Quantity for medicine ${index + 1}`} type="number" min="0.000001" step="any" value={item.quantity} onChange={e => setPrescriptionForm({ ...prescriptionForm, items: prescriptionForm.items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: e.target.value } : row) })} /><Input aria-label={`Dose for medicine ${index + 1}`} placeholder="Dose (e.g. 1 tablet)" value={item.dosage} onChange={e => setPrescriptionForm({ ...prescriptionForm, items: prescriptionForm.items.map((row, rowIndex) => rowIndex === index ? { ...row, dosage: e.target.value } : row) })} /></div>
              <div className="grid gap-3 sm:grid-cols-2"><Input aria-label={`Frequency for medicine ${index + 1}`} placeholder="Frequency" value={item.frequency} onChange={e => setPrescriptionForm({ ...prescriptionForm, items: prescriptionForm.items.map((row, rowIndex) => rowIndex === index ? { ...row, frequency: e.target.value } : row) })} /><Input aria-label={`Duration for medicine ${index + 1}`} type="number" min="1" placeholder="Days" value={item.durationDays} onChange={e => setPrescriptionForm({ ...prescriptionForm, items: prescriptionForm.items.map((row, rowIndex) => rowIndex === index ? { ...row, durationDays: e.target.value } : row) })} /></div>
              <Textarea aria-label={`Directions for medicine ${index + 1}`} placeholder="Directions for this medicine" value={item.instructions} onChange={e => setPrescriptionForm({ ...prescriptionForm, items: prescriptionForm.items.map((row, rowIndex) => rowIndex === index ? { ...row, instructions: e.target.value } : row) })} />
            </fieldset>)}
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={() => setPrescriptionForm({ ...prescriptionForm, items: [...prescriptionForm.items, emptyPrescriptionLine()] })}><Plus className="mr-2 h-4 w-4" />Add another medicine</Button>
          <Textarea placeholder="Prescription note" value={prescriptionForm.notes} onChange={e => setPrescriptionForm({ ...prescriptionForm, notes: e.target.value })} />
          <Button className="w-full" disabled={saving}><Plus className="mr-2 h-4 w-4" />Create prescription</Button>
        </form>}
        <div className="space-y-2">{prescriptions.map(p => <article key={p.id} className="rounded-md border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{p.reference} · {p.patientName}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()} · {p.status}</p></div></div><div className="mt-3 divide-y divide-border">{p.items?.map((item: Row) => <div key={item.id} className="py-2 text-sm"><span className="font-medium">{item.productName}</span> · {item.quantity} · {item.dosage || 'Dose not specified'} · {item.frequency || 'Frequency not specified'} {item.durationDays ? `· ${item.durationDays} days` : ''}</div>)}</div>{p.notes && <p className="mt-2 text-sm text-muted-foreground">{p.notes}</p>}</article>)}{!prescriptions.length && <div className="rounded-md border border-border p-8 text-center text-muted-foreground">No prescriptions recorded.</div>}</div>
      </div>}
    </>}
  </main>
}
