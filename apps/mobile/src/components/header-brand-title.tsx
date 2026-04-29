import {
  BrandLockup,
  HEADER_BRAND_GAP,
  HEADER_BRAND_LOGO_SIZE,
  HEADER_BRAND_TITLE_LINE_HEIGHT,
  HEADER_BRAND_TITLE_SIZE,
  HEADER_BRAND_TITLE_WIDTH,
} from '@/components/brand-lockup';
import { HappyCirclesGlyph } from '@/components/happy-circles-glyph';
import { LaunchIntroTargetView } from '@/components/launch-intro-presence';
import { StyleSheet } from 'react-native';

export function HeaderBrandTitle({
  logoSize = HEADER_BRAND_LOGO_SIZE,
  titleSize = HEADER_BRAND_TITLE_SIZE,
}: {
  readonly logoSize?: number;
  readonly titleSize?: number;
}) {
  return (
    <BrandLockup
      gap={HEADER_BRAND_GAP}
      logo={
        <LaunchIntroTargetView
          kind="brand"
          priority={0}
          style={{ height: logoSize, width: logoSize }}
        >
          <HappyCirclesGlyph size={logoSize} />
        </LaunchIntroTargetView>
      }
      logoSize={logoSize}
      titleContainerStyle={styles.titleContainer}
      titleLineHeight={HEADER_BRAND_TITLE_LINE_HEIGHT}
      titleSize={titleSize}
    />
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    width: HEADER_BRAND_TITLE_WIDTH,
  },
});
