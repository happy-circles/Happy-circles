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

const TITLE_WIDTH_RATIO = HEADER_BRAND_TITLE_WIDTH / HEADER_BRAND_TITLE_SIZE;

export function HeaderBrandTitle({
  launchTargetDisabled = false,
  logoSize = HEADER_BRAND_LOGO_SIZE,
  titleVisible = true,
  titleSize = HEADER_BRAND_TITLE_SIZE,
}: {
  readonly launchTargetDisabled?: boolean;
  readonly logoSize?: number;
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
          <HappyCirclesGlyph size={logoSize} />
        </LaunchIntroTargetView>
      }
      logoSize={logoSize}
      titleContainerStyle={{ width: titleContainerWidth }}
      titleLineHeight={HEADER_BRAND_TITLE_LINE_HEIGHT}
      titleSize={titleSize}
      titleStyle={!titleVisible ? { opacity: 0 } : null}
    />
  );
}
