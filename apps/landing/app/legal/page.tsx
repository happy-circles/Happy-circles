import { redirect } from 'next/navigation';

export default function LegalRedirectPage() {
  redirect('/terms');
}
