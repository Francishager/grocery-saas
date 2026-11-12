import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Star } from 'lucide-react'

type FeedbackDetails = { businessName: string; logo?: string | null; service: { name: string; description?: string } }

export default function PublicServiceFeedbackPage() {
  const { token } = useParams()
  const [details, setDetails] = useState<FeedbackDetails | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [rating, setRating] = useState(0)
  const [wouldRecommend, setWouldRecommend] = useState(true)
  const endpoint = `/api/service/public-feedback/${encodeURIComponent(token || '')}`

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setSubmitted(false)
    api.get<FeedbackDetails>(endpoint, { skipAuth: true })
      .then(data => { if (active) setDetails(data) })
      .catch(() => { if (active) setError('This feedback form is unavailable. Please ask the business for a new QR code.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [endpoint])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!rating) { setError('Please select a rating.'); return }
    setSaving(true)
    setError('')
    try {
      await api.post(endpoint, { skipAuth: true, body: { customerName: name.trim(), rating, comment: comment.trim(), wouldRecommend } })
      setSubmitted(true)
    } catch {
      setError('Your feedback could not be sent. Please try again.')
    } finally { setSaving(false) }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 sm:py-12">
      <div className="mx-auto w-full max-w-lg space-y-6">
        {loading ? <p role="status">Loading feedback form...</p> : details ? <>
          <header className="space-y-3 border-b pb-6 text-center">
            {details.logo && <img src={details.logo} alt="" className="mx-auto h-20 max-w-full object-contain" />}
            <h1 className="break-words text-2xl font-bold">{details.businessName}</h1>
            <p className="break-words font-medium">{details.service.name}</p>
          </header>
          {submitted ? <div role="status" className="space-y-3 py-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-green-700" /><h2 className="text-xl font-semibold">Thank you for your feedback</h2><p>Your response has been sent to {details.businessName}.</p></div> : <form onSubmit={submit} className="space-y-6">
            <h2 className="text-xl font-semibold">Add Customer Feedback</h2>
            <div className="space-y-2"><Label htmlFor="feedback-name">Your name</Label><Input id="feedback-name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} autoComplete="name" /></div>
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Your experience</legend><div className="flex gap-2" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} out of 5 stars`} onClick={() => setRating(value)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-700"><Star className={value <= rating ? 'h-6 w-6 fill-amber-400 text-amber-600' : 'h-6 w-6 text-gray-400'} /></button>)}</div></fieldset>
            <div className="space-y-2"><Label htmlFor="feedback-comment">Comments (optional)</Label><textarea id="feedback-comment" value={comment} onChange={e => setComment(e.target.value)} maxLength={4000} rows={5} className="w-full resize-y rounded-md border border-gray-300 bg-white p-3 text-base" /></div>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={wouldRecommend} onChange={e => setWouldRecommend(e.target.checked)} className="h-5 w-5" />I would recommend this business</label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving || !name.trim()}>{saving ? 'Sending...' : 'Send Feedback'}</Button>
          </form>}
        </> : <p role="alert" className="text-red-700">{error}</p>}
      </div>
    </main>
  )
}
