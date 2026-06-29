import { PaymentType, RequestType } from './types';

export function formatPkr(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 2,
  }).format(n);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  BANK_TRANSFER: 'Bank Transfer',
  CASH_DEPOSIT: 'Cash Deposit',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

export function paymentTypeLabel(type: PaymentType): string {
  return PAYMENT_TYPE_LABELS[type] ?? type;
}

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  DEPOSIT: 'Deposit',
  EXPENSE: 'Expense',
  SALARY_DISBURSEMENT: 'Salary Disbursement',
  VENDOR_PAYMENT: 'Vendor Payment',
  OTHER: 'Other',
};

export function requestTypeLabel(type: RequestType): string {
  return REQUEST_TYPE_LABELS[type] ?? type;
}

/** Short, human-friendly submission reference (#A1B2C3D4). */
export function shortRef(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
