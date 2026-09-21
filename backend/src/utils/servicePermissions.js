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
    "feature": "fuel_station.car_wash"
  },
  {
    "id": "canCreateServiceCarWash",
    "name": "Create car wash",
    "description": "Allow this action for car wash only. Other service tasks require their own permissions.",
    "category": "service_car_wash",
    "tab": "car-wash",
    "action": "Create",
    "feature": "fuel_station.car_wash"
  },
  {
    "id": "canEditServiceCarWash",
    "name": "Edit details of car wash",
    "description": "Allow this action for car wash only. Other service tasks require their own permissions.",
    "category": "service_car_wash",
    "tab": "car-wash",
    "action": "Edit",
    "feature": "fuel_station.car_wash"
  },
  {
    "id": "canDeleteServiceCarWash",
    "name": "Delete car wash",
    "description": "Allow this action for car wash only. Other service tasks require their own permissions.",
    "category": "service_car_wash",
    "tab": "car-wash",
    "action": "Delete",
    "feature": "fuel_station.car_wash"
  },
  {
    "id": "canViewServiceGarage",
    "name": "View garage services",
    "description": "Read garage services without permission to create, edit, delete, or change status.",
    "category": "service_garage",
    "tab": "garage",
    "action": "View",
    "feature": "fuel_station.garage"
  },
  {
    "id": "canCreateServiceGarage",
    "name": "Create garage services",
    "description": "Allow this action for garage services only. Other service tasks require their own permissions.",
    "category": "service_garage",
    "tab": "garage",
    "action": "Create",
    "feature": "fuel_station.garage"
  },
  {
    "id": "canEditServiceGarage",
    "name": "Edit details of garage services",
    "description": "Allow this action for garage services only. Other service tasks require their own permissions.",
    "category": "service_garage",
    "tab": "garage",
    "action": "Edit",
    "feature": "fuel_station.garage"
  },
  {
    "id": "canDeleteServiceGarage",
    "name": "Delete garage services",
    "description": "Allow this action for garage services only. Other service tasks require their own permissions.",
    "category": "service_garage",
    "tab": "garage",
    "action": "Delete",
    "feature": "fuel_station.garage"
  },
  {
    "id": "canUpdateServiceGarageStatus",
    "name": "Change status of garage services",
    "description": "Allow this action for garage services only. Other service tasks require their own permissions.",
    "category": "service_garage",
    "tab": "garage",
    "action": "UpdateStatus",
    "feature": "fuel_station.garage"
  }
];
export const SERVICE_PERMISSION_KEYS = SERVICE_PERMISSION_DEFINITIONS.map(item => item.id);
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
  }
];
export const SERVICE_REPORT_PERMISSIONS = {
  "appointments": "canViewServiceAppointmentReport",
  "work-orders": "canViewServiceWorkOrderReport",
  "contracts": "canViewServiceContractReport",
  "technicians": "canViewServiceTechnicianReport",
  "job-cards": "canViewServiceJobCardReport",
  "feedback": "canViewServiceFeedbackReport"
};

