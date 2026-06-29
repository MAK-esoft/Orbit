import { Suspense } from 'react';
import { SetPasswordForm } from '@/components/set-password-form';

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm
        endpoint="/auth/set-password"
        title="Activate your account"
        cta="Activate account"
        successText="Your account is active. You can now sign in."
      />
    </Suspense>
  );
}
