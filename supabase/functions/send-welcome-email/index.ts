import { createServiceRoleClient, handleRpc } from '../_shared/http.ts';

interface WelcomeEmailClaim {
  readonly email: string;
  readonly display_name: string;
}

interface AuthUserEmailState {
  readonly email_confirmed_at?: string | null;
  readonly confirmed_at?: string | null;
}

const DEFAULT_APP_ORIGIN = 'https://app.happy-circles.com';
const DEFAULT_FROM = 'Happy Circles <hola@happy-circles.com>';

function readOptionalEnv(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value && value.length > 0 ? value : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function resolveFirstName(displayName: string): string {
  const firstName = displayName.trim().split(/\s+/)[0];
  return firstName && firstName.length > 0 ? firstName : 'ahi';
}

function isEmailConfirmed(user: AuthUserEmailState | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at ?? user?.confirmed_at);
}

function buildWelcomeHtml(input: {
  readonly appOrigin: string;
  readonly displayName: string;
  readonly firstName: string;
}): string {
  const escapedDisplayName = escapeHtml(input.displayName);
  const escapedFirstName = escapeHtml(input.firstName);
  const appUrl = `${input.appOrigin.replace(/\/+$/, '')}/home`;
  const escapedAppUrl = escapeHtml(appUrl);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bienvenido a Happy Circles</title>
  </head>
  <body style="margin:0;background:#eef1f6;color:#0f1728;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tu cuenta ya está lista para usar Happy Circles.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dde4ee;border-radius:28px;overflow:hidden;">
            <tr>
              <td style="background:#1a2744;padding:34px 34px 30px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <div style="font-size:12px;line-height:1.4;color:#dfe5ef;">Happy Circles</div>
                      <h1 style="margin:10px 0 0;color:#ffffff;font-size:30px;line-height:1.12;font-weight:700;">Tu cuenta ya está lista</h1>
                    </td>
                    <td align="right" style="width:92px;vertical-align:middle;">
                      <svg width="78" height="78" viewBox="120 120 440 440" role="img" aria-label="Happy Circles">
                        <path d="M 215 340 A 125 125 0 0 1 465 340" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-width="40" />
                        <path d="M 215 340 A 125 125 0 0 0 340 465" fill="none" stroke="#3dba6e" stroke-linecap="round" stroke-width="40" />
                        <path d="M 465 340 A 125 125 0 0 1 340 465" fill="none" stroke="#e8604a" stroke-linecap="round" stroke-width="40" />
                        <circle cx="182" cy="340" r="34" fill="#3dba6e" />
                        <circle cx="340" cy="182" r="34" fill="#ffffff" />
                        <circle cx="498" cy="340" r="34" fill="#e8604a" />
                        <circle cx="340" cy="498" r="34" fill="#ffffff" />
                        <circle cx="340" cy="340" r="50" fill="#3dba6e" />
                        <circle cx="325" cy="331" r="7" fill="#ffffff" />
                        <circle cx="355" cy="331" r="7" fill="#ffffff" />
                        <path d="M 320 349 Q 340 369 360 349" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-width="6.5" />
                      </svg>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px;">
                <p style="margin:0;font-size:17px;line-height:1.58;color:#344054;">
                  Hola ${escapedFirstName}, terminaste la configuración principal de tu cuenta. Ya puedes conectar tus círculos, registrar movimientos y mantener los saldos claros con ${escapedDisplayName} como tu perfil.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;border-collapse:separate;">
                  <tr>
                    <td style="padding:22px;background:#f7f8fb;border:1px solid #e6ebf3;border-radius:22px;">
                      <div style="font-size:12px;line-height:1.4;color:#667085;">Listo para empezar</div>
                      <div style="margin-top:8px;font-size:19px;line-height:1.35;color:#1a2744;font-weight:700;">Tu correo, perfil y dispositivo quedaron verificados.</div>
                      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
                        <tr>
                          <td style="background:#1a2744;border-radius:999px;">
                            <a href="${escapedAppUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:15px;line-height:1;font-weight:700;">Abrir Happy Circles</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:0 0 16px;">
                      <div style="font-size:13px;line-height:1.4;color:#667085;">Que sigue</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 14px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width:10px;border-radius:999px;background:#3dba6e;"></td>
                          <td style="padding-left:14px;">
                            <div style="font-size:14px;line-height:1.45;color:#1a2744;font-weight:700;">Conecta tus personas</div>
                            <div style="margin-top:4px;font-size:14px;line-height:1.55;color:#667085;">Agrega contactos de confianza y arma los círculos donde quieres llevar cuentas compartidas.</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width:10px;border-radius:999px;background:#e8604a;"></td>
                          <td style="padding-left:14px;">
                            <div style="font-size:14px;line-height:1.45;color:#1a2744;font-weight:700;">Registra con contexto</div>
                            <div style="margin-top:4px;font-size:14px;line-height:1.55;color:#667085;">Usa solicitudes, aprobaciones y saldos para que todos vean lo mismo sin conversaciones largas.</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#98a2b3;">
                  Te enviaremos correos solo cuando haya acciones importantes para tu cuenta.
                </p>
              </td>
            </tr>
          </table>
          <p style="max-width:600px;margin:18px auto 0;font-size:12px;line-height:1.5;color:#98a2b3;text-align:center;">
            Happy Circles
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildWelcomeText(input: {
  readonly appOrigin: string;
  readonly displayName: string;
  readonly firstName: string;
}): string {
  const appUrl = `${input.appOrigin.replace(/\/+$/, '')}/home`;

  return [
    `Hola ${input.firstName},`,
    '',
    'Tu cuenta de Happy Circles ya está lista.',
    '',
    `Perfil: ${input.displayName}`,
    'Correo confirmado, perfil completo y dispositivo validado.',
    '',
    'Ya puedes conectar tus círculos, registrar movimientos y mantener los saldos claros.',
    '',
    `Abrir Happy Circles: ${appUrl}`,
  ].join('\n');
}

async function releaseClaim(
  client: ReturnType<typeof createServiceRoleClient>,
  actorUserId: string,
  reason: string,
) {
  const { error } = await client.rpc('release_welcome_email_delivery', {
    p_actor_user_id: actorUserId,
    p_error: reason,
  });

  if (error) {
    console.error('welcome_email_release_failed', { detail: error.message });
  }
}

Deno.serve((request) =>
  handleRpc(request, async (_body, actorUserId) => {
    const enabled = readOptionalEnv('WELCOME_EMAIL_ENABLED');
    if (enabled?.toLocaleLowerCase('en-US') === 'false') {
      return { sent: false, reason: 'disabled' };
    }

    const resendApiKey = readOptionalEnv('RESEND_API_KEY');
    if (!resendApiKey) {
      return { sent: false, reason: 'email_not_configured' };
    }

    const client = createServiceRoleClient();
    const { data: userResult, error: userError } = await client.auth.admin.getUserById(actorUserId);

    if (userError || !userResult.user) {
      console.error('welcome_email_auth_user_unavailable', {
        detail: userError?.message ?? 'actor_profile_not_found',
      });
      return { sent: false, reason: 'auth_user_unavailable' };
    }

    if (!isEmailConfirmed(userResult.user as AuthUserEmailState)) {
      return { sent: false, reason: 'email_not_confirmed' };
    }

    const { data: claims, error: claimError } = await client.rpc('claim_welcome_email_delivery', {
      p_actor_user_id: actorUserId,
    });

    if (claimError) {
      console.error('welcome_email_claim_failed', { detail: claimError.message });
      return { sent: false, reason: 'delivery_state_unavailable' };
    }

    const claim = Array.isArray(claims) ? (claims[0] as WelcomeEmailClaim | undefined) : undefined;
    if (!claim) {
      return { sent: false, reason: 'not_ready_or_already_sent' };
    }

    const appOrigin =
      readOptionalEnv('APP_WEB_ORIGIN') ??
      readOptionalEnv('EXPO_PUBLIC_APP_WEB_ORIGIN') ??
      DEFAULT_APP_ORIGIN;
    const from = readOptionalEnv('WELCOME_EMAIL_FROM') ?? DEFAULT_FROM;
    const replyTo = readOptionalEnv('WELCOME_EMAIL_REPLY_TO');
    const firstName = resolveFirstName(claim.display_name);
    const html = buildWelcomeHtml({
      appOrigin,
      displayName: claim.display_name,
      firstName,
    });
    const text = buildWelcomeText({
      appOrigin,
      displayName: claim.display_name,
      firstName,
    });

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [claim.email],
        subject: 'Bienvenido a Happy Circles',
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!resendResponse.ok) {
      const detail = (await resendResponse.text()).slice(0, 240);
      await releaseClaim(client, actorUserId, `resend_${resendResponse.status}: ${detail}`);
      console.error('welcome_email_provider_rejected', {
        detail,
        status: resendResponse.status,
      });
      return { sent: false, reason: 'provider_rejected' };
    }

    const { error: markError } = await client.rpc('mark_welcome_email_sent', {
      p_actor_user_id: actorUserId,
    });

    if (markError) {
      console.error('welcome_email_mark_failed', { detail: markError.message });
      return { sent: true, reason: 'tracking_failed' };
    }

    return { sent: true };
  }),
);
