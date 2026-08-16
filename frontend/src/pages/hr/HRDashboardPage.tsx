import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Building2,
  Users,
  Briefcase,
  FileText,
  Settings,
  BarChart3,
  ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface HRModule {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  route: string
  badge?: string
}

export default function HRDashboardPage() {
  const navigate = useNavigate()

  const modules: HRModule[] = [
    {
      id: 'departments',
      title: 'Departments',
      description: 'Manage organizational structure and departments',
      icon: <Building2 className="h-6 w-6" />,
      route: '/tenant/hr/departments',
      badge: 'Core',
    },
    {
      id: 'positions',
      title: 'Positions',
      description: 'Manage job positions and salary ranges',
      icon: <Briefcase className="h-6 w-6" />,
      route: '/tenant/hr/positions',
      badge: 'Core',
    },
    {
      id: 'employees',
      title: 'Employees',
      description: 'Manage employee profiles and information',
      icon: <Users className="h-6 w-6" />,
      route: '/tenant/hr/employees',
      badge: 'Core',
    },
    {
      id: 'units-teams',
      title: 'Units & Teams',
      description: 'Organize employees into units and teams',
      icon: <BarChart3 className="h-6 w-6" />,
      route: '/tenant/hr/units-teams',
      badge: 'Core',
    },
    {
      id: 'contracts',
      title: 'Contracts',
      description: 'Manage employment contracts and agreements',
      icon: <FileText className="h-6 w-6" />,
      route: '/tenant/hr/contracts',
      badge: 'Core',
    },
    {
      id: 'documents',
      title: 'Documents',
      description: 'Manage employee documents with expiry tracking',
      icon: <FileText className="h-6 w-6" />,
      route: '/tenant/hr/documents',
      badge: 'Core',
    },
    {
      id: 'settings',
      title: 'HR Settings',
      description: 'Configure features and permissions',
      icon: <Settings className="h-6 w-6" />,
      route: '/tenant/hr/settings',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight">HR Management</h1>
        <p className="text-lg text-muted-foreground mt-2">
          Complete employee lifecycle management system
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Phase 1 Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">7/7</div>
            <p className="text-xs text-gray-500">Modules Complete</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div className="bg-green-600 h-2 rounded-full" style={{ width: '100%' }}></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Phase 1 Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Core HR</div>
            <p className="text-xs text-gray-500">Org Structure & Employees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Coming Next</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Phase 2</div>
            <p className="text-xs text-gray-500">Attendance & Leave</p>
          </CardContent>
        </Card>
      </div>

      {/* Module Grid */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Phase 1: HR Core</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => (
            <Card
              key={module.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(module.route)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                      {module.icon}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{module.title}</CardTitle>
                      {module.badge && (
                        <span className="text-xs font-semibold px-2 py-1 bg-indigo-100 text-indigo-700 rounded mt-1 inline-block">
                          {module.badge}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{module.description}</CardDescription>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4 w-full justify-between"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(module.route)
                  }}
                >
                  Access
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Info Section */}
      <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
        <CardHeader>
          <CardTitle>Phase 1 Implementation Complete</CardTitle>
          <CardDescription>HR Core foundation is now ready for production use</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <span className="text-green-600">✓</span> Database schema with 10 new HR models
            </p>
            <p className="flex items-center gap-2">
              <span className="text-green-600">✓</span> 11 backend services for HR operations
            </p>
            <p className="flex items-center gap-2">
              <span className="text-green-600">✓</span> 55+ API endpoints for all HR functions
            </p>
            <p className="flex items-center gap-2">
              <span className="text-green-600">✓</span> 7 frontend management pages
            </p>
            <p className="flex items-center gap-2">
              <span className="text-green-600">✓</span> Multi-tenant, feature-gated architecture
            </p>
            <p className="flex items-center gap-2">
              <span className="text-green-600">✓</span> Role-based access control (RBAC)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Roadmap */}
      <Card>
        <CardHeader>
          <CardTitle>HR Implementation Roadmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-white font-semibold text-sm flex-shrink-0">
                ✓
              </div>
              <div>
                <h4 className="font-semibold">Phase 1: HR Core (Complete)</h4>
                <p className="text-sm text-gray-600">
                  Org structure, employee management, contracts, documents
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-300 text-gray-700 font-semibold text-sm flex-shrink-0">
                2
              </div>
              <div>
                <h4 className="font-semibold">Phase 2: Workforce Management</h4>
                <p className="text-sm text-gray-600">
                  Attendance, shifts, leave requests, overtime tracking
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-300 text-gray-700 font-semibold text-sm flex-shrink-0">
                3
              </div>
              <div>
                <h4 className="font-semibold">Phase 3: Payroll & Loans</h4>
                <p className="text-sm text-gray-600">
                  Payroll processing, salary advances, loans, payslips
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-300 text-gray-700 font-semibold text-sm flex-shrink-0">
                4
              </div>
              <div>
                <h4 className="font-semibold">Phase 4: Performance & Training</h4>
                <p className="text-sm text-gray-600">
                  Performance reviews, training programs, skill development
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-300 text-gray-700 font-semibold text-sm flex-shrink-0">
                5
              </div>
              <div>
                <h4 className="font-semibold">Phase 5: Exit & Compliance</h4>
                <p className="text-sm text-gray-600">
                  Separation workflows, exit interviews, compliance reporting
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
