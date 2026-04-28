import {
  BrandLockup,
  HEADER_BRAND_GAP,
  HEADER_BRAND_LOGO_SIZE,
  HEADER_BRAND_TITLE_LINE_HEIGHT,
  HEADER_BRAND_TITLE_SIZE,
  HEADER_BRAND_TITLE_WIDTH,
} from '@/components/brand-lockup';
import { useLaunchIntroVisible } from '@/components/launch-intro-presence';
import { StyleSheet } from 'react-native';

export function HeaderBrandTitle({
  logoSize = HEADER_BRAND_LOGO_SIZE,
  titleSize = HEADER_BRAND_TITLE_SIZE,
}: {
  readonly logoSize?: number;
  readonly titleSize?: number;
}) {
  const launchIntroVisible = useLaunchIntroVisible();

  return (
    <BrandLockup
      gap={HEADER_BRAND_GAP}
      logoSize={logoSize}
      style={launchIntroVisible ? styles.hiddenDuringLaunchIntro : undefined}
      titleContainerStyle={styles.titleContainer}
      titleLineHeight={HEADER_BRAND_TITLE_LINE_HEIGHT}
      titleSize={titleSize}
    />
  );
}

const styles = StyleSheet.create({
  hiddenDuringLaunchIntro: {
    opacity: 0,
  },
  titleContainer: {
    width: HEADER_BRAND_TITLE_WIDTH,
  },
});
