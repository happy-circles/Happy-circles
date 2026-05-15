import { Link, type Href } from 'expo-router';
import { Pressable } from 'react-native';

import { AppText } from '@/components/app-text';
import * as appHaptics from '@/lib/app-haptics';
import { personDetailScreenStyles as styles } from './person-detail-screen.styles';

export function CircleDetailLink({ color, href }: { readonly color: string; readonly href: Href }) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        onPressIn={appHaptics.triggerAppSelectionHaptic}
        style={({ pressed }) => [
          styles.circleDetailLink,
          pressed ? styles.circleDetailLinkPressed : null,
        ]}
      >
        <AppText numberOfLines={1} style={[styles.circleDetailLinkText, { color }]}>
          Ver detalle del Circle &gt;
        </AppText>
      </Pressable>
    </Link>
  );
}
