'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    // Endpoint always succeeds (no user enumeration).
    await api.post('/auth/forgot-password', values).catch(() => {});
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-section">Check your email</h2>
        <p className="text-body text-text-secondary">
          If an account exists for that address, we&apos;ve sent a password reset
          link. It expires in 1 hour.
        </p>
        <Link href="/login" className="text-meta text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <h2 className="text-section">Reset your password</h2>
        <p className="text-meta text-text-secondary">
          We&apos;ll email you a link to reset it.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-card-label">Email</label>
        <Input type="email" autoComplete="email" {...register('email')} />
        {errors.email && (
          <p className="mt-1 text-meta text-status-rejected">{errors.email.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Sending…' : 'Send reset link'}
      </Button>
      <div className="text-center">
        <Link href="/login" className="text-meta text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
