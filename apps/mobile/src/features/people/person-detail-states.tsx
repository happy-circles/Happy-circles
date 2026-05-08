import { AppText } from '@/components/app-text';
import type { BrandedRefreshProps } from '@/components/branded-refresh-control';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { ScreenShell } from '@/components/screen-shell';
import { personDetailScreenStyles as styles } from './person-detail-screen.styles';

export function PersonDetailLoadingState() {
  return (
    <ScreenShell
      headerVariant="plain"
      largeTitle={false}
      subtitle="Cargando esta relacion."
      title="Persona"
    >
      <HappyCirclesMotion size={108} variant="loading" />
      <AppText style={styles.supportText}>Estamos leyendo el saldo y el historial real.</AppText>
    </ScreenShell>
  );
}

export function PersonDetailErrorState({
  message,
  refresh,
}: {
  readonly message: string;
  readonly refresh: BrandedRefreshProps;
}) {
  return (
    <ScreenShell
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      subtitle="No pudimos cargar esta relacion."
      title="Persona"
    >
      <AppText style={styles.supportText}>{message}</AppText>
    </ScreenShell>
  );
}

export function PersonDetailMissingState({ refresh }: { readonly refresh: BrandedRefreshProps }) {
  return (
    <ScreenShell
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      subtitle="No encontramos esta relacion."
      title="Persona"
    >
      <EmptyState
        description="Prueba desde la lista principal de personas o confirma que la relacion exista en Supabase."
        title="Sin relacion activa"
      />
    </ScreenShell>
  );
}
