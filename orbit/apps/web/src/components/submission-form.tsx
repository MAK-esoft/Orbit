'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { Submission } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { FileDropzone } from '@/components/file-dropzone';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';

const today = new Date().toISOString().slice(0, 10);

const schema = z
  .object({
    requestType: z.enum([
      'DEPOSIT',
      'EXPENSE',
      'SALARY_DISBURSEMENT',
      'VENDOR_PAYMENT',
      'OTHER',
    ]),
    paymentType: z.enum(['BANK_TRANSFER', 'CASH_DEPOSIT', 'CHEQUE', 'OTHER']),
    paymentTypeNote: z.string().optional(),
    amount: z
      .string()
      .min(1, 'Amount is required')
      .refine((v) => Number(v) > 0, 'Amount must be greater than 0'),
    paymentDate: z
      .string()
      .min(1, 'Payment date is required')
      .refine((v) => v <= today, 'Payment date cannot be in the future'),
    bankName: z.string().min(1, 'Bank name is required'),
    referenceNumber: z.string().min(1, 'Reference / slip number is required'),
    notes: z.string().optional(),
  })
  .refine((v) => v.paymentType !== 'OTHER' || !!v.paymentTypeNote?.trim(), {
    path: ['paymentTypeNote'],
    message: 'Describe the payment type when choosing Other',
  });

type FormValues = z.infer<typeof schema>;

export function SubmissionForm({
  mode,
  initial,
  submissionId,
}: {
  mode: 'create' | 'resubmit';
  initial?: Submission;
  submissionId?: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileTouched, setFileTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          requestType: initial.requestType,
          paymentType: initial.paymentType,
          paymentTypeNote: initial.paymentTypeNote ?? '',
          amount: initial.amount ?? '',
          paymentDate: initial.paymentDate,
          bankName: initial.bankName ?? '',
          referenceNumber: initial.referenceNumber ?? '',
          notes: initial.notes ?? '',
        }
      : { requestType: 'DEPOSIT', paymentType: 'BANK_TRANSFER' },
  });

  const paymentType = watch('paymentType');

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setFileTouched(true);
    if (!file) return;

    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined && v !== '') fd.append(k, v as string);
    });
    fd.append('file', file);

    try {
      const created =
        mode === 'create'
          ? await api.post<Submission>('/submissions', fd)
          : await api.post<Submission>(`/submissions/${submissionId}/resubmit`, fd);
      router.push(`/ro/submissions/${created.id}`);
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Submission failed. Try again.');
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="max-w-3xl space-y-5 rounded-lg border border-border bg-surface p-6"
    >
      <FormError message={serverError} />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Request type" required error={errors.requestType?.message}>
          <Select {...register('requestType')}>
            <option value="DEPOSIT">Deposit</option>
            <option value="EXPENSE">Expense</option>
            <option value="SALARY_DISBURSEMENT">Salary Disbursement</option>
            <option value="VENDOR_PAYMENT">Vendor Payment</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>

        <Field label="Payment method" required error={errors.paymentType?.message}>
          <Select {...register('paymentType')}>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CASH_DEPOSIT">Cash Deposit</option>
            <option value="CHEQUE">Cheque</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>

        {paymentType === 'OTHER' && (
          <Field
            label="Payment method note"
            required
            error={errors.paymentTypeNote?.message}
          >
            <Input
              {...register('paymentTypeNote')}
              placeholder="e.g. direct app transfer"
            />
          </Field>
        )}

        <Field label="Amount (PKR)" required error={errors.amount?.message}>
          <Input type="number" step="0.01" min="0" {...register('amount')} placeholder="0.00" />
        </Field>

        <Field label="Payment date" required error={errors.paymentDate?.message}>
          <Controller
            control={control}
            name="paymentDate"
            render={({ field }) => (
              <DatePicker value={field.value ?? ''} onChange={field.onChange} max={today} />
            )}
          />
        </Field>

        <Field label="Bank name" required error={errors.bankName?.message}>
          <Input {...register('bankName')} placeholder="e.g. HBL" />
        </Field>

        <Field
          label="Reference / slip number"
          required
          error={errors.referenceNumber?.message}
        >
          <Input {...register('referenceNumber')} placeholder="Transaction or slip no." />
        </Field>
      </div>

      <Field label="Notes" error={errors.notes?.message}>
        <Textarea rows={3} {...register('notes')} placeholder="Any additional context (optional)" />
      </Field>

      <Field label="Attachment" required error={fileTouched && !file ? 'An attachment is required' : undefined}>
        <FileDropzone value={file} onChange={setFile} />
        {mode === 'resubmit' && (
          <p className="mt-1 text-meta text-text-secondary">
            You must attach a new or corrected file when resubmitting.
          </p>
        )}
      </Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting || !file}>
          {isSubmitting
            ? 'Submitting…'
            : mode === 'create'
              ? 'Submit request'
              : 'Resubmit request'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
