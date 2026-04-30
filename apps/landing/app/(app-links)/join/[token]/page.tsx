import { AppLinkGateway } from '../../../_components/app-link-gateway';

export default async function AccountInviteGatewayPage({
  params,
}: Readonly<{
  params: Promise<{ readonly token: string }>;
}>) {
  const { token } = await params;
  return <AppLinkGateway kind="account-invite" token={token} />;
}
