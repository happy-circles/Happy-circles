import { AccountInviteScreen } from '@/features/invites/account-invite-screen';
import { AccountInviteEntryScreen } from '@/features/invites/account-invite-entry-screen';
import { useSession } from '@/providers/session-provider';

export default function JoinTokenRoute() {
  const session = useSession();

  if (session.status === 'loading') {
    return null;
  }

  if (session.status === 'signed_out') {
    return <AccountInviteEntryScreen />;
  }

  return <AccountInviteScreen />;
}
