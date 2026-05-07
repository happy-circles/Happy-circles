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
    const scheme = process.env.NEXT_PUBLIC_APP_SCHEME ?? 'happycircles';

    expect(page).toContain('Happy Circles');
    expect(page).toContain('Abrir Happy Circles');
    expect(page).toContain('Términos');
    expect(page).not.toContain('Terminos');
    expect(buildNativeAppUrl('/join/sample-token', '?source=email', '#open')).toBe(
      `${scheme}://join/sample-token?source=email#open`,
    );
    expect(APP_LINK_PATHS).toEqual([
      '/invite/*',
      '/join*',
      '/reset-password*',
      '/setup-account*',
    ]);

    for (const routePath of [
      ['apps', 'landing', 'app', '(app-links)', 'invite', '[token]', 'page.tsx'],
      ['apps', 'landing', 'app', '(app-links)', 'join', 'page.tsx'],
      ['apps', 'landing', 'app', '(app-links)', 'join', '[token]', 'page.tsx'],
      ['apps', 'landing', 'app', '(app-links)', 'reset-password', 'page.tsx'],
      ['apps', 'landing', 'app', '(app-links)', 'setup-account', 'page.tsx'],
    ]) {
      expect(existsSync(join(repoRoot, ...routePath))).toBe(true);
    }
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
    expect(inviteSurface).toContain('Invitacion a Happy Circles');
    expect(inviteSurface).toContain('Puede recibir invitacion');
    expect(inviteSurface).toContain('Pega un link completo o un codigo valido de invitacion.');
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
    const setupPromptCard = readRepoFile(
      'apps',
      'mobile',
      'src',
      'components',
      'setup-prompt-card.tsx',
    );
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
    const notifications = readRepoFile('apps', 'mobile', 'src', 'lib', 'notifications.ts');
    const appLayout = readRepoFile('apps', 'mobile', 'app', '_layout.tsx');

    expect(setupReminder).toContain("title: 'Confia este telefono'");
    expect(setupReminder).toContain("title: 'Activa tus contactos'");
    expect(setupReminder).toContain("title: 'Activa tus notificaciones'");
    expect(setupReminder).toContain("'/people?addPerson=1'");
    expect(setupReminder).toContain("'/profile?focus=notifications'");
    expect(setupReminder).not.toContain('cuando quieras terminar la configuracion');
    expect(setupPromptCard).toContain(
      'Hay ${actionCount} ajustes pendientes para completar seguridad, acceso y avisos.',
    );
    expect(profileHelpers).toContain("resolvedFocusTarget === 'notifications'");
    expect(profileScreen).toContain('resolveProfileFocusRequest');
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

    expect(activityScreen).toContain('openNotificationTarget(detailHref)');
    expect(activityScreen).toContain('pendingDetailHref(item, people)');
    expect(activityScreen).not.toContain('Ver Happy Circle');
    expect(activityScreen).not.toContain('useAcceptFinancialRequestMutation');
    expect(activityScreen).not.toContain('useRejectFinancialRequestMutation');
    expect(activityScreen).not.toContain('useAmendFinancialRequestMutation');
    expect(activityScreen).not.toContain('useApproveSettlementMutation');
    expect(activityScreen).not.toContain('useRejectSettlementMutation');
    expect(activityScreen).not.toContain('useExecuteSettlementMutation');
  });
});
