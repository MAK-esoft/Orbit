export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'RO_USER';

export type PaymentType = 'BANK_TRANSFER' | 'CASH_DEPOSIT' | 'CHEQUE' | 'OTHER';

export type RequestType =
  | 'DEPOSIT'
  | 'EXPENSE'
  | 'SALARY_DISBURSEMENT'
  | 'VENDOR_PAYMENT'
  | 'OTHER';

export type SubmissionStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export type SubmissionSource = 'APP' | 'WHATSAPP' | 'SLACK';

export type EnrichmentStatus = 'NONE' | 'PENDING' | 'ENRICHED' | 'FAILED';

/** A single dynamic field the AI read off a proof. */
export interface ExtractedField {
  label: string;
  value: string;
}

/** AI-extracted data from the n8n workflow. Always shown as a separate block. */
export interface SubmissionExtraction {
  classification: string;
  extractedAmount: string | null;
  extractedPaymentMethod: string | null;
  slipRef: string | null;
  merchant: string | null;
  description: string | null;
  bankEmailMatch: boolean;
  bankEmailAmount: string | null;
  bankEmailTimestamp: string | null;
  confidence: string | null;
  model: string | null;
  // Dynamic, proof-specific fields — render only what's present.
  fields: ExtractedField[];
  createdAt: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  roId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: Record<string, unknown> | null;
  error: { statusCode: number; message: string | string[]; details?: unknown } | null;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RegionalOffice {
  id: string;
  name: string;
  code: string;
  city: string | null;
  region: string | null;
  whatsappPhone?: string | null;
  isActive: boolean;
  userCount?: number;
}

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  roId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  regionalOffice?: { name: string; code: string } | null;
}

export interface Submission {
  id: string;
  roId: string;
  ro?: { id: string; name: string; code: string };
  submittedById: string;
  submittedBy?: { id: string; fullName: string };
  requestType: RequestType;
  paymentType: PaymentType;
  paymentTypeNote: string | null;
  amount: string | null;
  paymentDate: string;
  bankName: string | null;
  referenceNumber: string | null;
  notes: string | null;
  source: SubmissionSource;
  enrichmentStatus: EnrichmentStatus;
  senderRef: string | null;
  attachment: {
    path: string;
    originalName: string | null;
    mimeType: string | null;
    url: string;
  } | null;
  extraction?: SubmissionExtraction | null;
  status: SubmissionStatus;
  version: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEvent {
  id: string;
  submissionId: string;
  version: number;
  fromStatus: SubmissionStatus | null;
  toStatus: SubmissionStatus;
  reason: string | null;
  changedBy: { id: string; fullName: string };
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  submissionId: string | null;
  isRead: boolean;
  createdAt: string;
}

export type AdjustmentType = 'CREDIT' | 'DEBIT';

export interface Adjustment {
  id: string;
  roId: string;
  ro?: { id: string; name: string; code: string };
  type: AdjustmentType;
  amount: string;
  description: string;
  effectiveDate: string;
  createdBy?: { id: string; fullName: string };
  createdAt: string;
}

export interface MonthlyBalance {
  credited: string;
  debited: string;
  net: string;
  byType: Partial<Record<RequestType, string>>;
}

export interface RoStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  balance: MonthlyBalance;
  recent: Submission[];
}

export interface AdminStats {
  total: number;
  pendingReview: number;
  approvedThisMonth: number;
  rejectedThisMonth: number;
  balance: MonthlyBalance;
  queue: Submission[];
  perRo: {
    roId: string;
    name: string;
    code: string;
    pending: number;
    lastSubmissionAt: string | null;
    credited: string;
    debited: string;
    net: string;
  }[];
}
