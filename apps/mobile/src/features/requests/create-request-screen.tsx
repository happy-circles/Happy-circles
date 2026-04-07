import { StyleSheet, Text, View } from 'react-native';

import { ListCard } from '@/components/list-card';
import { ScreenShell } from '@/components/screen-shell';
import { theme } from '@/lib/theme';

export function CreateRequestScreen() {
  return (
    <ScreenShell
      title="Crear request"
      subtitle="En el MVP, toda deuda o cierre bilateral empieza como negociacion previa."
    >
      <ListCard title="Quien debe a quien" subtitle="Selecciona creador, contraparte, deudor y acreedor." />
      <ListCard title="Monto" subtitle="Siempre en COP y enteros de minor units en backend." />
      <ListCard title="Descripcion" subtitle="Contexto humano sin tocar reglas criticas." />
      <View style={styles.note}>
        <Text style={styles.noteTitle}>Regla dura</Text>
        <Text style={styles.noteBody}>
          El request no afecta balance ni grafo hasta que la contraparte lo acepte.
        </Text>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  note: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.medium,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  noteTitle: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  noteBody: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
