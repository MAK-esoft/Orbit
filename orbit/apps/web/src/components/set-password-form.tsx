'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Must contain a letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
type FormValues = z.infer<typeof schema>;

/**
 * Shared form for account activation (/set-password) and password reset
 * (/reset-password). Both take a `token` query param and POST to the matching
 * endpoint; only the endpoint and copy differ.
 */
export function SetPasswordForm({
  endpoint,
  title,
  cta,
  successText,
}: {
  endpoint: '/auth/set-password' | '/auth/reset-password';
  title: string;
  cta: string;
  successText: string;
}) {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await api.post(endpoint, { token, password: values.password });
      setDone(true);
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  }

  if (!token) {
    return (
      <div className="space-y-3 text-center">
        <h2 className="text-section">Invalid link</h2>
        <p className="text-body text-text-secondary">
          This link is missing its token. Please use the link from your email.
        </p>
        <Link href="/login" className="text-meta text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-section">All set</h2>
        <p className="text-body text-text-secondary">{successText}</p>
        <Link href="/login">
          <Button className="w-full">Go to sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-section">{title}</h2>
      {serverError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-meta text-status-rejected">
          {serverError}
        </div>
      )}
      <div>
        <label className="mb-1 block text-card-label">New password</label>
        <Input type="password" autoComplete="new-password" {...register('password')} />
        {errors.password && (
          <p className="mt-1 text-meta text-status-rejected">
            {errors.password.message}
          </p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-card-label">Confirm password</label>
        <Input type="password" autoComplete="new-password" {...register('confirm')} />
        {errors.confirm && (
          <p className="mt-1 text-meta text-status-rejected">
            {errors.confirm.message}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : cta}
      </Button>
    </form>
  );
}
