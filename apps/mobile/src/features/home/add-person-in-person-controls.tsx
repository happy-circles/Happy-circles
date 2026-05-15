import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { Animated, Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { addPersonContactsSheetStyles as styles } from '@/features/home/add-person-contacts-sheet.styles';
import type { AddPersonTransactionContext } from '@/features/home/contacts-sheet-helpers';
import { formatCop } from '@/lib/data';
import { useAppTheme } from '@/providers/theme-provider';

export function AddPersonInPersonQrBlock({
  busyKey,
  onOpenScanner,
  onShowMyQr,
}: {
  readonly busyKey: string | null;
  readonly onOpenScanner: () => void;
  readonly onShowMyQr: () => void;
}) {
  const activeTheme = useAppTheme();

  return (
    <View
      style={[
        styles.inPersonBlock,
        {
          backgroundColor: activeTheme.colors.primarySoft,
          borderColor: activeTheme.colors.border,
        },
      ]}
    >
      <View style={styles.inPersonCopy}>
        <AppText style={styles.inPersonTitle}>Conectar en persona</AppText>
        <AppText style={styles.inPersonText}>Usa QR cuando ya están juntos.</AppText>
      </View>
      <View style={styles.inPersonActions}>
        <Pressable
          accessibilityLabel="Escanear QR"
          accessibilityRole="button"
          onPress={onOpenScanner}
          style={({ pressed }) => [
            styles.qrActionButton,
            {
              backgroundColor: activeTheme.colors.surface,
              borderColor: activeTheme.colors.border,
            },
            pressed ? styles.pressed : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.text} name="camera-outline" size={18} />
          <View style={styles.qrActionLabelClip}>
            <AppText numberOfLines={1} style={styles.qrActionText}>
              Escanear QR
            </AppText>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel={busyKey === 'my-qr' ? 'Creando mi QR' : 'Mostrar mi QR'}
          accessibilityRole="button"
          disabled={busyKey === 'my-qr'}
          onPress={onShowMyQr}
          style={({ pressed }) => [
            styles.qrActionButton,
            styles.qrActionButtonPrimary,
            {
              backgroundColor: activeTheme.colors.primary,
              borderColor: activeTheme.colors.primary,
            },
            pressed ? styles.pressed : null,
            busyKey === 'my-qr' ? styles.disabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.onPrimary} name="qr-code-outline" size={18} />
          <View style={styles.qrActionLabelClip}>
            <AppText
              numberOfLines={1}
              style={[styles.qrActionText, { color: activeTheme.colors.onPrimary }]}
            >
              {busyKey === 'my-qr' ? 'Creando...' : 'Mi QR'}
            </AppText>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export function AddPersonTransactionContextBlock({
  transactionContext,
}: {
  readonly transactionContext: AddPersonTransactionContext;
}) {
  const activeTheme = useAppTheme();

  return (
    <View
      style={[
        styles.contextBlock,
        {
          backgroundColor: activeTheme.colors.surfaceMuted,
          borderColor: activeTheme.colors.border,
        },
      ]}
    >
      <AppText style={styles.contextLabel}>Contexto</AppText>
      <AppText style={styles.contextBody}>
        {transactionContext.direction === 'i_owe' ? 'Salida' : 'Entrada'} de{' '}
        {formatCop(transactionContext.amountMinor)}
        {transactionContext.description && transactionContext.description.trim().length > 0
          ? ` por ${transactionContext.description.trim()}`
          : ''}
      </AppText>
    </View>
  );
}

export function AddPersonSearchControls({
  busyKey,
  compactActionsStyle,
  onOpenScanner,
  onShowMyQr,
  searchValue,
  setSearchValue,
}: {
  readonly busyKey: string | null;
  readonly compactActionsStyle?: StyleProp<ViewStyle>;
  readonly onOpenScanner: () => void;
  readonly onShowMyQr: () => void;
  readonly searchValue: string;
  readonly setSearchValue: (value: string) => void;
}) {
  const activeTheme = useAppTheme();

  return (
    <View style={[styles.searchStickyWrap, { backgroundColor: activeTheme.colors.surface }]}>
      <View
        style={[
          styles.searchWrap,
          {
            backgroundColor: activeTheme.colors.surfaceMuted,
            borderColor: activeTheme.colors.border,
          },
        ]}
      >
        <Ionicons color={activeTheme.colors.textMuted} name="search-outline" size={18} />
        <AppTextInput
          autoCapitalize="words"
          autoCorrect={false}
          chrome="plain"
          density="compact"
          onChangeText={setSearchValue}
          placeholder="Buscar en contactos"
          placeholderTextColor={activeTheme.colors.muted}
          style={styles.searchInput}
          value={searchValue}
        />
        <Animated.View style={[styles.compactQrActions, compactActionsStyle]}>
          <Pressable
            accessibilityLabel="Escanear QR"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onOpenScanner}
            style={({ pressed }) => [
              styles.compactQrButton,
              {
                backgroundColor: activeTheme.colors.surface,
                borderColor: activeTheme.colors.border,
              },
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons color={activeTheme.colors.text} name="camera-outline" size={20} />
          </Pressable>
          <Pressable
            accessibilityLabel={busyKey === 'my-qr' ? 'Creando mi QR' : 'Mostrar mi QR'}
            accessibilityRole="button"
            disabled={busyKey === 'my-qr'}
            hitSlop={8}
            onPress={onShowMyQr}
            style={({ pressed }) => [
              styles.compactQrButton,
              styles.compactQrButtonPrimary,
              {
                backgroundColor: activeTheme.colors.primary,
                borderColor: activeTheme.colors.primary,
              },
              pressed ? styles.pressed : null,
              busyKey === 'my-qr' ? styles.disabled : null,
            ]}
          >
            <Ionicons
              color={activeTheme.colors.onPrimary}
              name={busyKey === 'my-qr' ? 'sync-outline' : 'qr-code-outline'}
              size={20}
            />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
