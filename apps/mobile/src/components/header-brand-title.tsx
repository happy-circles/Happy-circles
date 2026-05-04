import {
  BrandLockup,
  HEADER_BRAND_GAP,
  HEADER_BRAND_LOGO_SIZE,
  HEADER_BRAND_TITLE_LINE_HEIGHT,
  HEADER_BRAND_TITLE_SIZE,
  HEADER_BRAND_TITLE_WIDTH,
} from '@/components/brand-lockup';
import { HappyCirclesGlyph } from '@/components/happy-circles-glyph';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { LaunchIntroTargetView } from '@/components/launch-intro-presence';
import { StyleSheet } from 'react-native';

const TITLE_WIDTH_RATIO = HEADER_BRAND_TITLE_WIDTH / HEADER_BRAND_TITLE_SIZE;

export function HeaderBrandTitle({
  launchTargetDisabled = false,
  logoVisible = true,
  logoSize = HEADER_BRAND_LOGO_SIZE,
  refreshActive = false,
  titleVisible = true,
  titleSize = HEADER_BRAND_TITLE_SIZE,
}: {
  readonly launchTargetDisabled?: boolean;
  readonly logoVisible?: boolean;
  readonly logoSize?: number;
  readonly refreshActive?: boolean;
  readonly titleVisible?: boolean;
  readonly titleSize?: number;
}) {
  const titleContainerWidth = titleSize * TITLE_WIDTH_RATIO;

  return (
    <BrandLockup
      gap={HEADER_BRAND_GAP}
      logo={
        <LaunchIntroTargetView
          disabled={launchTargetDisabled}
          kind="brand"
          priority={0}
          stageSize={logoSize}
          style={{ height: logoSize, width: logoSize }}
          visualKind="headerBrand"
        >
          {refreshActive ? (
            <HappyCirclesMotion size={logoSize} variant="refresh" />
          ) : (
            <HappyCirclesGlyph size={logoSize} />
          )}
        </LaunchIntroTargetView>
      }
      logoStyle={!logoVisible ? styles.hiddenElement : null}
      logoSize={logoSize}
      titleContainerStyle={[styles.titleContainer, { width: titleContainerWidth }]}
      titleLineHeight={HEADER_BRAND_TITLE_LINE_HEIGHT}
      titleSize={titleSize}
      titleStyle={!titleVisible ? styles.hiddenElement : null}
    />
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    width: HEADER_BRAND_TITLE_WIDTH,
  },
  hiddenElement: {
    opacity: 0,
  },
});
