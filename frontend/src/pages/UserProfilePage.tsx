import { useState, useRef } from 'react'
import { User, Camera, Lock, Save, Loader2 } from 'lucide-react'
import { authApi } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function UserProfilePage() {
  const { user, updateUser } = useJWTAuth()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({
    fname: user?.fname || '',
    lname: user?.lname || '',
    phone: user?.phone || '',
    email: user?.email || '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Max 2MB' })
      return
    }

    setUploading(true)
    try {
      const result = await authApi.uploadAvatar(file)
      if (result.avatar) {
        updateUser({ avatar: result.avatar })
        toast({ title: 'Avatar updated' })
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err?.message })
    } finally {
      setUploading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const result = await authApi.updateProfile({
        fname: form.fname,
        lname: form.lname,
        phone: form.phone,
      })
      if (result.user) {
        updateUser({
          name: `${result.user.fname || ''} ${result.user.lname || ''}`.trim(),
          fname: result.user.fname,
          lname: result.user.lname,
          avatar: result.user.avatar,
        })
      }
      toast({ title: 'Profile updated' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to update', description: err?.message })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ variant: 'destructive', title: 'Passwords do not match' })
      return
    }
    if (passwordForm.newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'Minimum 6 characters' })
      return
    }

    setSaving(true)
    try {
      await authApi.changePassword(passwordForm.currentPassword, passwordForm.newPassword)
      toast({ title: 'Password changed successfully' })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to change password', description: err?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      {/* Avatar Section */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" />Profile Photo</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative">
              {user?.avatar ? (
                <img src={user.avatar} alt="Avatar" className="h-24 w-24 rounded-full object-cover border-2 border-muted" />
              ) : (
                <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold border-2 border-muted">
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </div>
            <div>
              <p className="text-sm font-medium">{user?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              <p className="text-xs capitalize text-muted-foreground mt-1">{user?.role}</p>
              <p className="text-xs text-muted-foreground mt-2">Click the camera icon to upload a new photo</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Info */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Personal Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={form.fname} onChange={(e) => setForm(f => ({ ...f, fname: e.target.value }))} placeholder="First name" />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={form.lname} onChange={(e) => setForm(f => ({ ...f, lname: e.target.value }))} placeholder="Last name" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={form.email} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+256..." type="tel" />
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Changes</>}
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />Change Password</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Current Password</Label>
            <Input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="Enter current password" />
          </div>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Min 6 characters" />
          </div>
          <div className="space-y-2">
            <Label>Confirm New Password</Label>
            <Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Re-enter new password" />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={saving || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
          >
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Changing...</> : <><Lock className="h-4 w-4 mr-2" />Change Password</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
