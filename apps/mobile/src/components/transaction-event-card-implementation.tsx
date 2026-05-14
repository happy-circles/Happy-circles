import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter, type Href } from 'expo-router';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { ActivityItemCard } from '@/components/activity-item-card';
import { AppAvatar, type AppAvatarVariant } from '@/components/app-avatar';
import { CardActorAvatar } from '@/components/card-actor-avatar';
import { CardPressable } from '@/components/card-shell';
import { StateAuraLayer, stateAuraVariantFromTone } from '@/components/state-aura-layer';
import { StatusFaceBadge } from '@/components/status-face-badge';
import type { StatusChipProps } from '@/components/status-chip';
import type { AppHapticFeedback } from '@/lib/app-haptics';
import { cardStateColor, cardStateIntentFromTone } from '@/lib/card-language';
import { pushRoute } from '@/lib/navigation';
import {
  pendingNotificationDotColor,
  pendingNotificationSurfaceColor,
} from '@/lib/pending-notification-visuals';
import { transactionEventCardStyles as styles } from './transaction-event-card-styles';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

const META_SEPARATOR = ` ${String.fromCharCode(183)} `;

export interface TransactionEventCardProps extends PropsWithChildren {
  readonly accentColor?: string;
  readonly actorAvatarUrl?: string | null;
  readonly actorAvatarVariant?: AppAvatarVariant;
  readonly actorFallbackColor: string;
  readonly actorLabel: string;
  readonly amountColor: string;
  readonly amountLabel?: string | null;
  readonly amountStruckThrough?: boolean;
  readonly badgeBackgroundColor?: string;
  readonly badgeColor?: string;
  readonly badgeIcon?: keyof typeof Ionicons.glyphMap;
  readonly category?: string | null;
  readonly context: string;
  readonly contentHref?: Href;
  readonly onContentPress?: () => void;
  readonly directionLabel?: string | null;
  readonly href?: Href;
  readonly haptic?: AppHapticFeedback;
  readonly meta?: string | null;
  readonly onPress?: () => void;
  readonly pending?: boolean;
  readonly pendingHighlightColor?: string;
  readonly statusLabel?: string | null;
  readonly statusTone?: StatusChipProps['tone'];
  readonly style?: StyleProp<ViewStyle>;
  readonly unread?: boolean;
  readonly variant?: 'default' | 'muted' | 'accent' | 'elevated';
  readonly compact?: boolean;
  readonly categoryPlacement?: 'avatar' | 'meta' | 'none';
  readonly contextVariant?: 'text' | 'badge';
  readonly compactMetaLayout?: 'inline' | 'stacked';
  readonly directionLayout?: 'stacked' | 'floating';
}

