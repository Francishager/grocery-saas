export const LEGACY_SERVICE_PERMISSION_KEYS = ['canViewServiceBusiness', 'canCreateServiceBusiness', 'canEditServiceBusiness', 'canDeleteServiceBusiness', 'canViewServiceBusinessReport'];
export const SERVICE_PERMISSION_DEFINITIONS = [
  {
    "id": "canViewServiceAppointment",
    "name": "View appointments",
    "description": "Read appointments without permission to create, edit, delete, or change status.",
    "category": "service_appointments",
    "tab": "appointments",
    "action": "View",
    "feature": "service.appointments"
  },
  {
    "id": "canCreateServiceAppointment",
    "name": "Create appointments",
    "description": "Allow this action for appointments only. Other service tasks require their own permissions.",
    "category": "service_appointments",
    "tab": "appointments",
    "action": "Create",
    "feature": "service.appointments"
  },
  {
    "id": "canEditServiceAppointment",
    "name": "Edit details of appointments",
    "description": "Allow this action for appointments only. Other service tasks require their own permissions.",
    "category": "service_appointments",
    "tab": "appointments",
    "action": "Edit",
    "feature": "service.appointments"
  },
  {
    "id": "canDeleteServiceAppointment",
    "name": "Delete appointments",
    "description": "Allow this action for appointments only. Other service tasks require their own permissions.",
    "category": "service_appointments",
    "tab": "appointments",
    "action": "Delete",
    "feature": "service.appointments"
  },
  {
    "id": "canUpdateServiceAppointmentStatus",
    "name": "Change status of appointments",
    "description": "Allow this action for appointments only. Other service tasks require their own permissions.",
    "category": "service_appointments",
    "tab": "appointments",
    "action": "UpdateStatus",
    "feature": "service.appointments"
  },
  {
    "id": "canAssignServiceAppointment",
    "name": "Assign technicians to appointments",
    "description": "Allow this action for appointments only. Other service tasks require their own permissions.",
    "category": "service_appointments",
    "tab": "appointments",
    "action": "Assign",
    "feature": "service.appointments"
  },
  {
    "id": "canViewServiceAppointmentReport",
    "name": "View reports for appointments",
    "description": "Allow this action for appointments only. Other service tasks require their own permissions.",
    "category": "service_appointments",
    "tab": "appointments",
    "action": "Report",
    "feature": "service.appointments"
  },
  {
    "id": "canViewServiceWorkOrder",
    "name": "View work orders",
    "description": "Read work orders without permission to create, edit, delete, or change status.",
    "category": "service_work_orders",
    "tab": "work-orders",
    "action": "View",
    "feature": "service.work_orders"
  },
  {
    "id": "canCreateServiceWorkOrder",
    "name": "Create work orders",
    "description": "Allow this action for work orders only. Other service tasks require their own permissions.",
    "category": "service_work_orders",
    "tab": "work-orders",
    "action": "Create",
    "feature": "service.work_orders"
  },
  {
    "id": "canEditServiceWorkOrder",
    "name": "Edit details of work orders",
    "description": "Allow this action for work orders only. Other service tasks require their own permissions.",
    "category": "service_work_orders",
    "tab": "work-orders",
    "action": "Edit",
    "feature": "service.work_orders"
  },
  {
    "id": "canDeleteServiceWorkOrder",
    "name": "Delete work orders",
    "description": "Allow this action for work orders only. Other service tasks require their own permissions.",
    "category": "service_work_orders",
    "tab": "work-orders",
    "action": "Delete",
    "feature": "service.work_orders"
  },
  {
    "id": "canUpdateServiceWorkOrderStatus",
    "name": "Change status of work orders",
    "description": "Allow this action for work orders only. Other service tasks require their own permissions.",
    "category": "service_work_orders",
    "tab": "work-orders",
    "action": "UpdateStatus",
    "feature": "service.work_orders"
  },
  {
    "id": "canAssignServiceWorkOrder",
    "name": "Assign technicians to work orders",
    "description": "Allow this action for work orders only. Other service tasks require their own permissions.",
    "category": "service_work_orders",
    "tab": "work-orders",
    "action": "Assign",
    "feature": "service.work_orders"
  },
  {
    "id": "canViewServiceWorkOrderReport",
    "name": "View reports for work orders",
    "description": "Allow this action for work orders only. Other service tasks require their own permissions.",
    "category": "service_work_orders",
    "tab": "work-orders",
    "action": "Report",
    "feature": "service.work_orders"
  },
  {
    "id": "canViewServiceContract",
    "name": "View contracts",
    "description": "Read contracts without permission to create, edit, delete, or change status.",
    "category": "service_contracts",
    "tab": "contracts",
    "action": "View",
    "feature": "service.contracts"
  },
  {
    "id": "canCreateServiceContract",
    "name": "Create contracts",
    "description": "Allow this action for contracts only. Other service tasks require their own permissions.",
    "category": "service_contracts",
    "tab": "contracts",
    "action": "Create",
    "feature": "service.contracts"
  },
  {
    "id": "canEditServiceContract",
    "name": "Edit details of contracts",
    "description": "Allow this action for contracts only. Other service tasks require their own permissions.",
    "category": "service_contracts",
    "tab": "contracts",
    "action": "Edit",
    "feature": "service.contracts"
  },
  {
    "id": "canDeleteServiceContract",
    "name": "Delete contracts",
    "description": "Allow this action for contracts only. Other service tasks require their own permissions.",
    "category": "service_contracts",
    "tab": "contracts",
    "action": "Delete",
    "feature": "service.contracts"
  },
  {
    "id": "canUpdateServiceContractStatus",
    "name": "Change status of contracts",
    "description": "Allow this action for contracts only. Other service tasks require their own permissions.",
    "category": "service_contracts",
    "tab": "contracts",
    "action": "UpdateStatus",
    "feature": "service.contracts"
  },
  {
    "id": "canViewServiceContractReport",
    "name": "View reports for contracts",
    "description": "Allow this action for contracts only. Other service tasks require their own permissions.",
    "category": "service_contracts",
    "tab": "contracts",
    "action": "Report",
    "feature": "service.contracts"
  },
  {
    "id": "canViewServiceTechnician",
    "name": "View technicians",
    "description": "Read technicians without permission to create, edit, delete, or change status.",
    "category": "service_technicians",
    "tab": "technicians",
    "action": "View",
    "feature": "service.technicians"
  },
  {
    "id": "canCreateServiceTechnician",
    "name": "Create technicians",
    "description": "Allow this action for technicians only. Other service tasks require their own permissions.",
    "category": "service_technicians",
    "tab": "technicians",
    "action": "Create",
    "feature": "service.technicians"
  },
  {
    "id": "canEditServiceTechnician",
    "name": "Edit details of technicians",
    "description": "Allow this action for technicians only. Other service tasks require their own permissions.",
    "category": "service_technicians",
    "tab": "technicians",
    "action": "Edit",
    "feature": "service.technicians"
  },
  {
    "id": "canDeleteServiceTechnician",
    "name": "Delete technicians",
    "description": "Allow this action for technicians only. Other service tasks require their own permissions.",
    "category": "service_technicians",
    "tab": "technicians",
    "action": "Delete",
    "feature": "service.technicians"
  },
  {
    "id": "canViewServiceTechnicianReport",
    "name": "View reports for technicians",
    "description": "Allow this action for technicians only. Other service tasks require their own permissions.",
    "category": "service_technicians",
    "tab": "technicians",
    "action": "Report",
    "feature": "service.technicians"
  },
  {
    "id": "canViewServiceJobCard",
    "name": "View job cards",
    "description": "Read job cards without permission to create, edit, delete, or change status.",
    "category": "service_job_cards",
    "tab": "job-cards",
    "action": "View",
    "feature": "service.job_cards"
  },
  {
    "id": "canCreateServiceJobCard",
    "name": "Create job cards",
    "description": "Allow this action for job cards only. Other service tasks require their own permissions.",
    "category": "service_job_cards",
    "tab": "job-cards",
    "action": "Create",
    "feature": "service.job_cards"
  },
  {
    "id": "canEditServiceJobCard",
    "name": "Edit details of job cards",
    "description": "Allow this action for job cards only. Other service tasks require their own permissions.",
    "category": "service_job_cards",
    "tab": "job-cards",
    "action": "Edit",
    "feature": "service.job_cards"
  },
  {
    "id": "canDeleteServiceJobCard",
    "name": "Delete job cards",
    "description": "Allow this action for job cards only. Other service tasks require their own permissions.",
    "category": "service_job_cards",
    "tab": "job-cards",
    "action": "Delete",
    "feature": "service.job_cards"
  },
  {
    "id": "canUpdateServiceJobCardStatus",
    "name": "Change status of job cards",
    "description": "Allow this action for job cards only. Other service tasks require their own permissions.",
    "category": "service_job_cards",
    "tab": "job-cards",
    "action": "UpdateStatus",
    "feature": "service.job_cards"
  },
  {
    "id": "canAssignServiceJobCard",
    "name": "Assign technicians to job cards",
    "description": "Allow this action for job cards only. Other service tasks require their own permissions.",
    "category": "service_job_cards",
    "tab": "job-cards",
    "action": "Assign",
    "feature": "service.job_cards"
  },
  {
    "id": "canCheckServiceJobCardQuality",
    "name": "Record quality checks for job cards",
    "description": "Allow this action for job cards only. Other service tasks require their own permissions.",
    "category": "service_job_cards",
    "tab": "job-cards",
    "action": "CheckQuality",
    "feature": "service.job_cards"
  },
  {
    "id": "canViewServiceJobCardReport",
    "name": "View reports for job cards",
    "description": "Allow this action for job cards only. Other service tasks require their own permissions.",
    "category": "service_job_cards",
    "tab": "job-cards",
    "action": "Report",
    "feature": "service.job_cards"
  },
  {
    "id": "canViewServiceFeedback",
    "name": "View customer feedback",
    "description": "Read customer feedback without permission to create, edit, delete, or change status.",
    "category": "service_feedback",
    "tab": "feedback",
    "action": "View",
    "feature": "service"
  },
  {
    "id": "canCreateServiceFeedback",
    "name": "Create customer feedback",
    "description": "Allow this action for customer feedback only. Other service tasks require their own permissions.",
    "category": "service_feedback",
    "tab": "feedback",
    "action": "Create",
    "feature": "service"
  },
  {
    "id": "canRespondServiceFeedback",
    "name": "Respond to customer feedback",
    "description": "Allow this action for customer feedback only. Other service tasks require their own permissions.",
    "category": "service_feedback",
    "tab": "feedback",
    "action": "Respond",
    "feature": "service"
  },
  {
    "id": "canModerateServiceFeedback",
    "name": "Publish or hide customer feedback",
    "description": "Allow this action for customer feedback only. Other service tasks require their own permissions.",
    "category": "service_feedback",
    "tab": "feedback",
    "action": "Moderate",
    "feature": "service"
  },
  {
    "id": "canDeleteServiceFeedback",
    "name": "Delete customer feedback",
    "description": "Allow this action for customer feedback only. Other service tasks require their own permissions.",
    "category": "service_feedback",
    "tab": "feedback",
    "action": "Delete",
    "feature": "service"
  },
  {
    "id": "canGenerateServiceFeedbackQR",
    "name": "Generate and print QR codes for customer feedback",
    "description": "Allow this action for customer feedback only. Other service tasks require their own permissions.",
    "category": "service_feedback",
    "tab": "feedback",
    "action": "GenerateQR",
    "feature": "service"
  },
  {
    "id": "canViewServiceFeedbackReport",
    "name": "View reports for customer feedback",
    "description": "Allow this action for customer feedback only. Other service tasks require their own permissions.",
    "category": "service_feedback",
    "tab": "feedback",
    "action": "Report",
    "feature": "service"
  },
  {
    "id": "canViewServiceCarWash",
    "name": "View car wash",
    "description": "Read car wash without permission to create, edit, delete, or change status.",
    "category": "service_car_wash",
    "tab": "car-wash",
    "action": "View",
    "feature": "service"
  },
  {
    "id": "canCreateServiceCarWash",
    "name": "Create car wash",
    "description": "Allow this action for car wash only. Other service tasks require their own permissions.",
    "category": "service_car_wash",
    "tab": "car-wash",
    "action": "Create",
    "feature": "service"
  },
  {
    "id": "canEditServiceCarWash",
    "name": "Edit details of car wash",
    "description": "Allow this action for car wash only. Other service tasks require their own permissions.",
    "category": "service_car_wash",
    "tab": "car-wash",
    "action": "Edit",
    "feature": "service"
  },
  {
    "id": "canDeleteServiceCarWash",
    "name": "Delete car wash",
    "description": "Allow this action for car wash only. Other service tasks require their own permissions.",
    "category": "service_car_wash",
    "tab": "car-wash",
    "action": "Delete",
    "feature": "service"
  },
  {
    "id": "canViewServiceGarage",
    "name": "View garage services",
    "description": "Read garage services without permission to create, edit, delete, or change status.",
    "category": "service_garage",
    "tab": "garage",
    "action": "View",
    "feature": "service"
  },
  {
    "id": "canCreateServiceGarage",
    "name": "Create garage services",
    "description": "Allow this action for garage services only. Other service tasks require their own permissions.",
    "category": "service_garage",
    "tab": "garage",
    "action": "Create",
    "feature": "service"
  },
  {
    "id": "canEditServiceGarage",
    "name": "Edit details of garage services",
    "description": "Allow this action for garage services only. Other service tasks require their own permissions.",
    "category": "service_garage",
    "tab": "garage",
    "action": "Edit",
    "feature": "service"
  },
  {
    "id": "canDeleteServiceGarage",
    "name": "Delete garage services",
    "description": "Allow this action for garage services only. Other service tasks require their own permissions.",
    "category": "service_garage",
    "tab": "garage",
    "action": "Delete",
    "feature": "service"
  },
  {
    "id": "canUpdateServiceGarageStatus",
    "name": "Change status of garage services",
    "description": "Allow this action for garage services only. Other service tasks require their own permissions.",
    "category": "service_garage",
    "tab": "garage",
    "action": "UpdateStatus",
    "feature": "service"
  },
  { id: "canViewSalonChair", name: "View chair schedule", description: "View salon chairs and their appointment schedule.", category: "salon_chairs", tab: "salon-chairs", action: "View", feature: "salon.chair_scheduling" },
  { id: "canAssignSalonChair", name: "Assign chairs to appointments", description: "Assign or change a Salon chair or station without granting general appointment-edit access.", category: "salon_chairs", tab: "appointments", action: "Assign chair", feature: "salon.chair_scheduling" },
  { id: "canCreateSalonChair", name: "Create salon chairs", description: "Add bookable chairs or stations.", category: "salon_chairs", tab: "salon-chairs", action: "Create", feature: "salon.chair_scheduling" },
  { id: "canEditSalonChair", name: "Edit salon chairs", description: "Change chair names, locations, and branch assignments.", category: "salon_chairs", tab: "salon-chairs", action: "Edit", feature: "salon.chair_scheduling" },
  { id: "canDeactivateSalonChair", name: "Deactivate salon chairs", description: "Deactivate chairs without deleting their appointment history.", category: "salon_chairs", tab: "salon-chairs", action: "Deactivate", feature: "salon.chair_scheduling" },
  { id: "canViewSalonCommission", name: "View stylist commissions", description: "View commission rules and completed-service commission records.", category: "salon_commissions", tab: "salon-commissions", action: "View", feature: "salon.stylist_commissions" },
  { id: "canConfigureSalonCommission", name: "Configure stylist commissions", description: "Set stylist commission rates and calculation methods.", category: "salon_commissions", tab: "salon-commissions", action: "Configure", feature: "salon.stylist_commissions" },
  { id: "canApproveSalonCommission", name: "Approve stylist commissions", description: "Approve calculated commissions for payroll processing.", category: "salon_commissions", tab: "salon-commissions", action: "Approve", feature: "salon.stylist_commissions" },
  { id: "canIncludeSalonCommissionInPayroll", name: "Include commissions in payroll", description: "Transfer approved commissions into employee payroll earnings.", category: "salon_commissions", tab: "salon-commissions", action: "Payroll", feature: "salon.stylist_commissions" },
  { id: "canPaySalonCommission", name: "Pay stylist commissions", description: "Pay an approved stylist commission directly from an authorized transaction account, without requiring HR payroll.", category: "salon_commissions", tab: "salon-commissions", action: "Pay", feature: "salon.stylist_commissions" },
  { id: "canAssignSalonStylist", name: "Assign stylists to appointments", description: "Assign or change a Salon stylist on an appointment without granting general appointment-edit access.", category: "salon_stylists", tab: "appointments", action: "Assign stylist", feature: "salon_spa" },
  { id: "canViewSalonStylist", name: "View salon stylists", description: "View stylist profiles used for salon appointments and commissions.", category: "salon_stylists", tab: "stylists", action: "View", feature: "salon_spa" },
  { id: "canCreateSalonStylist", name: "Create salon stylists", description: "Add stylist profiles for salon appointments and commissions.", category: "salon_stylists", tab: "stylists", action: "Create", feature: "salon_spa" },
  { id: "canEditSalonStylist", name: "Edit salon stylists", description: "Update stylist details and employee links.", category: "salon_stylists", tab: "stylists", action: "Edit", feature: "salon_spa" },
  { id: "canDeactivateSalonStylist", name: "Deactivate salon stylists", description: "Deactivate a stylist while preserving their appointment and commission history.", category: "salon_stylists", tab: "stylists", action: "Deactivate", feature: "salon_spa" }
];
export const SERVICE_PERMISSION_CATEGORIES = [
  {
    "id": "service_appointments",
    "name": "Service Business - Appointments"
  },
  {
    "id": "service_work_orders",
    "name": "Service Business - Work Orders"
  },
  {
    "id": "service_contracts",
    "name": "Service Business - Contracts"
  },
  {
    "id": "service_technicians",
    "name": "Service Business - Technicians"
  },
  {
    "id": "service_job_cards",
    "name": "Service Business - Job Cards"
  },
  {
    "id": "service_feedback",
    "name": "Service Business - Customer Feedback"
  },
  {
    "id": "service_car_wash",
    "name": "Service Business - Car Wash"
  },
  {
    "id": "service_garage",
    "name": "Service Business - Garage Services"
  },
  {
    "id": "salon_chairs",
    "name": "Salon & Spa - Chair Scheduling"
  },
  {
    "id": "salon_commissions",
    "name": "Salon & Spa - Stylist Commissions"
  },
  {
    "id": "salon_stylists",
    "name": "Salon & Spa - Stylists"
  }
];
export const servicePagePermissions = (tab: string) => SERVICE_PERMISSION_DEFINITIONS.filter(p => p.tab === tab && p.action !== 'Report').map(p => p.id);
export const serviceReportPermission = (tab: string) => SERVICE_PERMISSION_DEFINITIONS.find(p => p.tab === tab && p.action === 'Report')?.id;
export const servicePermission = (tab: string, action: string) => SERVICE_PERMISSION_DEFINITIONS.find(p => p.tab === tab && p.action === action)?.id || '';
export const serviceReportIds: Record<string, string> = { svcAppointmentSummary: 'svcAppointments', svcByTechnician: 'svcTechnicians', svcByStatus: 'svcWorkOrders', svcRevenueReport: 'svcWorkOrders', svcContractReport: 'svcContracts', svcFeedbackReport: 'svcFeedback', svcJobCardReport: 'svcJobCards', svcContractUtilization: 'svcContracts' };
export const serviceReportPermissions: Record<string, string> = {
  "svcAppointments": "canViewServiceAppointmentReport",
  "svcTechnicians": "canViewServiceTechnicianReport",
  "svcContracts": "canViewServiceContractReport",
  "svcFeedback": "canViewServiceFeedbackReport",
  "svcJobCards": "canViewServiceJobCardReport",
  "svcWorkOrders": "canViewServiceWorkOrderReport"
};


