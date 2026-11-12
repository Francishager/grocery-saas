import type { CartItem, SaleServiceJob } from '@/lib/api'
import { Input } from '@/components/ui/input'

export interface SaleTechnician { id: string; name: string; userId?: string | null }

export default function SaleServiceJobsEditor({ item, technicians, currentUserId, disabled, onChange }: {
  item: CartItem; technicians: SaleTechnician[]; currentUserId?: string; disabled: boolean; onChange: (jobs: SaleServiceJob[]) => void
}) {
  const services = item.itemType === 'service'
    ? [{ id: String(item.productId), name: item.name, description: item.includedServices?.[0]?.description || item.name }]
    : item.includedServices || []
  const jobs = item.serviceJobs || []
  const update = (serviceProductId: string, patch: Partial<SaleServiceJob>) => onChange(jobs.map(job => job.serviceProductId === serviceProductId ? { ...job, ...patch } : job))
  return <fieldset disabled={disabled} className="col-span-full w-full min-w-0 space-y-3 text-left">
    {services.map(service => {
      const job = jobs.find(value => value.serviceProductId === service.id)
      return <div key={service.id} className="space-y-2 border-t pt-2">
        <label className="flex gap-2 items-start text-sm font-medium">
          <input type="checkbox" className="mt-1 shrink-0" checked={!!job} onChange={e => onChange(e.target.checked ? [...jobs, {
            serviceProductId: service.id, technicianId: technicians.find(tech => tech.userId === currentUserId)?.id || '',
            description: service.description || service.name, priority: 'normal', scheduledStart: '',
          }] : jobs.filter(value => value.serviceProductId !== service.id))} />
          <span className="min-w-0 break-words">Job card: {service.name}{item.itemType !== 'service' && ' (included free)'}</span>
        </label>
        {job && <div className="grid gap-2 min-w-0">
          <label className="text-sm">Assigned technician *<select aria-label={`Technician for ${service.name}`} className="mt-1 w-full min-w-0 rounded-md border bg-background p-2" value={job.technicianId} onChange={e => update(service.id, { technicianId: e.target.value })}>
            <option value="">Select technician</option>{technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
          </select></label>
          {technicians.length === 0 && <p className="text-xs text-red-600">No available technician. Check technician profiles and assignment permissions.</p>}
          <label className="text-sm">Job details *<textarea aria-label={`Job details for ${service.name}`} rows={3} maxLength={4000} className="mt-1 w-full min-w-0 rounded-md border bg-background p-2" value={job.description} onChange={e => update(service.id, { description: e.target.value })} /></label>
          <label className="text-sm">Priority<select className="mt-1 w-full rounded-md border bg-background p-2" value={job.priority} onChange={e => update(service.id, { priority: e.target.value })}>
            {['low', 'normal', 'high', 'urgent'].map(priority => <option key={priority} value={priority}>{priority}</option>)}
          </select></label>
          <label className="text-sm">Scheduled start<Input type="datetime-local" className="mt-1 min-w-0 max-w-full" value={job.scheduledStart || ''} onChange={e => update(service.id, { scheduledStart: e.target.value })} /></label>
        </div>}
      </div>
    })}
  </fieldset>
}
