import { buildNativeAppUrl, type AppLinkGatewayKind } from '@/lib/app-links';

import { AppOpenButton } from './app-open-button';
import { HappyCirclesMark, StoreButtonGrid } from './brand-assets';

const GATEWAY_COPY: Record<
  AppLinkGatewayKind,
  {
    readonly title: string;
    readonly subtitle: string;
    readonly fallbackPath: string;
    readonly nativePath?: string;
  }
> = {
  'account-invite': {
    title: 'Acceso privado',
    subtitle: 'Abre Happy Circles para entrar o crear tu cuenta.',
    fallbackPath: '/join',
  },
  'friendship-invite': {
    title: 'Invitación privada',
    subtitle: 'Abre Happy Circles para continuar con esta invitación.',
    fallbackPath: '/invite',
  },
  join: {
    title: 'Ingresar',
    subtitle: 'Abre Happy Circles para continuar.',
    fallbackPath: '/join',
    nativePath: '/join?mode=sign-in',
  },
  'reset-password': {
    title: 'Restablecer contraseña',
    subtitle: 'Abre Happy Circles para terminar el cambio de contraseña.',
    fallbackPath: '/reset-password',
  },
  'setup-account': {
    title: 'Completar perfil',
    subtitle: 'Abre Happy Circles para terminar tu configuración.',
    fallbackPath: '/setup-account',
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
  const nativePath = token ? fallbackPath : (copy.nativePath ?? fallbackPath);
  const nativeHref = buildNativeAppUrl(nativePath);

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
          <AppOpenButton fallbackPath={fallbackPath} nativePath={nativePath} />
          <StoreButtonGrid />
          <a className="textLink" href={nativeHref}>
            Reintentar abrir la app
          </a>
        </nav>
      </section>
    </main>
  );
}
