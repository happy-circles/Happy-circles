import { SessionLoadingScreen } from '@/components/session-loading-screen';
import { AccountInviteScreen } from '@/features/invites/account-invite-screen';
import { AccountInviteEntryScreen } from '@/features/invites/account-invite-entry-screen';
import { useSession } from '@/providers/session-provider';

export default function JoinTokenRoute() {
  const session = useSession();

  if (session.status === 'loading') {
    return <SessionLoadingScreen message="Preparando invitacion" />;
  }

  if (session.status === 'signed_out' || session.status === 'signed_in_locked') {
    return <AccountInviteEntryScreen />;
  }

  return <AccountInviteScreen />;
}
