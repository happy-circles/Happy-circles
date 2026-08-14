import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { APP_LINK_PATHS, buildNativeAppUrl } from './landing/lib/app-links';

const appsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(appsRoot, '..');

function readRepoFile(...segments: readonly string[]): string {
  return readFileSync(join(repoRoot, ...segments), 'utf8');
}

describe('app smoke checks', () => {
  it('keeps landing value prop, legal links, and app-link routes aligned', () => {
    const page = readRepoFile('apps', 'landing', 'app', 'page.tsx');
    const landingOpenButton = readRepoFile(
      'apps',
      'landing',
      'app',
      '_components',
      'landing-open-app-button.tsx',
    );
    const appOpenButton = readRepoFile(
      'apps',
      'landing',
      'app',
      '_components',
      'app-open-button.tsx',
    );
    const scheme = process.env.NEXT_PUBLIC_APP_SCHEME ?? 'happycircles';

    expect(page).toContain('Happy Circles');
    expect(page).toContain('LandingOpenAppButton');
    expect(landingOpenButton).toContain('Abrir Happy Circles');
    expect(landingOpenButton).toContain('/join?mode=sign-in');
    expect(landingOpenButton).toContain("window.location.assign('/download')");
    expect(appOpenButton).toContain("window.addEventListener('pagehide'");
    expect(appOpenButton).toContain("document.visibilityState === 'visible'");
    expect(page).toContain('Términos');
    expect(page).not.toContain('Terminos');
    expect(buildNativeAppUrl('/join/sample-token', '?source=email', '#open')).toBe(
      `${scheme}://join/sample-token?source=email#open`,
    );
    expect(APP_LINK_PATHS).toEqual(['/invite/*', '/join*', '/reset-password*', '/setup-account*']);

    for (const routePath of [
      ['apps', 'landing', 'app', '(app-links)', 'invite', '[token]', 'page.tsx'],
      ['apps', 'landing', 'app', '(app-links)', 'join', 'page.tsx'],
      ['apps', 'landing', 'app', '(app-links)', 'join', '[token]', 'page.tsx'],
      ['apps', 'landing', 'app', '(app-links)', 'reset-password', 'page.tsx'],
      ['apps', 'landing', 'app', '(app-links)', 'setup-account', 'page.tsx'],
      ['apps', 'landing', 'app', 'opengraph-image.tsx'],
    ]) {
      expect(existsSync(join(repoRoot, ...routePath))).toBe(true);
    }
  });

  it('keeps production terms complete and visible before account creation', () => {
    const terms = readRepoFile('apps', 'landing', 'app', 'terms', 'page.tsx');
    const accountCreationOptions = readRepoFile(
      'apps',
      'mobile',
      'src',
      'features',
      'invites',
      'account-create-account-social-options.tsx',
    );

    expect(terms).toContain('Vigentes desde el 10 de agosto de 2026');
    expect(terms).toContain('Happy Circles no es un banco');
    expect(terms).toContain('proyecto independiente, sin explotación');
    expect(terms).toContain('comercial, y el Servicio se ofrece sin costo');
    expect(terms).toContain('Derechos del consumidor');
    expect(terms).toContain('No imponemos arbitraje obligatorio');
    expect(terms).not.toContain('debe ser revisada y aprobada legalmente');
    expect(accountCreationOptions).toContain('Al crear tu cuenta confirmas');
    expect(accountCreationOptions).toContain('Términos y condiciones');
    expect(accountCreationOptions).toContain('Política de privacidad');
  });

  it('keeps invitation links ready for WhatsApp previews without private payloads', () => {
    const socialPreview = readRepoFile('apps', 'landing', 'lib', 'social-preview.ts');
    const accountInvitePage = readRepoFile(
      'apps',
      'landing',
      'app',
      '(app-links)',
      'join',
      '[token]',
      'page.tsx',
    );
    const friendshipInvitePage = readRepoFile(
      'apps',
      'landing',
      'app',
      '(app-links)',
      'invite',
      '[token]',
      'page.tsx',
    );

    expect(socialPreview).toContain("card: 'summary_large_image'");
    expect(socialPreview).toContain('url: SOCIAL_IMAGE_PATH');
    expect(socialPreview).toContain('Tu acceso privado a Happy Circles');
    expect(socialPreview).toContain('Invitación privada a Happy Circles');
    expect(accountInvitePage).toContain('ACCOUNT_INVITE_SOCIAL_TITLE');
    expect(friendshipInvitePage).toContain('FRIENDSHIP_INVITE_SOCIAL_TITLE');
    expect(socialPreview).not.toMatch(/amount|phone|token|recipient/i);
  });

  it('keeps invite actions free of internal labels', () => {
    const inviteSheet = readRepoFile(
      'apps',
      'mobile',
      'src',
      'features',
      'home',
      'add-person-contacts-sheet.tsx',
    );
    const inviteSheetController = readRepoFile(
      'apps',
      'mobile',
      'src',
      'features',
      'home',
      'add-person-contacts-sheet-controller.ts',
    );
    const inviteQrActions = readRepoFile(
      'apps',
      'mobile',
      'src',
      'features',
      'home',
      'add-person-qr-actions.ts',
    );
    const inviteOutreachActions = readRepoFile(
      'apps',
      'mobile',
      'src',
      'features',
      'home',
      'add-person-outreach-actions.ts',
    );
    const inviteSurface = `${inviteSheet}\n${inviteSheetController}\n${inviteQrActions}\n${inviteOutreachActions}`;

    expect(inviteSurface).not.toContain('Fallback light');
    expect(inviteSurface).not.toContain('Receiver');
    expect(inviteSurface).toContain('Invitación a Happy Circles');
    expect(inviteSurface).toContain('Puede recibir invitación');
    expect(inviteSurface).toContain('Pega un enlace completo o un código válido de invitación.');
  });

  it('keeps reset-password recovery and invalid-link states separated', () => {
    const resetPasswordScreen = readRepoFile(
      'apps',
      'mobile',
      'src',
      'features',
      'auth',
      'reset-password-screen.tsx',
    );

    expect(resetPasswordScreen).toContain('Restablece tu contraseña');
    expect(resetPasswordScreen).toContain('Enlace no disponible');
    expect(resetPasswordScreen).toContain('Este enlace ya no es válido');
    expect(resetPasswordScreen).toContain('{hasRecoverySession ? (');
    expect(resetPasswordScreen).not.toContain('contrasena');
  });

  it('keeps setup reminders concise and routed to the exact setup surface', () => {
    const setupReminder = readRepoFile('apps', 'mobile', 'src', 'lib', 'setup-reminder.ts');
    const profileScreen = readRepoFile(
      'apps',
      'mobile',
      'src',
      'features',
      'profile',
      'profile-screen-runtime.tsx',
    );
    const profileHelpers = readRepoFile(
      'apps',
      'mobile',
      'src',
      'features',
      'profile',
      'profile-helpers.ts',
    );
    const profileFocusController = readRepoFile(
      'apps',
      'mobile',
      'src',
      'features',
      'profile',
      'profile-focus-controller.ts',
    );
    const notifications = readRepoFile('apps', 'mobile', 'src', 'lib', 'notifications.ts');
    const appLayout = readRepoFile('apps', 'mobile', 'app', '_layout.tsx');

    expect(setupReminder).toContain("title: 'Confía este teléfono'");
    expect(setupReminder).toContain("title: 'Activa tus contactos'");
    expect(setupReminder).toContain("title: 'Activa tus notificaciones'");
    expect(setupReminder).toContain("'/people?addPerson=1'");
    expect(setupReminder).toContain("'/profile?focus=notifications'");
    expect(setupReminder).not.toContain('cuando quieras terminar la configuracion');
    expect(profileHelpers).toContain("resolvedFocusTarget === 'notifications'");
    expect(profileScreen).toContain('useProfileFocusController');
    expect(profileFocusController).toContain('resolveProfileFocusRequest');
    expect(profileScreen).toContain("highlightTarget === 'account'");
    expect(notifications).toContain('getLastNotificationResponseAsync');
    expect(appLayout).toContain('getLastNotificationRoute');
    expect(appLayout).toContain('notificationRouteFromResponse(response)');
  });

  it('keeps transaction notifications as navigation-only surfaces', () => {
    const activityScreen = readRepoFile(
      'apps',
      'mobile',
      'src',
      'features',
      'activity',
      'activity-screen-runtime.tsx',
    );

    expect(activityScreen).toContain('openNotificationTarget(detailHref, item)');
    expect(activityScreen).toContain('pendingDetailHref(item, people)');
    expect(activityScreen).not.toContain('Ver Happy Circle');
    expect(activityScreen).not.toContain('useAcceptFinancialRequestMutation');
    expect(activityScreen).not.toContain('useRejectFinancialRequestMutation');
    expect(activityScreen).not.toContain('useAmendFinancialRequestMutation');
    expect(activityScreen).not.toContain('useApproveSettlementMutation');
    expect(activityScreen).not.toContain('useRejectSettlementMutation');
    expect(activityScreen).not.toContain('useExecuteSettlementMutation');
  });

  it('keeps amended financial requests wired to push notifications', () => {
    const amendFinancialRequest = readRepoFile(
      'supabase',
      'functions',
      'amend-financial-request',
      'index.ts',
    );

    expect(amendFinancialRequest).toContain("readPayloadString(data, 'amendedRequestId')");
    expect(amendFinancialRequest).not.toContain("readPayloadString(data, 'requestId')");
  });

  it('emulates email confirmation and native callbacks in local auth', () => {
    const supabaseConfig = readRepoFile('supabase', 'config.toml');
    const confirmationTemplate = readRepoFile(
      'supabase',
      'templates',
      'auth',
      'confirmation.html',
    );
    const recoveryTemplate = readRepoFile(
      'supabase',
      'templates',
      'auth',
      'recovery.html',
    );

    expect(supabaseConfig).toContain('enable_confirmations = true');
    expect(supabaseConfig).toContain('"happycircles://**"');
    expect(supabaseConfig).toContain('"http://localhost:8081/**"');
    expect(supabaseConfig).toContain('"http://127.0.0.1:8081/**"');
    expect(confirmationTemplate).toContain('Código manual en la app');
    expect(recoveryTemplate).toContain('Restablece tu contraseña');
    expect(`${confirmationTemplate}\n${recoveryTemplate}`).not.toMatch(/Ã|Â|ï¿½/);
  });
});
