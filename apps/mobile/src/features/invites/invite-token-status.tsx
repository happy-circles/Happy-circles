import { IdentityFlowStatusCopy } from '@/components/identity-flow';

export function InviteTokenStatus({
  subtitle,
  title,
}: {
  readonly subtitle: string;
  readonly title: string;
}) {
  return <IdentityFlowStatusCopy subtitle={subtitle} title={title} />;
}
