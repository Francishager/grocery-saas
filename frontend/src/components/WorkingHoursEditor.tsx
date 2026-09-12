import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type WorkingHours = {
  enabled: boolean
  days: { day: number; enabled: boolean; allDay: boolean; start: string; end: string }[]
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const defaultWorkingHours = (): WorkingHours => ({
  enabled: false,
  days: DAYS.map((_, day) => ({ day, enabled: day !== 0, allDay: false, start: '08:00', end: '18:00' })),
})

export default function WorkingHoursEditor({ value, onChange, timezone, custom = false, disabled = false }: {
  value: WorkingHours | null | undefined
  onChange: (value: WorkingHours | null) => void
  timezone: string
  custom?: boolean
  disabled?: boolean
}) {
  const id = useId()
  const schedule = value || defaultWorkingHours()
  const enabled = custom ? Boolean(value) : schedule.enabled
  const updateDay = (day: number, changes: Partial<WorkingHours['days'][number]>) => onChange({
    ...schedule, enabled: true, days: schedule.days.map((item) => item.day === day ? { ...item, ...changes } : item),
  })
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 border-t pt-4">
    <legend className="text-base font-semibold">{custom ? 'Custom Working Hours' : 'Staff Working Hours'}</legend>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex min-h-10 items-center gap-3 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={enabled} onChange={(event) => onChange(custom && !event.target.checked ? null : { ...schedule, enabled: event.target.checked })} />
        {custom ? 'Use custom working hours' : 'Restrict staff access to working hours'}
      </label>
      <span className="break-words text-xs text-muted-foreground">Timezone: {timezone}</span>
    </div>
    {!enabled && <p className="text-sm text-muted-foreground">{custom ? 'Access schedule: business working hours' : 'Staff access: unrestricted'}</p>}
    {enabled && <div className="divide-y">
      {schedule.days.map((day) => <div key={day.day} className="grid min-w-0 gap-3 py-3 sm:grid-cols-[minmax(120px,1fr)_minmax(0,2fr)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex min-h-10 items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4" checked={day.enabled} onChange={(event) => updateDay(day.day, { enabled: event.target.checked })} />{DAYS[day.day]}</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!day.enabled || disabled} checked={day.allDay} onChange={(event) => updateDay(day.day, { allDay: event.target.checked })} aria-label={`${DAYS[day.day]} 24 hours`} />24 hours</label>
        </div>
        {day.enabled ? <div className="min-w-0">
          {!day.allDay && <div className="grid min-w-0 grid-cols-2 gap-3">
            <div className="min-w-0"><Label className="text-xs" htmlFor={`${id}-${day.day}-start`}>Opening</Label><Input id={`${id}-${day.day}-start`} aria-label={`${DAYS[day.day]} opening`} className="w-full min-w-0" type="time" value={day.start} onChange={(event) => updateDay(day.day, { start: event.target.value })} /></div>
            <div className="min-w-0"><Label className="text-xs" htmlFor={`${id}-${day.day}-end`}>Closing</Label><Input id={`${id}-${day.day}-end`} aria-label={`${DAYS[day.day]} closing`} className="w-full min-w-0" type="time" value={day.end} onChange={(event) => updateDay(day.day, { end: event.target.value })} /></div>
          </div>}
          {!day.allDay && day.end < day.start && <p className="mt-1 text-xs text-muted-foreground">Closes next day</p>}
          {day.allDay && <p className="pt-2 text-sm text-muted-foreground">All day</p>}
        </div> : <p className="self-center text-sm text-muted-foreground">Closed</p>}
      </div>)}
    </div>}
  </fieldset>
}
