import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { Bell, Send, CheckCheck, Mail, MessageSquare, Smartphone, Search, Trash2, Filter, Users, Radio, Clock, Inbox } from 'lucide-react'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalNotifications } from '@/db/hybrid'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'

interface Notification {
  id: string
  channel: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
  userId?: string | null
}

const CHANNELS = [
  { id: 'in_app', label: 'In-App', icon: Bell, color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'sms', label: 'SMS', icon: Smartphone, color: 'text-green-600', bg: 'bg-green-50' },
  { id: 'email', label: 'Email', icon: Mail, color: 'text-purple-600', bg: 'bg-purple-50' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-600', bg: 'bg-emerald-50' },
]

const TYPES = [
  { id: 'info', label: 'Info', color: 'bg-blue-100 text-blue-800' },
  { id: 'warning', label: 'Warning', color: 'bg-yellow-100 text-yellow-800' },
  { id: 'success', label: 'Success', color: 'bg-green-100 text-green-800' },
  { id: 'error', label: 'Error', color: 'bg-red-100 text-red-800' },
]

const TEMPLATES = [
  { id: 'welcome', name: 'Welcome Message', subject: 'Welcome to our platform!', body: 'Thank you for joining us. We are excited to have you on board.' },
  { id: 'promotion', name: 'Promotional Offer', subject: 'Special Offer Just for You!', body: 'We have an exclusive deal available for a limited time. Don\'t miss out!' },
  { id: 'reminder', name: 'Payment Reminder', subject: 'Payment Reminder', body: 'This is a friendly reminder regarding your upcoming payment.' },
  { id: 'receipt', name: 'Receipt Confirmation', subject: 'Payment Received', body: 'We have received your payment. Thank you for your business.' },
  { id: 'alert', name: 'System Alert', subject: 'Important System Update', body: 'Please be aware of an important system update that may affect your account.' },
]

export default function CommunicationPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [activeTab, setActiveTab] = useState('inbox')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterChannel, setFilterChannel] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterRead, setFilterRead] = useState('all')

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState('in_app')
  const [type, setType] = useState('info')
  const [selectedTemplate, setSelectedTemplate] = useState('')

  const fetchNotifications = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/notifications')
        if (res.ok) setNotifications(await res.json())
      } else {
        setNotifications(await getLocalNotifications() as any)
      }
    } catch (err) {
      try { setNotifications(await getLocalNotifications() as any) } catch {}
    }
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
        setTitle(''); setMessage(''); setSelectedTemplate('')
        fetchNotifications()
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to send broadcast' })
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    const tpl = TEMPLATES.find(t => t.id === templateId)
    if (tpl) {
      setSelectedTemplate(templateId)
      setTitle(tpl.subject)
      setMessage(tpl.body)
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

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (searchQuery && !n.title.toLowerCase().includes(searchQuery.toLowerCase()) && !n.message.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (filterChannel !== 'all' && n.channel !== filterChannel) return false
      if (filterType !== 'all' && n.type !== filterType) return false
      if (filterRead === 'unread' && n.isRead) return false
      if (filterRead === 'read' && !n.isRead) return false
      return true
    })
  }, [notifications, searchQuery, filterChannel, filterType, filterRead])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage } = usePagination(filteredNotifications, 10)

  const channelStats = useMemo(() => {
    const stats: Record<string, number> = {}
    notifications.forEach(n => { stats[n.channel] = (stats[n.channel] || 0) + 1 })
    return stats
  }, [notifications])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Communication Center</h1>
          <p className="text-muted-foreground">Notifications, broadcasts, templates, and messaging</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleMarkAllRead}><CheckCheck className="h-4 w-4 mr-2" /> Mark All Read</Button>
          <Dialog open={showBroadcast} onOpenChange={setShowBroadcast}>
            <DialogTrigger asChild><Button><Send className="h-4 w-4 mr-2" /> New Broadcast</Button></DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader><DialogTitle>Send Broadcast Message</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Quick Template</Label>
                  <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                    <SelectTrigger><SelectValue placeholder="Select a template (optional)" /></SelectTrigger>
                    <SelectContent>
                      {TEMPLATES.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Broadcast title" /></div>
                <div><Label>Message</Label><textarea className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Broadcast message content" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Channel</Label>
                    <Select value={channel} onValueChange={setChannel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>This broadcast will be sent to all active users in your business.</span>
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setShowBroadcast(false)}>Cancel</Button><Button onClick={handleBroadcast}><Send className="h-4 w-4 mr-2" /> Send Broadcast</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Inbox className="h-4 w-4" /> Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{notifications.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Bell className="h-4 w-4" /> Unread</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-yellow-600">{unreadCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><CheckCheck className="h-4 w-4" /> Read</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{notifications.length - unreadCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Radio className="h-4 w-4" /> Broadcasts Sent</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{notifications.filter(n => !n.userId).length}</div></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inbox"><Inbox className="h-4 w-4 mr-2" /> Inbox</TabsTrigger>
          <TabsTrigger value="by-channel"><Filter className="h-4 w-4 mr-2" /> By Channel</TabsTrigger>
          <TabsTrigger value="templates"><Mail className="h-4 w-4 mr-2" /> Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search notifications..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Channel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {CHANNELS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterRead} onValueChange={setFilterRead}>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {paginatedItems.map((notif) => {
              const ch = CHANNELS.find(c => c.id === notif.channel)
              return (
                <div key={notif.id} className={`flex items-start justify-between rounded-lg border p-4 transition ${!notif.isRead ? 'border-primary/30 bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`mt-0.5 h-9 w-9 rounded-lg ${ch?.bg || 'bg-muted'} flex items-center justify-center ${ch?.color || 'text-muted-foreground'}`}>{channelIcon[notif.channel] || <Bell className="h-4 w-4" />}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{notif.title}</p>
                        <Badge className={typeColor[notif.type] || 'bg-gray-100'}>{notif.type}</Badge>
                        {ch && <Badge variant="outline" className="text-xs">{ch.label}</Badge>}
                        {!notif.isRead && <Badge variant="default">New</Badge>}
                        {!notif.userId && <Badge variant="secondary" className="text-xs"><Radio className="h-3 w-3 mr-1" /> Broadcast</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{notif.message}</p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(notif.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  {!notif.isRead && <Button size="sm" variant="ghost" onClick={() => handleMarkRead(notif.id)}>Mark Read</Button>}
                </div>
              )
            })}
            {filteredNotifications.length === 0 && !loading && <div className="text-center py-12 text-muted-foreground"><Inbox className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No notifications found</p></div>}
          </div>

          {totalItems > 10 && <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={goToPage} totalItems={totalItems} />}
        </TabsContent>

        <TabsContent value="by-channel" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {CHANNELS.map(ch => {
              const channelNotifs = notifications.filter(n => n.channel === ch.id)
              const channelUnread = channelNotifs.filter(n => !n.isRead).length
              return (
                <Card key={ch.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg ${ch.bg} flex items-center justify-center ${ch.color}`}><ch.icon className="h-5 w-5" /></div>
                        <div>
                          <CardTitle className="text-base">{ch.label}</CardTitle>
                          <p className="text-sm text-muted-foreground">{channelNotifs.length} messages{channelUnread > 0 && ` (${channelUnread} unread)`}</p>
                        </div>
                      </div>
                      <Badge variant={channelNotifs.length > 0 ? 'default' : 'secondary'}>{channelNotifs.length > 0 ? 'Active' : 'Empty'}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {channelNotifs.slice(0, 5).map(n => (
                        <div key={n.id} className={`rounded-lg border p-3 ${!n.isRead ? 'border-primary/20 bg-primary/5' : ''}`}>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium truncate">{n.title}</p>
                            <Badge className={typeColor[n.type] || 'bg-gray-100'}>{n.type}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                        </div>
                      ))}
                      {channelNotifs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No messages in this channel</p>}
                      {channelNotifs.length > 5 && <p className="text-xs text-center text-muted-foreground pt-2">+ {channelNotifs.length - 5} more in inbox</p>}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {TEMPLATES.map(tpl => (
              <Card key={tpl.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> {tpl.name}</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => { setActiveTab('inbox'); setShowBroadcast(true); handleTemplateSelect(tpl.id) }}><Send className="h-3 w-3 mr-1" /> Use</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div><p className="text-xs font-semibold text-muted-foreground uppercase">Subject</p><p className="text-sm">{tpl.subject}</p></div>
                    <div><p className="text-xs font-semibold text-muted-foreground uppercase">Body</p><p className="text-sm text-muted-foreground">{tpl.body}</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
