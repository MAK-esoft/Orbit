import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import { MonthlyBalance, RequestType } from '@/lib/types';
import { formatPkr, requestTypeLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

const DEBIT_ORDER: RequestType[] = [
  'EXPENSE',
  'SALARY_DISBURSEMENT',
  'VENDOR_PAYMENT',
  'OTHER',
];

/**
 * Monthly ledger view: Deposit = credit (money in), Expense/Salary/Vendor =
 * debit (money out). Shown to both RO and IRBAS/head office.
 */
export function BalanceSummary({
  balance,
  title = 'This month — balance',
}: {
  balance: MonthlyBalance;
  title?: string;
}) {
  const net = Number(balance.net);
  const debitBreakdown = DEBIT_ORDER.filter((t) => balance.byType[t]).map((t) => ({
    label: requestTypeLabel(t),
    amount: balance.byType[t]!,
  }));

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-card-label text-text-primary">{title}</h2>
        <p className="text-meta text-text-secondary">
          Based on approved submissions dated this month
        </p>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Tile
          icon={<ArrowDownLeft className="h-4 w-4 text-status-approved" />}
          label="Credited (deposits)"
          value={formatPkr(balance.credited)}
          valueClass="text-status-approved"
        />
        <Tile
          icon={<ArrowUpRight className="h-4 w-4 text-status-rejected" />}
          label="Debited (expenses & salaries)"
          value={formatPkr(balance.debited)}
          valueClass="text-status-rejected"
        />
        <Tile
          icon={<Scale className="h-4 w-4 text-text-secondary" />}
          label="Net balance"
          value={`${net < 0 ? '−' : ''}${formatPkr(Math.abs(net))}`}
          valueClass={net < 0 ? 'text-status-rejected' : 'text-text-primary'}
        />
      </div>
      {debitBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2.5">
          {debitBreakdown.map((d) => (
            <span key={d.label} className="text-meta text-text-secondary">
              {d.label}: <span className="text-text-primary">{formatPkr(d.amount)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5 text-meta text-text-secondary">
        {icon}
        {label}
      </div>
      <p className={cn('mt-1 text-xl font-semibold', valueClass)}>{value}</p>
    </div>
  );
}
