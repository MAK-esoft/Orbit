'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { CurrentUser } from '@/lib/types';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const user = await api.post<CurrentUser>('/auth/login', values);
      router.replace(user.role === 'RO_USER' ? '/ro/dashboard' : '/admin/dashboard');
    } catch (e) {
      setServerError(
        e instanceof ApiError ? e.message : 'Something went wrong. Try again.',
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <h2 className="text-section">Sign in</h2>
        <p className="text-meta text-text-secondary">
          Enter your credentials to continue
        </p>
      </div>

      {serverError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-meta text-status-rejected">
          {serverError}
        </div>
      )}

      <div>
        <label className="mb-1 block text-card-label">Email</label>
        <Input type="email" autoComplete="email" {...register('email')} />
        {errors.email && (
          <p className="mt-1 text-meta text-status-rejected">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-card-label">Password</label>
        <Input type="password" autoComplete="current-password" {...register('password')} />
        {errors.password && (
          <p className="mt-1 text-meta text-status-rejected">
            {errors.password.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <div className="text-center">
        <Link
          href="/forgot-password"
          className="text-meta text-primary hover:underline"
        >
          Forgot your password?
        </Link>
      </div>
    </form>
  );
}
