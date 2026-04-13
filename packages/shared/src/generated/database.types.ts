export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          avatar_path: string | null;
          phone_country_iso2: string | null;
          phone_country_calling_code: string | null;
          phone_national_number: string | null;
          phone_e164: string | null;
          phone_verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      trusted_devices: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          platform: string;
          device_name: string | null;
          app_version: string | null;
          trust_state: string;
          trusted_at: string | null;
          last_seen_at: string;
          created_at: string;
          revoked_at: string | null;
        };
      };
      friendship_invites: {
        Row: {
          id: string;
          inviter_user_id: string;
          target_user_id: string | null;
          claimant_user_id: string | null;
          relationship_id: string | null;
          flow: string;
          origin_channel: string;
          status: string;
          resolution_actor: string | null;
          resolution_reason: string | null;
          intended_recipient_alias: string | null;
          intended_recipient_phone_e164: string | null;
          intended_recipient_phone_label: string | null;
          claimant_snapshot: Json | null;
          source_context: string | null;
          expires_at: string;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      friendship_invite_deliveries: {
        Row: {
          id: string;
          invite_id: string;
          token: string;
          channel: string;
          source_context: string | null;
          status: string;
          created_at: string;
          updated_at: string;
          expires_at: string;
          claimed_at: string | null;
          claimed_by_user_id: string | null;
          revoked_at: string | null;
        };
      };
      relationships: {
        Row: {
          id: string;
          user_low_id: string;
          user_high_id: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
      };
      financial_requests: {
        Row: {
          id: string;
          relationship_id: string;
          request_type: string;
          status: string;
          creator_user_id: string;
          responder_user_id: string;
          debtor_user_id: string;
          creditor_user_id: string;
          amount_minor: number;
          currency_code: string;
          description: string | null;
          parent_request_id: string | null;
          target_ledger_transaction_id: string | null;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
        };
      };
      ledger_accounts: {
        Row: {
          id: string;
          owner_user_id: string;
          counterparty_user_id: string;
          account_kind: string;
          currency_code: string;
          created_at: string;
        };
      };
      ledger_transactions: {
        Row: {
          id: string;
          transaction_type: string;
          source_type: string;
          currency_code: string;
          origin_request_id: string | null;
          origin_settlement_proposal_id: string | null;
          reverses_transaction_id: string | null;
          description: string | null;
          created_by_user_id: string | null;
          created_at: string;
        };
      };
      ledger_entries: {
        Row: {
          id: string;
          ledger_transaction_id: string;
          ledger_account_id: string;
          entry_side: string;
          amount_minor: number;
          entry_order: number;
          created_at: string;
        };
      };
      pair_net_edges_cache: {
        Row: {
          user_low_id: string;
          user_high_id: string;
          debtor_user_id: string | null;
          creditor_user_id: string | null;
          amount_minor: number;
          currency_code: string;
          last_ledger_transaction_id: string | null;
          refreshed_at: string;
        };
      };
      settlement_proposals: {
        Row: {
          id: string;
          created_by_user_id: string;
          status: string;
          graph_snapshot_hash: string;
          graph_snapshot: Json;
          movements_json: Json;
          created_at: string;
          updated_at: string;
          executed_at: string | null;
        };
      };
      settlement_proposal_participants: {
        Row: {
          id: string;
          settlement_proposal_id: string;
          participant_user_id: string;
          decision: string;
          decided_at: string | null;
        };
      };
      settlement_executions: {
        Row: {
          id: string;
          settlement_proposal_id: string;
          executed_by_user_id: string;
          created_at: string;
        };
      };
      audit_events: {
        Row: {
          id: string;
          actor_user_id: string | null;
          entity_type: string;
          entity_id: string;
          event_name: string;
          request_id: string | null;
          metadata_json: Json;
          created_at: string;
        };
      };
      idempotency_keys: {
        Row: {
          id: string;
          actor_user_id: string;
          operation_name: string;
          idempotency_key: string;
          response_json: Json | null;
          created_at: string;
        };
      };
      app_settings: {
        Row: {
          key: string;
          value_json: Json;
          updated_at: string;
        };
      };
    };
    Views: {
      v_pair_net_edges_authoritative: {
        Row: {
          user_low_id: string;
          user_high_id: string;
          debtor_user_id: string;
          creditor_user_id: string;
          amount_minor: number;
          currency_code: string;
        };
      };
      v_user_balance_summary: {
        Row: {
          user_id: string;
          net_balance_minor: number;
          total_i_owe_minor: number;
          total_owed_to_me_minor: number;
        };
      };
      v_open_debts: {
        Row: {
          relationship_id: string;
          user_low_id: string;
          user_high_id: string;
          debtor_user_id: string;
          creditor_user_id: string;
          amount_minor: number;
          currency_code: string;
        };
      };
      v_relationship_history: {
        Row: {
          relationship_id: string;
          item_id: string;
          item_kind: string;
          status: string;
          subtype: string;
          source_type: string;
          creator_user_id: string | null;
          responder_user_id: string | null;
          debtor_user_id: string | null;
          creditor_user_id: string | null;
          amount_minor: number;
          description: string | null;
          origin_request_id: string | null;
          origin_settlement_proposal_id: string | null;
          happened_at: string;
        };
      };
      v_inbox_items: {
        Row: {
          owner_user_id: string;
          item_id: string;
          item_kind: string;
          subtype: string;
          status: string;
          created_at: string;
        };
      };
      v_friendship_invites_live: {
        Row: {
          id: string;
          inviter_user_id: string;
          target_user_id: string | null;
          claimant_user_id: string | null;
          relationship_id: string | null;
          flow: string;
          origin_channel: string;
          status: string;
          resolution_actor: string | null;
          resolution_reason: string | null;
          intended_recipient_alias: string | null;
          intended_recipient_phone_e164: string | null;
          intended_recipient_phone_label: string | null;
          claimant_snapshot: Json | null;
          source_context: string | null;
          expires_at: string;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      v_friendship_invite_deliveries_live: {
        Row: {
          id: string;
          invite_id: string;
          token: string;
          channel: string;
          source_context: string | null;
          status: string;
          created_at: string;
          updated_at: string;
          expires_at: string;
          claimed_at: string | null;
          claimed_by_user_id: string | null;
          revoked_at: string | null;
        };
      };
    };
  };
}
