import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  type UserTransactionCategory,
  USER_TRANSACTION_CATEGORIES,
} from '@/lib/transaction-categories';
import { theme, type AppTheme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

const CATEGORY_VISUALS: Record<
  UserTransactionCategory,
  {
    readonly label: string;
    readonly compactLabel: string;
    readonly icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  food_drinks: {
    label: 'Comida & Bebidas',
    compactLabel: 'Comida',
    icon: 'restaurant-outline',
  },
  transport: {
    label: 'Transporte',
    compactLabel: 'Transporte',
    icon: 'car-sport-outline',
  },
  entertainment: {
    label: 'Entretenimiento',
    compactLabel: 'Entretenimiento',
    icon: 'film-outline',
  },
  services: {
    label: 'Servicios',
    compactLabel: 'Servicios',
    icon: 'calculator-outline',
  },
  home: {
    label: 'Hogar',
    compactLabel: 'Hogar',
    icon: 'home-outline',
  },
  other: {
    label: 'Otra',
    compactLabel: 'Otra',
    icon: 'ellipsis-horizontal-circle-outline',
  },
};

function categoryVisualColors(category: UserTransactionCategory, activeTheme: AppTheme) {
  if (category === 'food_drinks') {
    return activeTheme.palette.category.food;
  }

  if (category === 'transport') {
    return activeTheme.palette.category.cycle;
  }

  if (category === 'entertainment') {
    return activeTheme.palette.category.fun;
  }

  if (category === 'services') {
    return activeTheme.palette.category.transport;
  }

  if (category === 'home') {
    return activeTheme.palette.category.home;
  }

  return {
    backgroundColor: activeTheme.colors.primarySoft,
    color: activeTheme.colors.primary,
  };
}

export interface TransactionCategoryPickerProps {
  readonly value: UserTransactionCategory;
  readonly onChange: (value: UserTransactionCategory) => void;
  readonly variant?: 'grid' | 'carousel' | 'inline-grid';
}

export function TransactionCategoryPicker({
  value,
  onChange,
  variant = 'grid',
}: TransactionCategoryPickerProps) {
  const activeTheme = useAppTheme();
  const content = USER_TRANSACTION_CATEGORIES.map((category) => {
    const item = CATEGORY_VISUALS[category];
    const colors = categoryVisualColors(category, activeTheme);
    const selected = category === value;

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        key={category}
        onPress={() => onChange(category)}
        style={({ pressed }) => [
          variant === 'carousel'
            ? styles.carouselOption
            : variant === 'inline-grid'
              ? styles.inlineGridOption
              : styles.option,
          {
            backgroundColor: selected
              ? activeTheme.colors.primarySoft
              : activeTheme.colors.surface,
            borderColor: selected ? activeTheme.colors.primary : activeTheme.colors.border,
          },
          pressed ? styles.optionPressed : null,
        ]}
      >
        <View
          style={[
            styles.iconBubble,
            {
              backgroundColor: colors.backgroundColor,
            },
          ]}
        >
          <Ionicons color={colors.color} name={item.icon} size={22} />
        </View>
        <AppText
          numberOfLines={variant === 'grid' ? 2 : 1}
          style={[
            styles.label,
            variant === 'inline-grid' ? styles.inlineGridLabel : null,
            { color: selected ? activeTheme.colors.primary : activeTheme.colors.text },
            selected ? styles.labelSelected : null,
          ]}
        >
          {variant === 'carousel' ? item.compactLabel : item.label}
        </AppText>
      </Pressable>
    );
  });

  if (variant === 'carousel') {
    return (
      <ScrollView
        horizontal
        contentContainerStyle={styles.carouselContent}
        showsHorizontalScrollIndicator={false}
      >
        {content}
      </ScrollView>
    );
  }

  return <View style={styles.grid}>{content}</View>;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  option: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.small,
    borderWidth: 1,
    flexBasis: '31.5%',
    flexGrow: 1,
    gap: theme.spacing.xs,
    minHeight: 88,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  carouselContent: {
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.sm,
  },
  carouselOption: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    gap: theme.spacing.xs,
    minHeight: 82,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    width: 96,
  },
  inlineGridOption: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexBasis: '31.5%',
    flexDirection: 'row',
    flexGrow: 1,
    gap: theme.spacing.xs,
    minHeight: 74,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  optionSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  optionPressed: {
    opacity: 0.86,
  },
  iconBubble: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
  inlineGridLabel: {
    flex: 1,
    lineHeight: 17,
    textAlign: 'left',
  },
  labelSelected: {
    color: theme.colors.primary,
    fontWeight: '800',
  },
});
