import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter, type Href } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActivityItemCard } from '@/components/activity-item-card';
import { AppAvatar, type AppAvatarVariant } from '@/components/app-avatar';
import { StatusChip, type StatusChipProps } from '@/components/status-chip';
import { pushRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';

const DEFAULT_PENDING_SURFACE_COLOR = '#fff9ed';
const DEFAULT_PENDING_BORDER_COLOR = 'rgba(163, 95, 25, 0.14)';
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
  const pendingSurfaceColor = pendingHighlightColor
    ? withAlpha(pendingHighlightColor, 0.1)
    : DEFAULT_PENDING_SURFACE_COLOR;
  const pendingBorderColor = pendingHighlightColor
    ? withAlpha(pendingHighlightColor, 0.22)
    : DEFAULT_PENDING_BORDER_COLOR;
  const hasAction = Boolean(href || onPress);
  const hasContentAction = !hasAction && Boolean(contentHref || onContentPress);

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
      <AppAvatar
        fallbackBackgroundColor={actorFallbackColor}
        fallbackTextColor={theme.colors.white}
        imageUrl={actorAvatarUrl}
        label={actorLabel}
        rounded={false}
        size={compact ? 34 : 44}
        variant={actorAvatarVariant}
      />
      {categoryPlacement === 'avatar' ? (
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
        <Text style={styles.contextBadgeText}>{context}</Text>
      </View>
    ) : (
      <Text numberOfLines={1} style={[styles.context, compact ? styles.contextCompact : null]}>
        {context}
      </Text>
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
                      <Text numberOfLines={1} style={styles.compactMetaText}>
                        {segment.label}
                      </Text>
                    </View>
                  ) : (
                    <Text numberOfLines={1} style={styles.compactMetaText}>
                      {segment.label}
                    </Text>
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
                  <Text style={styles.contextBadgeText}>{segment.label}</Text>
                </View>
              ) : segment.kind === 'category' ? (
                <View style={styles.compactMetaCategory}>
                  <Ionicons color={theme.colors.textMuted} name={categoryIcon} size={11} />
                  <Text numberOfLines={1} style={styles.compactMetaText}>
                    {segment.label}
                  </Text>
                </View>
              ) : (
                <Text numberOfLines={1} style={styles.compactMetaText}>
                  {segment.label}
                </Text>
              )}
            </View>
          ))}
        </View>
      )
    ) : (
      <>
        {contextNode}
        {meta ? (
          <Text numberOfLines={1} style={[styles.meta, compact ? styles.metaCompact : null]}>
            {meta.replace(/\s*\|\s*/g, META_SEPARATOR)}
          </Text>
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
          <Text
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
          </Text>
        ) : null}
        {amountLabel ? (
          <Text
            numberOfLines={1}
            style={[
              styles.amount,
              compact ? styles.amountCompact : null,
              { color: amountColor },
              amountStruckThrough ? styles.amountStruckThrough : null,
            ]}
          >
            {amountLabel}
          </Text>
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
      compact={compact}
      leadingAccessibilityLabel={`Abrir perfil de ${actorLabel}`}
      leadingDisabled={!hasContentAction}
      leadingNode={leadingNode}
      metaNode={metaNode}
      onLeadingPress={hasContentAction ? handleContentPress : undefined}
      pendingBorderColor={pending ? pendingBorderColor : undefined}
      pendingSurfaceColor={pending ? pendingSurfaceColor : undefined}
      sideNode={sideNode}
      title={actorLabel}
      titleAccessoryNode={
        statusLabel ? <StatusChip compact iconOnly label={statusLabel} tone={statusTone} /> : null
      }
      unread={unread}
      variant={variant}
    >
      {children}
    </ActivityItemCard>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        <Pressable style={({ pressed }) => [pressed ? styles.pressed : null]}>{card}</Pressable>
      </Link>
    );
  }

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed ? styles.pressed : null]}>
        {card}
      </Pressable>
    );
  }

  return card;
}

const styles = StyleSheet.create({
  avatarWrap: {
    height: 48,
    justifyContent: 'center',
    position: 'relative',
    width: 48,
  },
  avatarWrapCompact: {
    height: 36,
    width: 36,
  },
  categoryBadge: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    bottom: -1,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
    width: 22,
  },
  categoryBadgeCompact: {
    borderWidth: 1.5,
    height: 16,
    width: 16,
  },
  context: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    lineHeight: 17,
  },
  contextCompact: {
    fontSize: 12,
    lineHeight: 15,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  metaCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  compactMetaStack: {
    gap: 2,
  },
  compactMetaRow: {
    alignItems: 'center',
    columnGap: 6,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    minWidth: 0,
    rowGap: 4,
  },
  compactMetaSegment: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
    maxWidth: '100%',
    minWidth: 0,
  },
  compactMetaDot: {
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.pill,
    height: 3.5,
    width: 3.5,
  },
  compactMetaCategory: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
    maxWidth: '100%',
    minWidth: 0,
  },
  compactMetaText: {
    color: theme.colors.textMuted,
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
  },
  contextBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  contextBadgePositive: {
    backgroundColor: theme.colors.successSoft,
  },
  contextBadgeNegative: {
    backgroundColor: theme.colors.warningSoft,
  },
  contextBadgeCycle: {
    backgroundColor: '#eaf1ff',
  },
  contextBadgeText: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  direction: {
    fontSize: theme.typography.caption,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
  },
  directionCompact: {
    fontSize: 11,
    lineHeight: 13,
  },
  directionFloating: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 1,
  },
  directionFloatingCompact: {
    top: 0,
  },
  amountLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  amountLineCompact: {
    gap: 3,
  },
  amountStack: {
    alignItems: 'center',
    minWidth: 0,
    position: 'relative',
  },
  amountStackFloating: {
    height: 32,
    justifyContent: 'center',
    minWidth: 72,
  },
  amount: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  amountCompact: {
    fontSize: 15,
    lineHeight: 18,
  },
  amountStruckThrough: {
    opacity: 0.72,
    textDecorationLine: 'line-through',
  },
  pressed: {
    opacity: 0.6,
  },
});
