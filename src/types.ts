export type PropertyType = 'HOUSE' | 'FLAT' | 'BUSINESS';
export type LeaseStatus = 'ACTIVE' | 'TERMINATED' | 'EXPIRED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE';

export interface Property {
  id: string;
  name: string;
  address: string;
  type: PropertyType;
  managerId: string;
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  managerId: string;
  createdAt: string;
}

export interface Lease {
  id: string;
  propertyId: string;
  tenantId: string;
  rentAmount: number;
  startDate: string;
  endDate: string;
  managerId: string;
  status: LeaseStatus;
  createdAt: string;
  reminderLeadTimes: number[]; // e.g. [7, 2]
}

export type ReminderStatus = 'SENT' | 'FAILED' | 'PENDING';

export interface ReminderLog {
  id: string;
  leaseId: string;
  paymentId: string;
  tenantId: string;
  managerId: string;
  leadTimeDays: number;
  sentAt: string;
  status: ReminderStatus;
  recipientEmail: string;
}

export interface Payment {
  id: string;
  leaseId: string;
  propertyId: string;
  tenantId: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  status: PaymentStatus;
  managerId: string;
}
