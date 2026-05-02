import {
  createClientFingerprintHash,
  createServiceRoleClient,
  handlePublicRpc,
  requireString,
} from '../_shared/http.ts';

Deno.serve((request) =>
  handlePublicRpc(request, async (body) => {
    const client = createServiceRoleClient();
    const clientFingerprintHash = await createClientFingerprintHash(request);
    const email =
      typeof body.email === 'string' && body.email.trim().length > 0
        ? body.email.trim().toLocaleLowerCase('en-US')
        : null;
    const phoneE164 =
      typeof body.phoneE164 === 'string' && body.phoneE164.trim().length > 0
        ? body.phoneE164.trim()
        : null;
    const { data, error } = await client.rpc('get_account_invite_preview_public', {
      p_delivery_token: requireString(body.deliveryToken, 'deliveryToken'),
      p_record_app_open: body.recordAppOpen !== false,
      p_client_fingerprint_hash: clientFingerprintHash,
    });

    if (error) {
      throw error;
    }

    if (
      (!email && !phoneE164) ||
      typeof data !== 'object' ||
      data === null ||
      Array.isArray(data)
    ) {
      return data;
    }

    const [existingEmailProfileResult, existingAuthEmailResult, existingPhoneProfileResult] =
      await Promise.all([
        email
          ? client.from('user_profiles').select('id').eq('email', email).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        email
          ? client.rpc('auth_email_exists', { p_email: email })
          : Promise.resolve({ data: false, error: null }),
        phoneE164
          ? client
              .from('user_profiles')
              .select('id')
              .eq('phone_e164', phoneE164)
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

    if (existingEmailProfileResult.error) {
      throw existingEmailProfileResult.error;
    }

    if (existingAuthEmailResult.error) {
      throw existingAuthEmailResult.error;
    }

    if (existingPhoneProfileResult.error) {
      throw existingPhoneProfileResult.error;
    }

    return {
      ...data,
      emailAlreadyRegistered:
        Boolean(existingEmailProfileResult.data) || Boolean(existingAuthEmailResult.data),
      phoneAlreadyRegistered: Boolean(existingPhoneProfileResult.data),
    };
  }),
);
