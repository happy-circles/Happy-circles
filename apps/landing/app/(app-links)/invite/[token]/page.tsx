import { AppLinkGateway } from '../../../_components/app-link-gateway';

export default async function FriendshipInviteGatewayPage({
  params,
}: Readonly<{
  params: Promise<{ readonly token: string }>;
}>) {
  const { token } = await params;
  return <AppLinkGateway kind="friendship-invite" token={token} />;
}
