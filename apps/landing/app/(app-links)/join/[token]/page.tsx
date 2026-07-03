import { AppLinkGateway } from '../../../_components/app-link-gateway';
import {
  ACCOUNT_INVITE_SOCIAL_DESCRIPTION,
  ACCOUNT_INVITE_SOCIAL_TITLE,
  buildSocialMetadata,
} from '@/lib/social-preview';

export const metadata = buildSocialMetadata({
  description: ACCOUNT_INVITE_SOCIAL_DESCRIPTION,
  title: ACCOUNT_INVITE_SOCIAL_TITLE,
});

export default async function AccountInviteGatewayPage({
  params,
}: Readonly<{
  params: Promise<{ readonly token: string }>;
}>) {
  const { token } = await params;
  return <AppLinkGateway kind="account-invite" token={token} />;
}
