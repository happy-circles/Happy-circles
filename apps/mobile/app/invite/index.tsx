import { Redirect, useLocalSearchParams } from 'expo-router';

export default function DeprecatedInviteRoute() {
  const params = useLocalSearchParams<{
    amountMinor?: string;
    description?: string;
    direction?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: '/people',
        params: {
          addPerson: '1',
          amountMinor: params.amountMinor,
          description: params.description,
          direction: params.direction,
        },
      }}
    />
  );
}
