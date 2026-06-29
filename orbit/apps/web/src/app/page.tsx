import { redirect } from 'next/navigation';

/** Root simply funnels into the auth/role-aware entry point. */
export default function Home() {
  redirect('/login');
}
