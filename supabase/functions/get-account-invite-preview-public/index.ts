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
    const { data, error } = await client.rpc('get_account_invite_preview_public', {
      p_delivery_token: requireString(body.deliveryToken, 'deliveryToken'),
      p_record_app_open: body.recordAppOpen !== false,
      p_client_fingerprint_hash: clientFingerprintHash,
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
