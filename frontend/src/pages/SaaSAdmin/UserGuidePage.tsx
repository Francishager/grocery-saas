import { useState, useEffect, useRef } from 'react'
import { userGuideApi, type UserGuideStep } from '@/lib/api'
import { Plus, Trash2, Upload, X, Image as ImageIcon, ChevronDown, ChevronRight, Pencil, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  'dashboard', 'inventory', 'sales', 'accounting', 'receivables', 'payables',
  'reports', 'fuel', 'restaurant', 'manufacturing', 'agriculture', 'service',
  'staff', 'branches', 'settings', 'subscription', 'offline',
]

export default function UserGuidePage() {
  const [steps, setSteps] = useState<UserGuideStep[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingStep, setEditingStep] = useState<UserGuideStep | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null)

  useEffect(() => { fetchSteps() }, [])

  async function fetchSteps() {
    try {
      setLoading(true)
      const data = await userGuideApi.list()
      setSteps(data)
    } catch (err) {
      console.error('Failed to load guide steps:', err)
    } finally {
      setLoading(false)
    }
  }

  const grouped = steps.reduce<Record<string, UserGuideStep[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {})

  const sortedCategories = Object.keys(grouped).sort()

  function handleFileSelect(id: string) {
    setPendingUploadId(id)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pendingUploadId) return

    setUploadingId(pendingUploadId)
    try {
      const result = await userGuideApi.uploadImage(pendingUploadId, file)
      if (result.step) {
        setSteps(prev => prev.map(s => s.id === result.step.id ? result.step : s))
      }
    } catch (err) {
      console.error('Upload failed:', err)
      alert('Failed to upload image')
    } finally {
      setUploadingId(null)
      setPendingUploadId(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this guide step?')) return
    try {
      await userGuideApi.delete(id)
      setSteps(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      console.error('Delete failed:', err)
      alert('Failed to delete step')
    }
  }

  async function handleDeleteImage(step: UserGuideStep) {
    if (!confirm('Remove the image from this step?')) return
    try {
      const result = await userGuideApi.update(step.id, { imageUrl: null, imagePublicId: null })
      setSteps(prev => prev.map(s => s.id === result.step.id ? result.step : s))
    } catch (err) {
      console.error('Remove image failed:', err)
      alert('Failed to remove image')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Guide Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage step-by-step guides with images for tenant users</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
        >
          <Plus className="h-4 w-4" />
          Add Step
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : sortedCategories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <ImageIcon className="mx-auto h-12 w-12 text-gray-400 mb-3" />
          <p className="text-gray-500">No guide steps yet. Click "Add Step" to create one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedCategories.map(cat => (
            <div key={cat} className="rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition text-left"
              >
                <div className="flex items-center gap-3">
                  {expandedCategory === cat ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                  <span className="font-semibold capitalize">{cat}</span>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                    {grouped[cat].length} step{grouped[cat].length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>

              {expandedCategory === cat && (
                <div className="border-t border-gray-200 divide-y divide-gray-100">
                  {grouped[cat]
                    .sort((a, b) => a.stepNumber - b.stepNumber)
                    .map(step => (
                      <div key={step.id} className="flex items-start gap-4 p-4 hover:bg-gray-50/50">
                        {/* Image section */}
                        <div className="flex-shrink-0">
                          {step.imageUrl ? (
                            <div className="relative group">
                              <img
                                src={step.imageUrl}
                                alt={step.title}
                                className="h-20 w-20 rounded-lg object-cover border"
                              />
                              <button
                                onClick={() => handleDeleteImage(step)}
                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
                                title="Remove image"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleFileSelect(step.id)}
                              disabled={uploadingId === step.id}
                              className="h-20 w-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-blue-500 hover:bg-blue-50 transition"
                            >
                              {uploadingId === step.id ? (
                                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                              ) : (
                                <>
                                  <Upload className="h-5 w-5 text-gray-400 mb-1" />
                                  <span className="text-[10px] text-gray-500">Upload</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Content section */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-blue-600">Step {step.stepNumber}</span>
                            <h4 className="font-medium text-sm text-gray-900">{step.title}</h4>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">{step.description}</p>
                          {step.imageUrl && (
                            <button
                              onClick={() => handleFileSelect(step.id)}
                              disabled={uploadingId === step.id}
                              className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Upload className="h-3 w-3" />
                              Replace image
                            </button>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => setEditingStep(step)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Edit step"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(step.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Delete step"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(showAddModal || editingStep) && (
        <StepModal
          step={editingStep}
          categories={CATEGORIES}
          existingCategories={sortedCategories}
          onClose={() => { setShowAddModal(false); setEditingStep(null) }}
          onSaved={(step, isNew) => {
            if (isNew) {
              setSteps(prev => [...prev, step])
            } else {
              setSteps(prev => prev.map(s => s.id === step.id ? step : s))
            }
            setShowAddModal(false)
            setEditingStep(null)
          }}
        />
      )}
    </div>
  )
}

function StepModal({
  step,
  categories,
  existingCategories,
  onClose,
  onSaved,
}: {
  step: UserGuideStep | null
  categories: string[]
  existingCategories: string[]
  onClose: () => void
  onSaved: (step: UserGuideStep, isNew: boolean) => void
}) {
  const [category, setCategory] = useState(step?.category || '')
  const [stepNumber, setStepNumber] = useState(step?.stepNumber || 1)
  const [title, setTitle] = useState(step?.title || '')
  const [description, setDescription] = useState(step?.description || '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(step?.imageUrl || null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const allCategories = [...new Set([...categories, ...existingCategories])].sort()

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!category || !title || !description) {
      setError('All fields are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      let savedStep: UserGuideStep
      if (step) {
        const result = await userGuideApi.update(step.id, { category, stepNumber, title, description })
        savedStep = result.step
      } else {
        const result = await userGuideApi.create({ category, stepNumber, title, description })
        savedStep = result.step
      }
      // Upload image if one was selected
      if (imageFile) {
        const uploadResult = await userGuideApi.uploadImage(savedStep.id, imageFile)
        if (uploadResult.step) savedStep = uploadResult.step
      }
      onSaved(savedStep, !step)
    } catch (err) {
      console.error('Save failed:', err)
      setError('Failed to save step')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold">{step ? 'Edit Guide Step' : 'Add Guide Step'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input
              list="guide-categories"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. dashboard, inventory, sales"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <datalist id="guide-categories">
              {allCategories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Step Number</label>
            <input
              type="number"
              min={1}
              value={stepNumber}
              onChange={e => setStepNumber(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Step title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detailed description of this step"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Step Image</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Preview" className="h-32 w-32 object-cover rounded-lg border" />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-32 w-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-blue-500 hover:bg-blue-50 transition"
              >
                <Upload className="h-6 w-6 text-gray-400 mb-1" />
                <span className="text-xs text-gray-500">Upload Image</span>
              </button>
            )}
            {imagePreview && !imageFile && step?.imageUrl && (
              <p className="text-xs text-gray-400 mt-1">Current image. Select a new file to replace.</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {step ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
