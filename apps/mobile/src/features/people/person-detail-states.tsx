import { AppText } from '@/components/app-text';
import { AppHeaderBackButton } from '@/components/app-header-back-button';
import type { BrandedRefreshProps } from '@/components/branded-refresh-control';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { ScreenShell } from '@/components/screen-shell';
import { personDetailScreenStyles as styles } from './person-detail-screen.styles';

export function PersonDetailLoadingState({ onBack }: { readonly onBack: () => void }) {
  return (
    <ScreenShell
      headerLeading={<AppHeaderBackButton onPress={onBack} />}
      headerVariant="plain"
      largeTitle={false}
      subtitle="Cargando esta relación."
      title="Persona"
    >
      <HappyCirclesMotion size={108} variant="loading" />
      <AppText style={styles.supportText}>Estamos leyendo el saldo y el historial real.</AppText>
    </ScreenShell>
  );
}

export function PersonDetailErrorState({
  message,
  onBack,
  refresh,
}: {
  readonly message: string;
  readonly onBack: () => void;
  readonly refresh: BrandedRefreshProps;
}) {
  return (
    <ScreenShell
      headerLeading={<AppHeaderBackButton onPress={onBack} />}
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      subtitle="No pudimos cargar esta relación."
      title="Persona"
    >
      <AppText style={styles.supportText}>{message}</AppText>
    </ScreenShell>
  );
}

export function PersonDetailMissingState({
  onBack,
  refresh,
}: {
  readonly onBack: () => void;
  readonly refresh: BrandedRefreshProps;
}) {
  return (
    <ScreenShell
      headerLeading={<AppHeaderBackButton onPress={onBack} />}
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      subtitle="No encontramos esta relación."
      title="Persona"
    >
      <EmptyState
        description="Prueba desde la lista principal de personas o confirma que la relación siga activa."
        title="Sin relación activa"
      />
    </ScreenShell>
  );
}
