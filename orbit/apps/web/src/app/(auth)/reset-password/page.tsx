import { Suspense } from 'react';
import { SetPasswordForm } from '@/components/set-password-form';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm
        endpoint="/auth/reset-password"
        title="Choose a new password"
        cta="Reset password"
        successText="Your password has been reset. You can now sign in."
      />
    </Suspense>
  );
}
