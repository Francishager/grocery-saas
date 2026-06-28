import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { Bell, Send, CheckCheck, Mail, MessageSquare, Smartphone } from 'lucide-react'

interface Notification {
  id: string
  channel: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
}

export default function CommunicationPage() {
  const { toast } = useToast()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showBroadcast, setShowBroadcast] = useState(false)

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState('in_app')
  const [type, setType] = useState('info')

  const fetchNotifications = async () => {
    try {
      const res = await apiFetch('/api/notifications')
      if (res.ok) setNotifications(await res.json())
    } catch (err) { /* ignore */ }
    finally { setLoading(false) }
  }

  const fetchUnread = async () => {
    try {
      const res = await apiFetch('/api/notifications/unread-count')
      if (res.ok) {
        const data = await res.json()
        setUnreadCount(data.count)
      }
    } catch (err) { /* ignore */ }
  }

  useEffect(() => {
    fetchNotifications()
    fetchUnread()
  }, [])

  const handleMarkRead = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' })
      fetchNotifications()
      fetchUnread()
    } catch (err) { /* ignore */ }
  }

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PUT' })
      fetchNotifications()
      fetchUnread()
      toast({ title: 'All notifications marked as read' })
    } catch (err) { /* ignore */ }
  }

  const handleBroadcast = async () => {
    if (!title || !message) return toast({ variant: 'destructive', title: 'Title and message required' })
    try {
      const res = await apiFetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, title, message, type, targetAll: true }),
      })
      if (res.ok) {
        const data = await res.json()
        toast({ title: data.message })
        setShowBroadcast(false)
        setTitle(''); setMessage('')
        fetchNotifications()
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to send broadcast' })
    }
  }

  const channelIcon: Record<string, React.ReactNode> = {
    in_app: <Bell className="h-4 w-4" />,
    sms: <Smartphone className="h-4 w-4" />,
    email: <Mail className="h-4 w-4" />,
    whatsapp: <MessageSquare className="h-4 w-4" />,
  }

  const typeColor: Record<string, string> = {
    info: 'bg-blue-100 text-blue-800',
    warning: 'bg-yellow-100 text-yellow-800',
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Communication</h1>
          <p className="text-muted-foreground">Notifications, broadcasts, and messaging</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleMarkAllRead}><CheckCheck className="h-4 w-4 mr-2" /> Mark All Read</Button>
          <Dialog open={showBroadcast} onOpenChange={setShowBroadcast}>
            <DialogTrigger asChild><Button><Send className="h-4 w-4 mr-2" /> Broadcast</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Send Broadcast</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                <div><Label>Message</Label><Input value={message} onChange={(e) => setMessage(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Channel</Label>
                    <Select value={channel} onValueChange={setChannel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_app">In-App</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setShowBroadcast(false)}>Cancel</Button><Button onClick={handleBroadcast}>Send</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Bell className="h-4 w-4" /> Total Notifications</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{notifications.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Unread</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-yellow-600">{unreadCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Read</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{notifications.length - unreadCount}</div></CardContent></Card>
      </div>

      <div className="space-y-2">
        {notifications.map((notif) => (
          <div key={notif.id} className={`flex items-start justify-between rounded-lg border p-4 ${!notif.isRead ? 'border-primary/30 bg-primary/5' : ''}`}>
            <div className="flex items-start gap-3 flex-1">
              <div className="mt-1">{channelIcon[notif.channel] || <Bell className="h-4 w-4" />}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{notif.title}</p>
                  <Badge className={typeColor[notif.type] || 'bg-gray-100'}>{notif.type}</Badge>
                  {!notif.isRead && <Badge variant="default">New</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{notif.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(notif.createdAt).toLocaleString()}</p>
              </div>
            </div>
            {!notif.isRead && <Button size="sm" variant="ghost" onClick={() => handleMarkRead(notif.id)}>Mark Read</Button>}
          </div>
        ))}
        {notifications.length === 0 && !loading && <div className="text-center py-8 text-muted-foreground">No notifications</div>}
      </div>
    </div>
  )
}
