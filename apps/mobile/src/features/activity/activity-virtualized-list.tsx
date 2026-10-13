import type { ReactElement } from 'react';
import { SectionList, View, type SectionListRenderItem } from 'react-native';

import { AppText } from '@/components/app-text';
import {
  BrandedRefreshVirtualizedListContainer,
  type BrandedRefreshProps,
} from '@/components/branded-refresh-control';
import { HISTORY_LIST_RENDER_WINDOW } from '@/components/history-virtualized-list-policy';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';
import { activityScreenStyles as styles } from './activity-screen.styles';
import type { ActivityListSection } from './activity-list-sections';

interface ActivityVirtualizedListProps<T, S extends ActivityListSection<T>> {
  readonly emptyComponent: ReactElement;
  readonly extraData?: unknown;
  readonly headerComponent?: ReactElement | null;
  readonly keyExtractor: (item: T, index: number) => string;
  readonly refresh: BrandedRefreshProps;
  readonly renderItem: SectionListRenderItem<T, S>;
  readonly sections: readonly S[];
}

function NotificationListSeparator() {
  return <View style={{ height: theme.spacing.sm }} />;
}

export function ActivityVirtualizedList<T, S extends ActivityListSection<T>>({
  emptyComponent,
  extraData,
  headerComponent,
  keyExtractor,
  refresh,
  renderItem,
  sections,
}: ActivityVirtualizedListProps<T, S>) {
  const activeTheme = useAppTheme();

  return (
    <BrandedRefreshVirtualizedListContainer refresh={refresh}>
      {(refreshProps) => (
        <SectionList<T, S>
          {...refreshProps}
          {...HISTORY_LIST_RENDER_WINDOW}
          ItemSeparatorComponent={NotificationListSeparator}
          ListEmptyComponent={emptyComponent}
          ListHeaderComponent={headerComponent}
          contentContainerStyle={[
            styles.sheetScrollContent,
            { backgroundColor: activeTheme.colors.surface, gap: 0 },
          ]}
          extraData={extraData}
          keyExtractor={keyExtractor}
          keyboardShouldPersistTaps="handled"
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <AppText
              accessibilityRole="header"
              style={[styles.notificationSectionTitle, { paddingVertical: theme.spacing.sm }]}
            >
              {section.title}
            </AppText>
          )}
          sections={sections}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          style={[styles.pageScroll, { backgroundColor: activeTheme.colors.surface }]}
        />
      )}
    </BrandedRefreshVirtualizedListContainer>
  );
}
