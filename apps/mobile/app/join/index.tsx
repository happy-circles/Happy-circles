import { Text } from 'react-native';

import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SurfaceCard } from '@/components/surface-card';

export default function JoinIndexRoute() {
  return (
    <ScreenShell
      largeTitle={false}
      subtitle="Happy Circles usa invitaciones privadas para controlar el acceso."
      title="Necesitas una invitacion"
    >
      <SurfaceCard padding="lg">
        <Text style={{ color: '#0F1728', fontSize: 16, fontWeight: '800' }}>
          Abre tu link de invitacion
        </Text>
        <Text style={{ color: '#5B6575', fontSize: 14, lineHeight: 20 }}>
          Si alguien ya te invito, vuelve a abrir ese link desde WhatsApp, correo o QR.
        </Text>
      </SurfaceCard>
      <PrimaryAction href="/sign-in?mode=sign-in" label="Ingresar si ya tienes cuenta" variant="secondary" />
    </ScreenShell>
  );
}
