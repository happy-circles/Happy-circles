import { AppLinkGateway } from '../../../_components/app-link-gateway';
import {
  FRIENDSHIP_INVITE_SOCIAL_DESCRIPTION,
  FRIENDSHIP_INVITE_SOCIAL_TITLE,
  buildSocialMetadata,
} from '@/lib/social-preview';

export const metadata = buildSocialMetadata({
  description: FRIENDSHIP_INVITE_SOCIAL_DESCRIPTION,
  title: FRIENDSHIP_INVITE_SOCIAL_TITLE,
});

export default async function FriendshipInviteGatewayPage({
  params,
}: Readonly<{
  params: Promise<{ readonly token: string }>;
}>) {
  const { token } = await params;
  return <AppLinkGateway kind="friendship-invite" token={token} />;
}
