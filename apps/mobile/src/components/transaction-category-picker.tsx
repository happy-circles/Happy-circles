import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  type UserTransactionCategory,
  USER_TRANSACTION_CATEGORIES,
} from '@/lib/transaction-categories';
import { theme } from '@/lib/theme';

const CATEGORY_VISUALS: Record<
  UserTransactionCategory,
  {
    readonly label: string;
    readonly icon: keyof typeof Ionicons.glyphMap;
    readonly color: string;
    readonly backgroundColor: string;
  }
> = {
  food_drinks: {
    label: 'Comida & Bebidas',
    icon: 'restaurant-outline',
    color: '#d33f2f',
    backgroundColor: '#fff0e8',
  },
  transport: {
    label: 'Transporte',
    icon: 'car-sport-outline',
    color: '#2563eb',
    backgroundColor: '#eaf1ff',
  },
  entertainment: {
    label: 'Entretenimiento',
    icon: 'film-outline',
    color: '#7c3aed',
    backgroundColor: '#f0eaff',
  },
  services: {
    label: 'Servicios',
    icon: 'calculator-outline',
    color: '#a35f19',
    backgroundColor: '#fff4dd',
  },
  home: {
    label: 'Hogar',
    icon: 'home-outline',
    color: '#0f8a5f',
    backgroundColor: '#e6f7ef',
  },
  other: {
    label: 'Otra',
    icon: 'ellipsis-horizontal-circle-outline',
    color: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
};

export interface TransactionCategoryPickerProps {
  readonly value: UserTransactionCategory;
  readonly onChange: (value: UserTransactionCategory) => void;
}

export function TransactionCategoryPicker({ value, onChange }: TransactionCategoryPickerProps) {
  return (
    <View style={styles.grid}>
      {USER_TRANSACTION_CATEGORIES.map((category) => {
        const item = CATEGORY_VISUALS[category];
        const selected = category === value;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={category}
            onPress={() => onChange(category)}
            style={({ pressed }) => [
              styles.option,
              selected ? styles.optionSelected : null,
              pressed ? styles.optionPressed : null,
            ]}
          >
            <View
              style={[
                styles.iconBubble,
                {
                  backgroundColor: item.backgroundColor,
                },
              ]}
            >
              <Ionicons color={item.color} name={item.icon} size={22} />
            </View>
            <Text numberOfLines={2} style={[styles.label, selected ? styles.labelSelected : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
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
  labelSelected: {
    color: theme.colors.primary,
    fontWeight: '800',
  },
});
