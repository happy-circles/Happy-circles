import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter, type Href } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { ActivityItemCard } from '@/components/activity-item-card';
import { AppAvatar, type AppAvatarVariant } from '@/components/app-avatar';
import { CardPressable } from '@/components/card-shell';
import { StatusFaceBadge } from '@/components/status-face-badge';
import type { StatusChipProps } from '@/components/status-chip';
import type { AppHapticFeedback } from '@/lib/app-haptics';
import { pushRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';
import { transactionEventCardStyles as styles } from './transaction-event-card-styles';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import { AppText } from '@/components/app-text';

const META_SEPARATOR = ` ${String.fromCharCode(183)} `;

export interface TransactionEventCardProps extends PropsWithChildren {
  readonly accentColor: string;
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
  readonly unread?: boolean;
  readonly variant?: 'default' | 'muted' | 'accent' | 'elevated';
  readonly compact?: boolean;
  readonly categoryPlacement?: 'avatar' | 'meta' | 'none';
  readonly contextVariant?: 'text' | 'badge';
  readonly compactMetaLayout?: 'inline' | 'stacked';
  readonly directionLayout?: 'stacked' | 'floating';
}

function withAlpha(color: string, alpha: number): string {
  const normalized = color.trim();
  const compactHexMatch = normalized.match(/^#([\da-f]{3})$/i);
  if (compactHexMatch) {
    const [r, g, b] = compactHexMatch[1].split('').map((entry) => entry + entry);
    return withAlpha(`#${r}${g}${b}`, alpha);
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
  haptic = 'none',
  meta,
  onContentPress,
  onPress,
  pending = false,
  pendingHighlightColor,
  statusLabel,
  statusTone = 'neutral',
  unread = false,
  variant = 'default',
  compact = false,
  categoryPlacement = 'avatar',
  contextVariant = 'text',
  compactMetaLayout = 'inline',
  directionLayout = 'stacked',
}: TransactionEventCardProps) {
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
  const unreadSurfaceColor = withAlpha(pendingHighlightColor ?? accentColor, 0.1);
  const hasAction = Boolean(href || onPress);
  const hasContentAction = !hasAction && Boolean(contentHref || onContentPress);
  const isStatusAvatar = actorAvatarVariant === 'system' && Boolean(statusLabel);
  const avatarSize = compact ? 34 : 44;

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
      {isStatusAvatar && statusLabel ? (
        <StatusFaceBadge label={statusLabel} size={avatarSize} tone={statusTone} />
      ) : (
        <AppAvatar
          fallbackBackgroundColor={actorFallbackColor}
          fallbackTextColor={theme.colors.white}
          imageUrl={actorAvatarUrl}
          label={actorLabel}
          rounded={false}
          size={avatarSize}
          variant={actorAvatarVariant}
        />
      )}
      {!isStatusAvatar && categoryPlacement === 'avatar' ? (
        <View
          style={[
            styles.categoryBadge,
            compact ? styles.categoryBadgeCompact : null,
            {
              backgroundColor: resolvedBadgeBackgroundColor,
              borderColor: theme.colors.surface,
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
          amountColor === theme.colors.success ? styles.contextBadgePositive : null,
          amountColor === theme.colors.warning ? styles.contextBadgeNegative : null,
          amountColor === transactionCategoryColor('cycle') ? styles.contextBadgeCycle : null,
        ]}
      >
        <AppText style={styles.contextBadgeText}>{context}</AppText>
      </View>
    ) : (
      <AppText numberOfLines={1} style={[styles.context, compact ? styles.contextCompact : null]}>
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
                  {index > 0 ? <View style={styles.compactMetaDot} /> : null}
                  {segment.kind === 'category' ? (
                    <View style={styles.compactMetaCategory}>
                      <Ionicons color={theme.colors.textMuted} name={categoryIcon} size={11} />
                      <AppText numberOfLines={1} style={styles.compactMetaText}>
                        {segment.label}
                      </AppText>
                    </View>
                  ) : (
                    <AppText numberOfLines={1} style={styles.compactMetaText}>
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
              {index > 0 ? <View style={styles.compactMetaDot} /> : null}
              {segment.kind === 'badge' ? (
                <View
                  style={[
                    styles.contextBadge,
                    amountColor === theme.colors.success ? styles.contextBadgePositive : null,
                    amountColor === theme.colors.warning ? styles.contextBadgeNegative : null,
                    amountColor === transactionCategoryColor('cycle')
                      ? styles.contextBadgeCycle
                      : null,
                  ]}
                >
                  <AppText style={styles.contextBadgeText}>{segment.label}</AppText>
                </View>
              ) : segment.kind === 'category' ? (
                <View style={styles.compactMetaCategory}>
                  <Ionicons color={theme.colors.textMuted} name={categoryIcon} size={11} />
                  <AppText numberOfLines={1} style={styles.compactMetaText}>
                    {segment.label}
                  </AppText>
                </View>
              ) : (
                <AppText numberOfLines={1} style={styles.compactMetaText}>
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
          <AppText numberOfLines={1} style={[styles.meta, compact ? styles.metaCompact : null]}>
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
        <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
      ) : null}
    </View>
  );

  const card = (
    <ActivityItemCard
      accentColor={accentColor}
      attentionDot={pending}
      compact={compact}
      leadingAccessibilityLabel={`Abrir perfil de ${actorLabel}`}
      leadingDisabled={!hasContentAction}
      leadingNode={leadingNode}
      metaNode={metaNode}
      onLeadingPress={hasContentAction ? handleContentPress : undefined}
      sideNode={sideNode}
      title={actorLabel}
      titleAccessoryNode={null}
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
        <CardPressable haptic={haptic} style={styles.cardPressable}>
          {card}
        </CardPressable>
      </Link>
    );
  }

  if (onPress) {
    return (
      <CardPressable haptic={haptic} onPress={onPress}>
        {card}
      </CardPressable>
    );
  }

  return card;
}
