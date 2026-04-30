import { buildNativeAppUrl, type AppLinkGatewayKind } from '@/lib/app-links';

import { AppOpenButton } from './app-open-button';
import { HappyCirclesMark, StoreButtonGrid } from './brand-assets';

const GATEWAY_COPY: Record<
  AppLinkGatewayKind,
  {
    readonly title: string;
    readonly subtitle: string;
    readonly fallbackPath: string;
  }
> = {
  'account-invite': {
    title: 'Acceso privado',
    subtitle: 'Abre Happy Circles para entrar o crear tu cuenta.',
    fallbackPath: '/join',
  },
  'friendship-invite': {
    title: 'Invitacion privada',
    subtitle: 'Abre Happy Circles para continuar con esta invitacion.',
    fallbackPath: '/invite',
  },
  'reset-password': {
    title: 'Restablecer clave',
    subtitle: 'Abre Happy Circles para terminar el cambio de clave.',
    fallbackPath: '/reset-password',
  },
  'setup-account': {
    title: 'Completar perfil',
    subtitle: 'Abre Happy Circles para terminar tu configuracion.',
    fallbackPath: '/setup-account',
  },
  'sign-in': {
    title: 'Ingresar',
    subtitle: 'Abre Happy Circles para continuar.',
    fallbackPath: '/sign-in',
  },
};

export function AppLinkGateway({
  kind,
  token,
}: Readonly<{
  kind: AppLinkGatewayKind;
  token?: string;
}>) {
  const copy = GATEWAY_COPY[kind];
  const fallbackPath = token
    ? `${copy.fallbackPath}/${encodeURIComponent(token)}`
    : copy.fallbackPath;
  const nativeHref = buildNativeAppUrl(fallbackPath);

  return (
    <main className="landingShell gatewayShell">
      <section className="landingPanel gatewayPanel" aria-labelledby="gateway-title">
        <div className="brandStack">
          <HappyCirclesMark />
          <div className="brandCopy">
            <h1 id="gateway-title">{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>
        </div>

        <nav className="landingActions gatewayActions" aria-label="Abrir Happy Circles">
          <AppOpenButton fallbackPath={fallbackPath} />
          <StoreButtonGrid />
          <a className="textLink" href={nativeHref}>
            Reintentar abrir la app
          </a>
        </nav>
      </section>
    </main>
  );
}