export function TransactionEventCard({
  accentColor,
  actorAvatarUrl = null,
  actorAvatarVariant = 'person',
  actorFallbackColor,
  actorLabel,
  amountColor,
  amountLabel,
  amountStruckThrough = false,
  badgeBackgroundColor,
  badgeColor,
  badgeIcon,
  category,
  children,
  context,
  contentHref,
  directionLabel,
  href,
  haptic,
  meta,
  onContentPress,
  onPress,
  pending = false,
  pendingHighlightColor,
  statusLabel,
  statusTone = 'neutral',
  style,
  unread = false,
  variant = 'default',
  compact = false,
  categoryPlacement = 'avatar',
  contextVariant = 'text',
  compactMetaLayout = 'inline',
  directionLayout = 'stacked',
}: TransactionEventCardProps) {
  const activeTheme = useAppTheme();
  const router = useRouter();
  type CompactMetaSegment = {
    readonly key: 'context' | 'time' | 'category';
    readonly kind: 'badge' | 'text' | 'category';
    readonly label: string;
  };

  const safeCategory = category ?? 'other';
  const categoryIcon =
    badgeIcon ?? (transactionCategoryIcon(safeCategory) as keyof typeof Ionicons.glyphMap);
  const resolvedBadgeBackgroundColor =
    badgeBackgroundColor ?? transactionCategoryBackgroundColor(safeCategory);
  const resolvedBadgeColor = badgeColor ?? transactionCategoryColor(safeCategory);
  const pendingTintColor = pendingNotificationSurfaceColor(activeTheme);
  const unreadSurfaceColor =
    unread && pending
      ? pendingTintColor
      : unread && pendingHighlightColor
        ? colorWithAlpha(pendingHighlightColor, 0.1)
        : undefined;
  const hasAction = Boolean(href || onPress);
  const hasContentAction = !hasAction && Boolean(contentHref || onContentPress);
  const isStatusAvatar = actorAvatarVariant === 'system' && Boolean(statusLabel);
  const avatarSize = compact ? 34 : 44;
  const actorIntent = cardStateIntentFromTone(statusTone);
  const haloIntensity = unread || statusTone === 'warning' ? 'strong' : 'soft';
  const haloColor =
    statusTone === 'warning'
      ? cardStateColor('needsAction', 'warning')
      : statusTone === 'danger'
        ? cardStateColor('negative', 'danger')
        : statusTone === 'cycle' || statusTone === 'primary'
          ? cardStateColor('ready', statusTone)
          : amountColor;
  const effectiveHaptic = haptic ?? (hasAction || hasContentAction ? 'selection' : 'none');
  const isSystemAura = actorAvatarVariant === 'system' || safeCategory === 'cycle';
  const shouldShowAura =
    Boolean(pending && unread) ||
    (isSystemAura && (Boolean(amountLabel) || statusTone !== 'neutral' || unread));

  function handleContentPress() {
    if (onContentPress) {
      onContentPress();
      return;
    }

    if (contentHref) {
      pushRoute(router, contentHref);
    }
  }

  const metaParts =
    meta
      ?.split('|')
      .map((part) => part.trim())
      .filter((part) => part.length > 0) ?? [];
  const metaPrimary = metaParts[0] ?? null;
  const metaCategoryLabel =
    categoryPlacement === 'meta' ? (metaParts[1] ?? transactionCategoryLabel(safeCategory)) : null;
  const compactMetaSegments: CompactMetaSegment[] = [];

  if (context) {
    compactMetaSegments.push({
      key: 'context',
      kind: contextVariant === 'badge' ? 'badge' : 'text',
      label: context,
    });
  }

  if (metaPrimary) {
    compactMetaSegments.push({
      key: 'time',
      kind: 'text',
      label: metaPrimary,
    });
  }

  if (metaCategoryLabel) {
    compactMetaSegments.push({
      key: 'category',
      kind: 'category',
      label: metaCategoryLabel,
    });
  }

  const leadingNode = (
    <View style={[styles.avatarWrap, compact ? styles.avatarWrapCompact : null]}>
      <CardActorAvatar
        haloColor={haloColor}
        haloIntensity={haloIntensity}
        haloSize={compact ? 42 : 56}
        intent={actorIntent}
        size={avatarSize}
        tone={statusTone}
      >
        {isStatusAvatar && statusLabel ? (
          <StatusFaceBadge label={statusLabel} size={avatarSize} tone={statusTone} />
        ) : (
          <AppAvatar
            fallbackBackgroundColor={actorFallbackColor}
            fallbackTextColor={activeTheme.colors.white}
            imageUrl={actorAvatarUrl}
            label={actorLabel}
            size={avatarSize}
            variant={actorAvatarVariant}
          />
        )}
      </CardActorAvatar>
      {!isStatusAvatar && categoryPlacement === 'avatar' ? (
        <View
          style={[
            styles.categoryBadge,
            compact ? styles.categoryBadgeCompact : null,
            {
              backgroundColor: resolvedBadgeBackgroundColor,
              borderColor: activeTheme.colors.surface,
            },
          ]}
        >
          <Ionicons color={resolvedBadgeColor} name={categoryIcon} size={compact ? 11 : 13} />
        </View>
      ) : null}
    </View>
  );

  const contextNode = context ? (
    contextVariant === 'badge' ? (
      <View
        style={[
          styles.contextBadge,
          amountColor === activeTheme.colors.success
            ? { backgroundColor: activeTheme.colors.successSoft }
            : null,
          amountColor === activeTheme.colors.warning
            ? { backgroundColor: activeTheme.colors.warningSoft }
            : null,
          amountColor === transactionCategoryColor('cycle')
            ? { backgroundColor: activeTheme.colors.cycleSoft }
            : null,
        ]}
      >
        <AppText style={[styles.contextBadgeText, { color: activeTheme.colors.text }]}>
          {context}
        </AppText>
      </View>
    ) : (
      <AppText
        numberOfLines={1}
        style={[
          styles.context,
          { color: activeTheme.colors.text },
          compact ? styles.contextCompact : null,
        ]}
      >
        {context}
      </AppText>
    )
  ) : null;

  const metaNode =
    compact && categoryPlacement === 'meta' ? (
      compactMetaLayout === 'stacked' ? (
        <View style={styles.compactMetaStack}>
          {contextNode}
          <View style={styles.compactMetaRow}>
            {compactMetaSegments
              .filter((segment) => segment.key !== 'context')
              .map((segment, index) => (
                <View key={segment.key} style={styles.compactMetaSegment}>
                  {index > 0 ? (
                    <View
                      style={[styles.compactMetaDot, { backgroundColor: activeTheme.colors.muted }]}
                    />
                  ) : null}
                  {segment.kind === 'category' ? (
                    <View style={styles.compactMetaCategory}>
                      <Ionicons
                        color={activeTheme.colors.textMuted}
                        name={categoryIcon}
                        size={11}
                      />
                      <AppText
                        numberOfLines={1}
                        style={[styles.compactMetaText, { color: activeTheme.colors.textMuted }]}
                      >
                        {segment.label}
                      </AppText>
                    </View>
                  ) : (
                    <AppText
                      numberOfLines={1}
                      style={[styles.compactMetaText, { color: activeTheme.colors.textMuted }]}
                    >
                      {segment.label}
                    </AppText>
                  )}
                </View>
              ))}
          </View>
        </View>
      ) : (
        <View style={styles.compactMetaRow}>
          {compactMetaSegments.map((segment, index) => (
            <View key={segment.key} style={styles.compactMetaSegment}>
              {index > 0 ? (
                <View
                  style={[styles.compactMetaDot, { backgroundColor: activeTheme.colors.muted }]}
                />
              ) : null}
              {segment.kind === 'badge' ? (
                <View
                  style={[
                    styles.contextBadge,
                    amountColor === activeTheme.colors.success
                      ? { backgroundColor: activeTheme.colors.successSoft }
                      : null,
                    amountColor === activeTheme.colors.warning
                      ? { backgroundColor: activeTheme.colors.warningSoft }
                      : null,
                    amountColor === transactionCategoryColor('cycle')
                      ? { backgroundColor: activeTheme.colors.cycleSoft }
                      : null,
                  ]}
                >
                  <AppText style={[styles.contextBadgeText, { color: activeTheme.colors.text }]}>
                    {segment.label}
                  </AppText>
                </View>
              ) : segment.kind === 'category' ? (
                <View style={styles.compactMetaCategory}>
                  <Ionicons color={activeTheme.colors.textMuted} name={categoryIcon} size={11} />
                  <AppText
                    numberOfLines={1}
                    style={[styles.compactMetaText, { color: activeTheme.colors.textMuted }]}
                  >
                    {segment.label}
                  </AppText>
                </View>
              ) : (
                <AppText
                  numberOfLines={1}
                  style={[styles.compactMetaText, { color: activeTheme.colors.textMuted }]}
                >
                  {segment.label}
                </AppText>
              )}
            </View>
          ))}
        </View>
      )
    ) : (
      <>
        {contextNode}
        {meta ? (
          <AppText
            numberOfLines={1}
            style={[
              styles.meta,
              { color: activeTheme.colors.textMuted },
              compact ? styles.metaCompact : null,
            ]}
          >
            {meta.replace(/\s*\|\s*/g, META_SEPARATOR)}
          </AppText>
        ) : null}
      </>
    );

  const sideNode = (
    <View style={[styles.amountLine, compact ? styles.amountLineCompact : null]}>
      <View
        style={[
          styles.amountStack,
          directionLayout === 'floating' ? styles.amountStackFloating : null,
        ]}
      >
        {directionLabel ? (
          <AppText
            numberOfLines={1}
            style={[
              styles.direction,
              compact ? styles.directionCompact : null,
              directionLayout === 'floating' ? styles.directionFloating : null,
              directionLayout === 'floating' && compact ? styles.directionFloatingCompact : null,
              { color: amountColor },
            ]}
          >
            {directionLabel}
          </AppText>
        ) : null}
        {amountLabel ? (
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.76}
            numberOfLines={1}
            style={[
              styles.amount,
              compact ? styles.amountCompact : null,
              { color: amountColor },
              amountStruckThrough ? styles.amountStruckThrough : null,
            ]}
          >
            {amountLabel}
          </AppText>
        ) : null}
      </View>
      {hasAction ? (
        <Ionicons color={activeTheme.colors.textMuted} name="chevron-forward" size={16} />
      ) : null}
    </View>
  );

  const card = (
    <ActivityItemCard
      accentColor={accentColor}
      attentionDot={unread}
      attentionDotColor={pending ? pendingNotificationDotColor(activeTheme) : undefined}
      compact={compact}
      highlightSurface={pending && unread}
      leadingAccessibilityLabel={`Abrir perfil de ${actorLabel}`}
      leadingDisabled={!hasContentAction}
      leadingHaptic={effectiveHaptic}
      leadingNode={leadingNode}
      metaNode={metaNode}
      onLeadingPress={hasContentAction ? handleContentPress : undefined}
      sideNode={sideNode}
      style={style}
      title={actorLabel}
      titleAccessoryNode={null}
      underlay={
        shouldShowAura ? (
          <StateAuraLayer
            size={unread ? 'large' : compact ? 'compact' : 'regular'}
            variant={stateAuraVariantFromTone(statusTone)}
          />
        ) : undefined
      }
      unread={unread}
      unreadSurfaceColor={unreadSurfaceColor}
      variant={variant}
    >
      {children}
    </ActivityItemCard>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        <CardPressable haptic={effectiveHaptic} style={styles.cardPressable}>
          {card}
        </CardPressable>
      </Link>
    );
  }

  if (onPress) {
    return (
      <CardPressable haptic={effectiveHaptic} onPress={onPress}>
        {card}
      </CardPressable>
    );
  }

  return card;
}

function colorWithAlpha(color: string, alpha: number): string {
  const normalized = color.trim();
  const compactHexMatch = normalized.match(/^#([\da-f]{3})$/i);
  if (compactHexMatch) {
    const [red, green, blue] = compactHexMatch[1].split('').map((entry) => entry + entry);
    return colorWithAlpha(`#${red}${green}${blue}`, alpha);
  }

  const hexMatch = normalized.match(/^#([\da-f]{6})$/i);
  if (!hexMatch) {
    return color;
  }

  const rawHex = hexMatch[1];
  const red = Number.parseInt(rawHex.slice(0, 2), 16);
  const green = Number.parseInt(rawHex.slice(2, 4), 16);
  const blue = Number.parseInt(rawHex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
