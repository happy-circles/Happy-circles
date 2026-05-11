export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          metadata_json: Json
          processed_at: string
          requested_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          metadata_json?: Json
          processed_at?: string
          requested_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          metadata_json?: Json
          processed_at?: string
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      account_invite_deliveries: {
        Row: {
          activation_completed_at: string | null
          authenticated_at: string | null
          authenticated_user_id: string | null
          channel: Database["public"]["Enums"]["account_invite_channel"]
          created_at: string
          expires_at: string
          first_app_opened_at: string | null
          first_opened_at: string | null
          id: string
          invite_id: string
          last_opened_at: string | null
          open_count: number
          revoked_at: string | null
          source_context: string | null
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          activation_completed_at?: string | null
          authenticated_at?: string | null
          authenticated_user_id?: string | null
          channel: Database["public"]["Enums"]["account_invite_channel"]
          created_at?: string
          expires_at: string
          first_app_opened_at?: string | null
          first_opened_at?: string | null
          id?: string
          invite_id: string
          last_opened_at?: string | null
          open_count?: number
          revoked_at?: string | null
          source_context?: string | null
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          activation_completed_at?: string | null
          authenticated_at?: string | null
          authenticated_user_id?: string | null
          channel?: Database["public"]["Enums"]["account_invite_channel"]
          created_at?: string
          expires_at?: string
          first_app_opened_at?: string | null
          first_opened_at?: string | null
          id?: string
          invite_id?: string
          last_opened_at?: string | null
          open_count?: number
          revoked_at?: string | null
          source_context?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_invite_deliveries_authenticated_user_id_fkey"
            columns: ["authenticated_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invite_deliveries_authenticated_user_id_fkey"
            columns: ["authenticated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "account_invite_deliveries_authenticated_user_id_fkey"
            columns: ["authenticated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invite_deliveries_authenticated_user_id_fkey"
            columns: ["authenticated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invite_deliveries_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "account_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invite_deliveries_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "v_account_invites_live"
            referencedColumns: ["id"]
          },
        ]
      }
      account_invites: {
        Row: {
          activated_at: string | null
          activated_user_id: string | null
          created_at: string
          expires_at: string
          id: string
          intended_recipient_alias: string | null
          intended_recipient_phone_e164: string | null
          intended_recipient_phone_label: string | null
          inviter_user_id: string
          linked_relationship_id: string | null
          resolution_actor: string | null
          resolution_reason: string | null
          resolved_at: string | null
          source_context: string | null
          status: Database["public"]["Enums"]["account_invite_status"]
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_user_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          intended_recipient_alias?: string | null
          intended_recipient_phone_e164?: string | null
          intended_recipient_phone_label?: string | null
          inviter_user_id: string
          linked_relationship_id?: string | null
          resolution_actor?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          source_context?: string | null
          status?: Database["public"]["Enums"]["account_invite_status"]
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_user_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          intended_recipient_alias?: string | null
          intended_recipient_phone_e164?: string | null
          intended_recipient_phone_label?: string | null
          inviter_user_id?: string
          linked_relationship_id?: string | null
          resolution_actor?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          source_context?: string | null
          status?: Database["public"]["Enums"]["account_invite_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_invites_activated_user_id_fkey"
            columns: ["activated_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_activated_user_id_fkey"
            columns: ["activated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "account_invites_activated_user_id_fkey"
            columns: ["activated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_activated_user_id_fkey"
            columns: ["activated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "account_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_linked_relationship_id_fkey"
            columns: ["linked_relationship_id"]
            isOneToOne: false
            referencedRelation: "relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_linked_relationship_id_fkey"
            columns: ["linked_relationship_id"]
            isOneToOne: false
            referencedRelation: "v_open_debts"
            referencedColumns: ["relationship_id"]
          },
        ]
      }
      analytics_daily_event_facts: {
        Row: {
          created_at: string
          event_count: number
          event_family: string
          event_kind: string
          event_name: string
          fact_date: string
          feature_key: string
          updated_at: string
          user_count: number
        }
        Insert: {
          created_at?: string
          event_count?: number
          event_family: string
          event_kind: string
          event_name: string
          fact_date: string
          feature_key: string
          updated_at?: string
          user_count?: number
        }
        Update: {
          created_at?: string
          event_count?: number
          event_family?: string
          event_kind?: string
          event_name?: string
          fact_date?: string
          feature_key?: string
          updated_at?: string
          user_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_daily_event_facts_event_name_fkey"
            columns: ["event_name"]
            isOneToOne: false
            referencedRelation: "analytics_event_catalog"
            referencedColumns: ["event_name"]
          },
        ]
      }
      analytics_daily_feature_facts: {
        Row: {
          core_action_count: number
          created_at: string
          event_count: number
          fact_date: string
          feature_key: string
          updated_at: string
          user_count: number
        }
        Insert: {
          core_action_count?: number
          created_at?: string
          event_count?: number
          fact_date: string
          feature_key: string
          updated_at?: string
          user_count?: number
        }
        Update: {
          core_action_count?: number
          created_at?: string
          event_count?: number
          fact_date?: string
          feature_key?: string
          updated_at?: string
          user_count?: number
        }
        Relationships: []
      }
      analytics_daily_product_facts: {
        Row: {
          account_invites_accepted_count: number
          account_invites_created_count: number
          active_user_count: number
          confirmed_volume_minor: number
          created_at: string
          event_count: number
          fact_date: string
          financial_requests_accepted_count: number
          financial_requests_created_count: number
          financial_requests_rejected_count: number
          friendship_invites_accepted_count: number
          friendship_invites_created_count: number
          ledger_transaction_count: number
          new_user_count: number
          relationships_created_count: number
          screen_view_count: number
          session_count: number
          settlement_executions_count: number
          settlement_proposals_created_count: number
          updated_at: string
        }
        Insert: {
          account_invites_accepted_count?: number
          account_invites_created_count?: number
          active_user_count?: number
          confirmed_volume_minor?: number
          created_at?: string
          event_count?: number
          fact_date: string
          financial_requests_accepted_count?: number
          financial_requests_created_count?: number
          financial_requests_rejected_count?: number
          friendship_invites_accepted_count?: number
          friendship_invites_created_count?: number
          ledger_transaction_count?: number
          new_user_count?: number
          relationships_created_count?: number
          screen_view_count?: number
          session_count?: number
          settlement_executions_count?: number
          settlement_proposals_created_count?: number
          updated_at?: string
        }
        Update: {
          account_invites_accepted_count?: number
          account_invites_created_count?: number
          active_user_count?: number
          confirmed_volume_minor?: number
          created_at?: string
          event_count?: number
          fact_date?: string
          financial_requests_accepted_count?: number
          financial_requests_created_count?: number
          financial_requests_rejected_count?: number
          friendship_invites_accepted_count?: number
          friendship_invites_created_count?: number
          ledger_transaction_count?: number
          new_user_count?: number
          relationships_created_count?: number
          screen_view_count?: number
          session_count?: number
          settlement_executions_count?: number
          settlement_proposals_created_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      analytics_daily_user_facts: {
        Row: {
          core_action_count: number
          created_at: string
          event_count: number
          fact_date: string
          financial_request_accepted_count: number
          financial_request_created_count: number
          financial_request_started_count: number
          first_seen_at: string | null
          friendship_invite_accepted_count: number
          friendship_invite_created_count: number
          is_active: boolean
          last_seen_at: string | null
          latest_app_version: string | null
          latest_platform: string | null
          screen_view_count: number
          session_count: number
          settlement_executed_count: number
          settlement_proposal_approved_count: number
          settlement_proposal_viewed_count: number
          total_session_seconds: number
          updated_at: string
          used_financial_requests: boolean
          used_invites: boolean
          used_settlements: boolean
          user_id: string
        }
        Insert: {
          core_action_count?: number
          created_at?: string
          event_count?: number
          fact_date: string
          financial_request_accepted_count?: number
          financial_request_created_count?: number
          financial_request_started_count?: number
          first_seen_at?: string | null
          friendship_invite_accepted_count?: number
          friendship_invite_created_count?: number
          is_active?: boolean
          last_seen_at?: string | null
          latest_app_version?: string | null
          latest_platform?: string | null
          screen_view_count?: number
          session_count?: number
          settlement_executed_count?: number
          settlement_proposal_approved_count?: number
          settlement_proposal_viewed_count?: number
          total_session_seconds?: number
          updated_at?: string
          used_financial_requests?: boolean
          used_invites?: boolean
          used_settlements?: boolean
          user_id: string
        }
        Update: {
          core_action_count?: number
          created_at?: string
          event_count?: number
          fact_date?: string
          financial_request_accepted_count?: number
          financial_request_created_count?: number
          financial_request_started_count?: number
          first_seen_at?: string | null
          friendship_invite_accepted_count?: number
          friendship_invite_created_count?: number
          is_active?: boolean
          last_seen_at?: string | null
          latest_app_version?: string | null
          latest_platform?: string | null
          screen_view_count?: number
          session_count?: number
          settlement_executed_count?: number
          settlement_proposal_approved_count?: number
          settlement_proposal_viewed_count?: number
          total_session_seconds?: number
          updated_at?: string
          used_financial_requests?: boolean
          used_invites?: boolean
          used_settlements?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_daily_user_facts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_daily_user_facts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "analytics_daily_user_facts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_daily_user_facts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_event_catalog: {
        Row: {
          allowed_metadata_keys: string[]
          created_at: string
          deprecated_at: string | null
          description: string
          event_family: string
          event_kind: string
          event_name: string
          feature_key: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          allowed_metadata_keys?: string[]
          created_at?: string
          deprecated_at?: string | null
          description: string
          event_family?: string
          event_kind?: string
          event_name: string
          feature_key?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          allowed_metadata_keys?: string[]
          created_at?: string
          deprecated_at?: string | null
          description?: string
          event_family?: string
          event_kind?: string
          event_name?: string
          feature_key?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      analytics_user_lifecycle_facts: {
        Row: {
          activated_at: string | null
          activation_source: string | null
          created_at: string
          first_accepted_transaction_at: string | null
          first_active_at: string | null
          first_financial_request_at: string | null
          first_relationship_at: string | null
          first_settlement_event_at: string | null
          invited_by_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          activation_source?: string | null
          created_at: string
          first_accepted_transaction_at?: string | null
          first_active_at?: string | null
          first_financial_request_at?: string | null
          first_relationship_at?: string | null
          first_settlement_event_at?: string | null
          invited_by_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          activation_source?: string | null
          created_at?: string
          first_accepted_transaction_at?: string | null
          first_active_at?: string | null
          first_financial_request_at?: string | null
          first_relationship_at?: string | null
          first_settlement_event_at?: string | null
          invited_by_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_user_lifecycle_facts_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_user_lifecycle_facts_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "analytics_user_lifecycle_facts_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_user_lifecycle_facts_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_user_lifecycle_facts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_user_lifecycle_facts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "analytics_user_lifecycle_facts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_user_lifecycle_facts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      app_sessions: {
        Row: {
          app_version: string | null
          client_session_id: string
          created_at: string
          device_id_hash: string | null
          ended_at: string | null
          id: string
          last_seen_at: string
          platform: string
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          client_session_id: string
          created_at?: string
          device_id_hash?: string | null
          ended_at?: string | null
          id?: string
          last_seen_at: string
          platform: string
          started_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          client_session_id?: string
          created_at?: string
          device_id_hash?: string | null
          ended_at?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "app_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value_json: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value_json: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value_json?: Json
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_name: string
          id: string
          metadata_json: Json
          request_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_name: string
          id?: string
          metadata_json?: Json
          request_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_name?: string
          id?: string
          metadata_json?: Json
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_requests: {
        Row: {
          amount_minor: number
          category: Database["public"]["Enums"]["transaction_category"]
          created_at: string
          creator_user_id: string
          creditor_user_id: string
          currency_code: string
          debtor_user_id: string
          description: string | null
          id: string
          parent_request_id: string | null
          relationship_id: string
          request_type: Database["public"]["Enums"]["request_type"]
          resolved_at: string | null
          responder_user_id: string
          status: Database["public"]["Enums"]["request_status"]
          target_ledger_transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_minor: number
          category?: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          creator_user_id: string
          creditor_user_id: string
          currency_code?: string
          debtor_user_id: string
          description?: string | null
          id?: string
          parent_request_id?: string | null
          relationship_id: string
          request_type: Database["public"]["Enums"]["request_type"]
          resolved_at?: string | null
          responder_user_id: string
          status?: Database["public"]["Enums"]["request_status"]
          target_ledger_transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          category?: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          creator_user_id?: string
          creditor_user_id?: string
          currency_code?: string
          debtor_user_id?: string
          description?: string | null
          id?: string
          parent_request_id?: string | null
          relationship_id?: string
          request_type?: Database["public"]["Enums"]["request_type"]
          resolved_at?: string | null
          responder_user_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          target_ledger_transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_requests_creator_user_id_fkey"
            columns: ["creator_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_creator_user_id_fkey"
            columns: ["creator_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "financial_requests_creator_user_id_fkey"
            columns: ["creator_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_creator_user_id_fkey"
            columns: ["creator_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "financial_requests_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "financial_requests_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_parent_request_id_fkey"
            columns: ["parent_request_id"]
            isOneToOne: false
            referencedRelation: "financial_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "v_open_debts"
            referencedColumns: ["relationship_id"]
          },
          {
            foreignKeyName: "financial_requests_responder_user_id_fkey"
            columns: ["responder_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_responder_user_id_fkey"
            columns: ["responder_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "financial_requests_responder_user_id_fkey"
            columns: ["responder_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_responder_user_id_fkey"
            columns: ["responder_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_target_ledger_transaction_fk"
            columns: ["target_ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      friendship_invite_deliveries: {
        Row: {
          channel: Database["public"]["Enums"]["friendship_invite_channel"]
          claimed_at: string | null
          claimed_by_user_id: string | null
          created_at: string
          expires_at: string
          id: string
          invite_id: string
          revoked_at: string | null
          source_context: string | null
          status: Database["public"]["Enums"]["friendship_invite_delivery_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["friendship_invite_channel"]
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          invite_id: string
          revoked_at?: string | null
          source_context?: string | null
          status?: Database["public"]["Enums"]["friendship_invite_delivery_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["friendship_invite_channel"]
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_id?: string
          revoked_at?: string | null
          source_context?: string | null
          status?: Database["public"]["Enums"]["friendship_invite_delivery_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendship_invite_deliveries_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invite_deliveries_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendship_invite_deliveries_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invite_deliveries_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invite_deliveries_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "friendship_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invite_deliveries_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "v_friendship_invites_live"
            referencedColumns: ["id"]
          },
        ]
      }
      friendship_invites: {
        Row: {
          claimant_snapshot: Json | null
          claimant_user_id: string | null
          created_at: string
          expires_at: string
          flow: Database["public"]["Enums"]["friendship_invite_flow"]
          id: string
          intended_recipient_alias: string | null
          intended_recipient_phone_e164: string | null
          intended_recipient_phone_label: string | null
          inviter_user_id: string
          origin_channel: Database["public"]["Enums"]["friendship_invite_channel"]
          relationship_id: string | null
          resolution_actor:
            | Database["public"]["Enums"]["friendship_invite_resolution_actor"]
            | null
          resolution_reason: string | null
          resolved_at: string | null
          source_context: string | null
          status: Database["public"]["Enums"]["friendship_invite_status"]
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          claimant_snapshot?: Json | null
          claimant_user_id?: string | null
          created_at?: string
          expires_at: string
          flow: Database["public"]["Enums"]["friendship_invite_flow"]
          id?: string
          intended_recipient_alias?: string | null
          intended_recipient_phone_e164?: string | null
          intended_recipient_phone_label?: string | null
          inviter_user_id: string
          origin_channel: Database["public"]["Enums"]["friendship_invite_channel"]
          relationship_id?: string | null
          resolution_actor?:
            | Database["public"]["Enums"]["friendship_invite_resolution_actor"]
            | null
          resolution_reason?: string | null
          resolved_at?: string | null
          source_context?: string | null
          status: Database["public"]["Enums"]["friendship_invite_status"]
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          claimant_snapshot?: Json | null
          claimant_user_id?: string | null
          created_at?: string
          expires_at?: string
          flow?: Database["public"]["Enums"]["friendship_invite_flow"]
          id?: string
          intended_recipient_alias?: string | null
          intended_recipient_phone_e164?: string | null
          intended_recipient_phone_label?: string | null
          inviter_user_id?: string
          origin_channel?: Database["public"]["Enums"]["friendship_invite_channel"]
          relationship_id?: string | null
          resolution_actor?:
            | Database["public"]["Enums"]["friendship_invite_resolution_actor"]
            | null
          resolution_reason?: string | null
          resolved_at?: string | null
          source_context?: string | null
          status?: Database["public"]["Enums"]["friendship_invite_status"]
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendship_invites_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendship_invites_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendship_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "v_open_debts"
            referencedColumns: ["relationship_id"]
          },
          {
            foreignKeyName: "friendship_invites_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendship_invites_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_cycle_jobs: {
        Row: {
          actor_user_id: string
          anchor_user_id: string
          attempts: number
          created_at: string
          currency_code: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          processed_at: string | null
          result_json: Json | null
          source_id: string
          source_type: string
          status: Database["public"]["Enums"]["graph_cycle_job_status"]
          updated_at: string
          user_high_id: string
          user_low_id: string
        }
        Insert: {
          actor_user_id: string
          anchor_user_id: string
          attempts?: number
          created_at?: string
          currency_code?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          processed_at?: string | null
          result_json?: Json | null
          source_id: string
          source_type: string
          status?: Database["public"]["Enums"]["graph_cycle_job_status"]
          updated_at?: string
          user_high_id: string
          user_low_id: string
        }
        Update: {
          actor_user_id?: string
          anchor_user_id?: string
          attempts?: number
          created_at?: string
          currency_code?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          processed_at?: string | null
          result_json?: Json | null
          source_id?: string
          source_type?: string
          status?: Database["public"]["Enums"]["graph_cycle_job_status"]
          updated_at?: string
          user_high_id?: string
          user_low_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graph_cycle_jobs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_anchor_user_id_fkey"
            columns: ["anchor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_anchor_user_id_fkey"
            columns: ["anchor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_anchor_user_id_fkey"
            columns: ["anchor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_anchor_user_id_fkey"
            columns: ["anchor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_cycle_jobs_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      happy_circle_cases: {
        Row: {
          anchor_user_high_id: string
          anchor_user_low_id: string
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          currency_code: string
          current_proposal_id: string | null
          id: string
          participant_set_hash: string
          status: Database["public"]["Enums"]["happy_circle_case_status"]
          updated_at: string
        }
        Insert: {
          anchor_user_high_id: string
          anchor_user_low_id: string
          completed_at?: string | null
          created_at?: string
          created_by_user_id: string
          currency_code?: string
          current_proposal_id?: string | null
          id?: string
          participant_set_hash: string
          status?: Database["public"]["Enums"]["happy_circle_case_status"]
          updated_at?: string
        }
        Update: {
          anchor_user_high_id?: string
          anchor_user_low_id?: string
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          currency_code?: string
          current_proposal_id?: string | null
          id?: string
          participant_set_hash?: string
          status?: Database["public"]["Enums"]["happy_circle_case_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "happy_circle_cases_anchor_user_high_id_fkey"
            columns: ["anchor_user_high_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_cases_anchor_user_high_id_fkey"
            columns: ["anchor_user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "happy_circle_cases_anchor_user_high_id_fkey"
            columns: ["anchor_user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_cases_anchor_user_high_id_fkey"
            columns: ["anchor_user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_cases_anchor_user_low_id_fkey"
            columns: ["anchor_user_low_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_cases_anchor_user_low_id_fkey"
            columns: ["anchor_user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "happy_circle_cases_anchor_user_low_id_fkey"
            columns: ["anchor_user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_cases_anchor_user_low_id_fkey"
            columns: ["anchor_user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_cases_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_cases_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "happy_circle_cases_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_cases_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_cases_current_proposal_id_fkey"
            columns: ["current_proposal_id"]
            isOneToOne: false
            referencedRelation: "settlement_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      happy_circle_score_events: {
        Row: {
          awarded_at: string
          created_at: string
          id: string
          participant_count: number
          score_delta: number
          settlement_proposal_id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          created_at?: string
          id?: string
          participant_count: number
          score_delta: number
          settlement_proposal_id: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          created_at?: string
          id?: string
          participant_count?: number
          score_delta?: number
          settlement_proposal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "happy_circle_score_events_settlement_proposal_id_fkey"
            columns: ["settlement_proposal_id"]
            isOneToOne: false
            referencedRelation: "settlement_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_score_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_score_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "happy_circle_score_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_circle_score_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          idempotency_key: string
          operation_name: string
          response_json: Json | null
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          operation_name: string
          response_json?: Json | null
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          operation_name?: string
          response_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idempotency_keys_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "idempotency_keys_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idempotency_keys_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          account_kind: Database["public"]["Enums"]["ledger_account_kind"]
          counterparty_user_id: string
          created_at: string
          currency_code: string
          id: string
          owner_user_id: string
        }
        Insert: {
          account_kind: Database["public"]["Enums"]["ledger_account_kind"]
          counterparty_user_id: string
          created_at?: string
          currency_code?: string
          id?: string
          owner_user_id: string
        }
        Update: {
          account_kind?: Database["public"]["Enums"]["ledger_account_kind"]
          counterparty_user_id?: string
          created_at?: string
          currency_code?: string
          id?: string
          owner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ledger_accounts_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ledger_accounts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_minor: number
          created_at: string
          entry_order: number
          entry_side: Database["public"]["Enums"]["ledger_entry_side"]
          id: string
          ledger_account_id: string
          ledger_transaction_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          entry_order: number
          entry_side: Database["public"]["Enums"]["ledger_entry_side"]
          id?: string
          ledger_account_id: string
          ledger_transaction_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          entry_order?: number
          entry_side?: Database["public"]["Enums"]["ledger_entry_side"]
          id?: string
          ledger_account_id?: string
          ledger_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_transactions: {
        Row: {
          category: Database["public"]["Enums"]["transaction_category"]
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          description: string | null
          id: string
          origin_request_id: string | null
          origin_settlement_proposal_id: string | null
          reverses_transaction_id: string | null
          source_type: Database["public"]["Enums"]["ledger_source_type"]
          transaction_type: Database["public"]["Enums"]["ledger_transaction_type"]
        }
        Insert: {
          category?: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          description?: string | null
          id?: string
          origin_request_id?: string | null
          origin_settlement_proposal_id?: string | null
          reverses_transaction_id?: string | null
          source_type: Database["public"]["Enums"]["ledger_source_type"]
          transaction_type: Database["public"]["Enums"]["ledger_transaction_type"]
        }
        Update: {
          category?: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          description?: string | null
          id?: string
          origin_request_id?: string | null
          origin_settlement_proposal_id?: string | null
          reverses_transaction_id?: string | null
          source_type?: Database["public"]["Enums"]["ledger_source_type"]
          transaction_type?: Database["public"]["Enums"]["ledger_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ledger_transactions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_origin_request_id_fkey"
            columns: ["origin_request_id"]
            isOneToOne: false
            referencedRelation: "financial_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_origin_settlement_proposal_fk"
            columns: ["origin_settlement_proposal_id"]
            isOneToOne: false
            referencedRelation: "settlement_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_reverses_transaction_id_fkey"
            columns: ["reverses_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_views: {
        Row: {
          created_at: string
          notification_key: string
          notification_kind: string
          notification_status: string
          source_item_id: string
          updated_at: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          created_at?: string
          notification_key: string
          notification_kind: string
          notification_status: string
          source_item_id: string
          updated_at?: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          created_at?: string
          notification_key?: string
          notification_kind?: string
          notification_status?: string
          source_item_id?: string
          updated_at?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notification_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      pair_net_edges_cache: {
        Row: {
          amount_minor: number
          creditor_user_id: string | null
          currency_code: string
          debtor_user_id: string | null
          last_ledger_transaction_id: string | null
          refreshed_at: string
          user_high_id: string
          user_low_id: string
        }
        Insert: {
          amount_minor?: number
          creditor_user_id?: string | null
          currency_code?: string
          debtor_user_id?: string | null
          last_ledger_transaction_id?: string | null
          refreshed_at?: string
          user_high_id: string
          user_low_id: string
        }
        Update: {
          amount_minor?: number
          creditor_user_id?: string | null
          currency_code?: string
          debtor_user_id?: string | null
          last_ledger_transaction_id?: string | null
          refreshed_at?: string
          user_high_id?: string
          user_low_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pair_net_edges_cache_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_last_ledger_transaction_id_fkey"
            columns: ["last_ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      product_events: {
        Row: {
          app_version: string | null
          client_event_id: string
          created_at: string
          event_name: string
          id: string
          metadata_json: Json
          occurred_at: string
          platform: string
          screen_name: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          client_event_id: string
          created_at?: string
          event_name: string
          id?: string
          metadata_json?: Json
          occurred_at: string
          platform: string
          screen_name?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          client_event_id?: string
          created_at?: string
          event_name?: string
          id?: string
          metadata_json?: Json
          occurred_at?: string
          platform?: string
          screen_name?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_events_event_name_fkey"
            columns: ["event_name"]
            isOneToOne: false
            referencedRelation: "analytics_event_catalog"
            referencedColumns: ["event_name"]
          },
          {
            foreignKeyName: "product_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "app_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "product_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      public_invite_preview_rate_limits: {
        Row: {
          client_fingerprint_hash: string
          request_count: number
          token_hash: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          client_fingerprint_hash: string
          request_count?: number
          token_hash: string
          updated_at?: string
          window_started_at: string
        }
        Update: {
          client_fingerprint_hash?: string
          request_count?: number
          token_hash?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      relationships: {
        Row: {
          created_at: string
          id: string
          status: Database["public"]["Enums"]["relationship_status"]
          updated_at: string
          user_high_id: string
          user_low_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["relationship_status"]
          updated_at?: string
          user_high_id: string
          user_low_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["relationship_status"]
          updated_at?: string
          user_high_id?: string
          user_low_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "relationships_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "relationships_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_executions: {
        Row: {
          created_at: string
          executed_by_user_id: string
          id: string
          settlement_proposal_id: string
        }
        Insert: {
          created_at?: string
          executed_by_user_id: string
          id?: string
          settlement_proposal_id: string
        }
        Update: {
          created_at?: string
          executed_by_user_id?: string
          id?: string
          settlement_proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_executions_executed_by_user_id_fkey"
            columns: ["executed_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_executions_executed_by_user_id_fkey"
            columns: ["executed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlement_executions_executed_by_user_id_fkey"
            columns: ["executed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_executions_executed_by_user_id_fkey"
            columns: ["executed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_executions_settlement_proposal_id_fkey"
            columns: ["settlement_proposal_id"]
            isOneToOne: true
            referencedRelation: "settlement_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_proposal_participants: {
        Row: {
          created_at: string
          decided_at: string | null
          decision: Database["public"]["Enums"]["settlement_participant_decision"]
          id: string
          participant_user_id: string
          settlement_proposal_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["settlement_participant_decision"]
          id?: string
          participant_user_id: string
          settlement_proposal_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["settlement_participant_decision"]
          id?: string
          participant_user_id?: string
          settlement_proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_proposal_participants_participant_user_id_fkey"
            columns: ["participant_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposal_participants_participant_user_id_fkey"
            columns: ["participant_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlement_proposal_participants_participant_user_id_fkey"
            columns: ["participant_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposal_participants_participant_user_id_fkey"
            columns: ["participant_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposal_participants_settlement_proposal_id_fkey"
            columns: ["settlement_proposal_id"]
            isOneToOne: false
            referencedRelation: "settlement_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_proposals: {
        Row: {
          anchor_user_high_id: string | null
          anchor_user_low_id: string | null
          created_at: string
          created_by_user_id: string
          currency_code: string
          executed_at: string | null
          graph_snapshot: Json
          graph_snapshot_hash: string
          happy_circle_case_id: string | null
          id: string
          movements_json: Json
          replaced_by_proposal_id: string | null
          replaces_proposal_id: string | null
          source_graph_cycle_job_id: string | null
          stale_reason:
            | Database["public"]["Enums"]["settlement_stale_reason"]
            | null
          status: Database["public"]["Enums"]["settlement_proposal_status"]
          updated_at: string
          version_number: number | null
        }
        Insert: {
          anchor_user_high_id?: string | null
          anchor_user_low_id?: string | null
          created_at?: string
          created_by_user_id: string
          currency_code?: string
          executed_at?: string | null
          graph_snapshot: Json
          graph_snapshot_hash: string
          happy_circle_case_id?: string | null
          id?: string
          movements_json: Json
          replaced_by_proposal_id?: string | null
          replaces_proposal_id?: string | null
          source_graph_cycle_job_id?: string | null
          stale_reason?:
            | Database["public"]["Enums"]["settlement_stale_reason"]
            | null
          status?: Database["public"]["Enums"]["settlement_proposal_status"]
          updated_at?: string
          version_number?: number | null
        }
        Update: {
          anchor_user_high_id?: string | null
          anchor_user_low_id?: string | null
          created_at?: string
          created_by_user_id?: string
          currency_code?: string
          executed_at?: string | null
          graph_snapshot?: Json
          graph_snapshot_hash?: string
          happy_circle_case_id?: string | null
          id?: string
          movements_json?: Json
          replaced_by_proposal_id?: string | null
          replaces_proposal_id?: string | null
          source_graph_cycle_job_id?: string | null
          stale_reason?:
            | Database["public"]["Enums"]["settlement_stale_reason"]
            | null
          status?: Database["public"]["Enums"]["settlement_proposal_status"]
          updated_at?: string
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_proposals_anchor_user_high_id_fkey"
            columns: ["anchor_user_high_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_anchor_user_high_id_fkey"
            columns: ["anchor_user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlement_proposals_anchor_user_high_id_fkey"
            columns: ["anchor_user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_anchor_user_high_id_fkey"
            columns: ["anchor_user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_anchor_user_low_id_fkey"
            columns: ["anchor_user_low_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_anchor_user_low_id_fkey"
            columns: ["anchor_user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlement_proposals_anchor_user_low_id_fkey"
            columns: ["anchor_user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_anchor_user_low_id_fkey"
            columns: ["anchor_user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlement_proposals_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_happy_circle_case_id_fkey"
            columns: ["happy_circle_case_id"]
            isOneToOne: false
            referencedRelation: "happy_circle_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_replaced_by_proposal_id_fkey"
            columns: ["replaced_by_proposal_id"]
            isOneToOne: false
            referencedRelation: "settlement_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_replaces_proposal_id_fkey"
            columns: ["replaces_proposal_id"]
            isOneToOne: false
            referencedRelation: "settlement_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_proposals_source_graph_cycle_job_id_fkey"
            columns: ["source_graph_cycle_job_id"]
            isOneToOne: false
            referencedRelation: "graph_cycle_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      support_error_reports: {
        Row: {
          app_version: string | null
          created_at: string
          error_code: string | null
          error_message: string
          fatal: boolean
          function_name: string | null
          id: string
          kind: string
          metadata_json: Json
          occurred_at: string
          platform: string
          request_id: string | null
          route: string | null
          screen_name: string | null
          support_id: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          error_code?: string | null
          error_message: string
          fatal?: boolean
          function_name?: string | null
          id?: string
          kind: string
          metadata_json?: Json
          occurred_at: string
          platform: string
          request_id?: string | null
          route?: string | null
          screen_name?: string | null
          support_id: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string
          fatal?: boolean
          function_name?: string | null
          id?: string
          kind?: string
          metadata_json?: Json
          occurred_at?: string
          platform?: string
          request_id?: string | null
          route?: string | null
          screen_name?: string | null
          support_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_error_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_error_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "support_error_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_error_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string
          device_name: string | null
          id: string
          last_seen_at: string
          platform: string
          revoked_at: string | null
          trust_state: string
          trusted_at: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform: string
          revoked_at?: string | null
          trust_state?: string
          trusted_at?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          revoked_at?: string | null
          trust_state?: string
          trusted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trusted_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trusted_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trusted_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trusted_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          account_access_state: Database["public"]["Enums"]["account_access_state"]
          activated_at: string | null
          activated_via_account_invite_id: string | null
          avatar_path: string | null
          created_at: string
          deleted_at: string | null
          deletion_requested_at: string | null
          display_name: string
          email: string
          id: string
          invited_by_user_id: string | null
          onboarding_completed_at: string | null
          phone_country_calling_code: string | null
          phone_country_iso2: string | null
          phone_e164: string | null
          phone_national_number: string | null
          phone_verified_at: string | null
          updated_at: string
          welcome_email_last_error: string | null
          welcome_email_queued_at: string | null
          welcome_email_sent_at: string | null
        }
        Insert: {
          account_access_state?: Database["public"]["Enums"]["account_access_state"]
          activated_at?: string | null
          activated_via_account_invite_id?: string | null
          avatar_path?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          display_name: string
          email: string
          id: string
          invited_by_user_id?: string | null
          onboarding_completed_at?: string | null
          phone_country_calling_code?: string | null
          phone_country_iso2?: string | null
          phone_e164?: string | null
          phone_national_number?: string | null
          phone_verified_at?: string | null
          updated_at?: string
          welcome_email_last_error?: string | null
          welcome_email_queued_at?: string | null
          welcome_email_sent_at?: string | null
        }
        Update: {
          account_access_state?: Database["public"]["Enums"]["account_access_state"]
          activated_at?: string | null
          activated_via_account_invite_id?: string | null
          avatar_path?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          display_name?: string
          email?: string
          id?: string
          invited_by_user_id?: string | null
          onboarding_completed_at?: string | null
          phone_country_calling_code?: string | null
          phone_country_iso2?: string | null
          phone_e164?: string | null
          phone_national_number?: string | null
          phone_verified_at?: string | null
          updated_at?: string
          welcome_email_last_error?: string | null
          welcome_email_queued_at?: string | null
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_activated_via_account_invite_id_fkey"
            columns: ["activated_via_account_invite_id"]
            isOneToOne: false
            referencedRelation: "account_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_activated_via_account_invite_id_fkey"
            columns: ["activated_via_account_invite_id"]
            isOneToOne: false
            referencedRelation: "v_account_invites_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_account_invite_deliveries_live: {
        Row: {
          activation_completed_at: string | null
          authenticated_at: string | null
          authenticated_user_id: string | null
          channel: Database["public"]["Enums"]["account_invite_channel"] | null
          created_at: string | null
          expires_at: string | null
          first_app_opened_at: string | null
          first_opened_at: string | null
          id: string | null
          invite_id: string | null
          last_opened_at: string | null
          open_count: number | null
          revoked_at: string | null
          source_context: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          activation_completed_at?: string | null
          authenticated_at?: string | null
          authenticated_user_id?: string | null
          channel?: Database["public"]["Enums"]["account_invite_channel"] | null
          created_at?: string | null
          expires_at?: string | null
          first_app_opened_at?: string | null
          first_opened_at?: string | null
          id?: string | null
          invite_id?: string | null
          last_opened_at?: string | null
          open_count?: number | null
          revoked_at?: string | null
          source_context?: string | null
          status?: never
          updated_at?: string | null
        }
        Update: {
          activation_completed_at?: string | null
          authenticated_at?: string | null
          authenticated_user_id?: string | null
          channel?: Database["public"]["Enums"]["account_invite_channel"] | null
          created_at?: string | null
          expires_at?: string | null
          first_app_opened_at?: string | null
          first_opened_at?: string | null
          id?: string | null
          invite_id?: string | null
          last_opened_at?: string | null
          open_count?: number | null
          revoked_at?: string | null
          source_context?: string | null
          status?: never
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_invite_deliveries_authenticated_user_id_fkey"
            columns: ["authenticated_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invite_deliveries_authenticated_user_id_fkey"
            columns: ["authenticated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "account_invite_deliveries_authenticated_user_id_fkey"
            columns: ["authenticated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invite_deliveries_authenticated_user_id_fkey"
            columns: ["authenticated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invite_deliveries_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "account_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invite_deliveries_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "v_account_invites_live"
            referencedColumns: ["id"]
          },
        ]
      }
      v_account_invites_live: {
        Row: {
          activated_at: string | null
          activated_user_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          intended_recipient_alias: string | null
          intended_recipient_phone_e164: string | null
          intended_recipient_phone_label: string | null
          inviter_user_id: string | null
          linked_relationship_id: string | null
          resolution_actor: string | null
          resolution_reason: string | null
          resolved_at: string | null
          source_context: string | null
          status: Database["public"]["Enums"]["account_invite_status"] | null
          updated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_user_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          intended_recipient_alias?: string | null
          intended_recipient_phone_e164?: string | null
          intended_recipient_phone_label?: string | null
          inviter_user_id?: string | null
          linked_relationship_id?: string | null
          resolution_actor?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          source_context?: string | null
          status?: never
          updated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_user_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          intended_recipient_alias?: string | null
          intended_recipient_phone_e164?: string | null
          intended_recipient_phone_label?: string | null
          inviter_user_id?: string | null
          linked_relationship_id?: string | null
          resolution_actor?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          source_context?: string | null
          status?: never
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_invites_activated_user_id_fkey"
            columns: ["activated_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_activated_user_id_fkey"
            columns: ["activated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "account_invites_activated_user_id_fkey"
            columns: ["activated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_activated_user_id_fkey"
            columns: ["activated_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "account_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_linked_relationship_id_fkey"
            columns: ["linked_relationship_id"]
            isOneToOne: false
            referencedRelation: "relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_linked_relationship_id_fkey"
            columns: ["linked_relationship_id"]
            isOneToOne: false
            referencedRelation: "v_open_debts"
            referencedColumns: ["relationship_id"]
          },
        ]
      }
      v_analytics_activation_funnel: {
        Row: {
          conversion_rate: number | null
          stage_key: string | null
          stage_order: number | null
          user_count: number | null
        }
        Relationships: []
      }
      v_analytics_active_usage: {
        Row: {
          dau: number | null
          event_count: number | null
          fact_date: string | null
          mau: number | null
          screen_view_count: number | null
          session_count: number | null
          stickiness: number | null
          wau: number | null
        }
        Insert: {
          dau?: number | null
          event_count?: number | null
          fact_date?: string | null
          mau?: never
          screen_view_count?: number | null
          session_count?: number | null
          stickiness?: never
          wau?: never
        }
        Update: {
          dau?: number | null
          event_count?: number | null
          fact_date?: string | null
          mau?: never
          screen_view_count?: number | null
          session_count?: number | null
          stickiness?: never
          wau?: never
        }
        Relationships: []
      }
      v_analytics_engagement_depth: {
        Row: {
          active_user_count: number | null
          avg_core_actions_per_active_user: number | null
          avg_events_per_active_user: number | null
          avg_screen_views_per_active_user: number | null
          avg_session_seconds_per_active_user: number | null
          avg_sessions_per_active_user: number | null
          core_action_count: number | null
          event_count: number | null
          fact_date: string | null
          screen_view_count: number | null
          session_count: number | null
        }
        Relationships: []
      }
      v_analytics_feature_adoption: {
        Row: {
          active_user_count: number | null
          adoption_rate: number | null
          core_action_count: number | null
          event_count: number | null
          fact_date: string | null
          feature_key: string | null
          feature_user_count: number | null
        }
        Relationships: []
      }
      v_analytics_invite_virality: {
        Row: {
          account_invites_accepted_count: number | null
          account_invites_created_count: number | null
          active_user_count: number | null
          fact_date: string | null
          friendship_invites_accepted_count: number | null
          friendship_invites_created_count: number | null
          inviter_user_count: number | null
          viral_coefficient_proxy: number | null
        }
        Insert: {
          account_invites_accepted_count?: number | null
          account_invites_created_count?: number | null
          active_user_count?: number | null
          fact_date?: string | null
          friendship_invites_accepted_count?: number | null
          friendship_invites_created_count?: number | null
          inviter_user_count?: never
          viral_coefficient_proxy?: never
        }
        Update: {
          account_invites_accepted_count?: number | null
          account_invites_created_count?: number | null
          active_user_count?: number | null
          fact_date?: string | null
          friendship_invites_accepted_count?: number | null
          friendship_invites_created_count?: number | null
          inviter_user_count?: never
          viral_coefficient_proxy?: never
        }
        Relationships: []
      }
      v_analytics_operational_rfm: {
        Row: {
          frequency_score: number | null
          is_repeat_transaction_user: boolean | null
          last_transaction_at: string | null
          monetary_minor: number | null
          monetary_score: number | null
          recency_days: number | null
          recency_score: number | null
          repeat_transaction_rate: number | null
          rfm_score: number | null
          rfm_segment: string | null
          transaction_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_owner_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_owner_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ledger_accounts_owner_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_owner_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      v_analytics_power_users: {
        Row: {
          active_user_count: number | null
          fact_date: string | null
          top_1_percent_event_share: number | null
          top_10_percent_core_action_share: number | null
          top_10_percent_event_share: number | null
          top_5_percent_event_share: number | null
        }
        Relationships: []
      }
      v_analytics_retention_cohorts: {
        Row: {
          cohort_date: string | null
          cohort_size: number | null
          retained_d1_user_count: number | null
          retained_d30_user_count: number | null
          retained_d7_user_count: number | null
          retention_d1_rate: number | null
          retention_d30_rate: number | null
          retention_d7_rate: number | null
        }
        Relationships: []
      }
      v_friendship_invite_deliveries_live: {
        Row: {
          channel:
            | Database["public"]["Enums"]["friendship_invite_channel"]
            | null
          claimed_at: string | null
          claimed_by_user_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          invite_id: string | null
          revoked_at: string | null
          source_context: string | null
          status:
            | Database["public"]["Enums"]["friendship_invite_delivery_status"]
            | null
          updated_at: string | null
        }
        Insert: {
          channel?:
            | Database["public"]["Enums"]["friendship_invite_channel"]
            | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          invite_id?: string | null
          revoked_at?: string | null
          source_context?: string | null
          status?: never
          updated_at?: string | null
        }
        Update: {
          channel?:
            | Database["public"]["Enums"]["friendship_invite_channel"]
            | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          invite_id?: string | null
          revoked_at?: string | null
          source_context?: string | null
          status?: never
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friendship_invite_deliveries_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invite_deliveries_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendship_invite_deliveries_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invite_deliveries_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invite_deliveries_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "friendship_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invite_deliveries_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "v_friendship_invites_live"
            referencedColumns: ["id"]
          },
        ]
      }
      v_friendship_invites_live: {
        Row: {
          claimant_snapshot: Json | null
          claimant_user_id: string | null
          created_at: string | null
          expires_at: string | null
          flow: Database["public"]["Enums"]["friendship_invite_flow"] | null
          id: string | null
          intended_recipient_alias: string | null
          intended_recipient_phone_e164: string | null
          intended_recipient_phone_label: string | null
          inviter_user_id: string | null
          origin_channel:
            | Database["public"]["Enums"]["friendship_invite_channel"]
            | null
          relationship_id: string | null
          resolution_actor:
            | Database["public"]["Enums"]["friendship_invite_resolution_actor"]
            | null
          resolution_reason: string | null
          resolved_at: string | null
          source_context: string | null
          status: Database["public"]["Enums"]["friendship_invite_status"] | null
          target_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          claimant_snapshot?: Json | null
          claimant_user_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          flow?: Database["public"]["Enums"]["friendship_invite_flow"] | null
          id?: string | null
          intended_recipient_alias?: string | null
          intended_recipient_phone_e164?: string | null
          intended_recipient_phone_label?: string | null
          inviter_user_id?: string | null
          origin_channel?:
            | Database["public"]["Enums"]["friendship_invite_channel"]
            | null
          relationship_id?: string | null
          resolution_actor?:
            | Database["public"]["Enums"]["friendship_invite_resolution_actor"]
            | null
          resolution_reason?: string | null
          resolved_at?: string | null
          source_context?: string | null
          status?: never
          target_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          claimant_snapshot?: Json | null
          claimant_user_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          flow?: Database["public"]["Enums"]["friendship_invite_flow"] | null
          id?: string | null
          intended_recipient_alias?: string | null
          intended_recipient_phone_e164?: string | null
          intended_recipient_phone_label?: string | null
          inviter_user_id?: string | null
          origin_channel?:
            | Database["public"]["Enums"]["friendship_invite_channel"]
            | null
          relationship_id?: string | null
          resolution_actor?:
            | Database["public"]["Enums"]["friendship_invite_resolution_actor"]
            | null
          resolution_reason?: string | null
          resolved_at?: string | null
          source_context?: string | null
          status?: never
          target_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friendship_invites_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendship_invites_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendship_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "v_open_debts"
            referencedColumns: ["relationship_id"]
          },
          {
            foreignKeyName: "friendship_invites_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendship_invites_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendship_invites_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inbox_items: {
        Row: {
          created_at: string | null
          item_id: string | null
          item_kind: string | null
          owner_user_id: string | null
          status: string | null
          subtype: string | null
        }
        Relationships: []
      }
      v_open_debts: {
        Row: {
          amount_minor: number | null
          creditor_user_id: string | null
          currency_code: string | null
          debtor_user_id: string | null
          relationship_id: string | null
          user_high_id: string | null
          user_low_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pair_net_edges_cache_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_creditor_user_id_fkey"
            columns: ["creditor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_debtor_user_id_fkey"
            columns: ["debtor_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_net_edges_cache_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pair_net_edges_authoritative: {
        Row: {
          amount_minor: number | null
          creditor_user_id: string | null
          currency_code: string | null
          debtor_user_id: string | null
          user_high_id: string | null
          user_low_id: string | null
        }
        Relationships: []
      }
      v_relationship_history: {
        Row: {
          amount_minor: number | null
          category: string | null
          creator_user_id: string | null
          creditor_user_id: string | null
          debtor_user_id: string | null
          description: string | null
          happened_at: string | null
          item_id: string | null
          item_kind: string | null
          origin_request_id: string | null
          origin_settlement_proposal_id: string | null
          relationship_id: string | null
          responder_user_id: string | null
          source_type: string | null
          status: string | null
          subtype: string | null
        }
        Relationships: []
      }
      v_user_balance_summary: {
        Row: {
          net_balance_minor: number | null
          total_i_owe_minor: number | null
          total_owed_to_me_minor: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_user_profiles_private: {
        Row: {
          account_access_state:
            | Database["public"]["Enums"]["account_access_state"]
            | null
          activated_at: string | null
          activated_via_account_invite_id: string | null
          avatar_path: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string | null
          invited_by_user_id: string | null
          phone_country_calling_code: string | null
          phone_country_iso2: string | null
          phone_e164: string | null
          phone_national_number: string | null
          phone_verified_at: string | null
          updated_at: string | null
        }
        Insert: {
          account_access_state?:
            | Database["public"]["Enums"]["account_access_state"]
            | null
          activated_at?: string | null
          activated_via_account_invite_id?: string | null
          avatar_path?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          invited_by_user_id?: string | null
          phone_country_calling_code?: string | null
          phone_country_iso2?: string | null
          phone_e164?: string | null
          phone_national_number?: string | null
          phone_verified_at?: string | null
          updated_at?: string | null
        }
        Update: {
          account_access_state?:
            | Database["public"]["Enums"]["account_access_state"]
            | null
          activated_at?: string | null
          activated_via_account_invite_id?: string | null
          avatar_path?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          invited_by_user_id?: string | null
          phone_country_calling_code?: string | null
          phone_country_iso2?: string | null
          phone_e164?: string | null
          phone_national_number?: string | null
          phone_verified_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_activated_via_account_invite_id_fkey"
            columns: ["activated_via_account_invite_id"]
            isOneToOne: false
            referencedRelation: "account_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_activated_via_account_invite_id_fkey"
            columns: ["activated_via_account_invite_id"]
            isOneToOne: false
            referencedRelation: "v_account_invites_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_balance_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_private"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_profiles_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_profiles_visible: {
        Row: {
          account_access_state:
            | Database["public"]["Enums"]["account_access_state"]
            | null
          avatar_path: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          account_access_state?:
            | Database["public"]["Enums"]["account_access_state"]
            | null
          avatar_path?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_access_state?:
            | Database["public"]["Enums"]["account_access_state"]
            | null
          avatar_path?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_financial_request: {
        Args: {
          p_actor_user_id: string
          p_idempotency_key: string
          p_request_id: string
        }
        Returns: Json
      }
      activate_account_from_invite: {
        Args: {
          p_actor_user_id: string
          p_current_device_id: string
          p_delivery_token: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      amend_financial_request: {
        Args: {
          p_actor_user_id: string
          p_amount_minor: number
          p_category?: Database["public"]["Enums"]["transaction_category"]
          p_description: string
          p_idempotency_key: string
          p_request_id: string
        }
        Returns: Json
      }
      append_audit_event: {
        Args: {
          p_actor_user_id: string
          p_entity_id: string
          p_entity_type: string
          p_event_name: string
          p_metadata_json?: Json
          p_request_id: string
        }
        Returns: undefined
      }
      apply_cycle_settlement_execution: {
        Args: { p_actor_user_id: string; p_proposal_id: string }
        Returns: Json
      }
      assert_request_actor: {
        Args: { p_actor_user_id: string }
        Returns: undefined
      }
      auth_email_exists: { Args: { p_email: string }; Returns: boolean }
      award_happy_circle_score: {
        Args: { p_proposal_id: string }
        Returns: Json
      }
      build_friendship_claimant_snapshot: {
        Args: { p_user_id: string }
        Returns: Json
      }
      cancel_account_invite: {
        Args: {
          p_actor_user_id: string
          p_idempotency_key: string
          p_invite_id: string
        }
        Returns: Json
      }
      cancel_friendship_invite: {
        Args: {
          p_actor_user_id: string
          p_idempotency_key: string
          p_invite_id: string
        }
        Returns: Json
      }
      claim_account_invite_for_registration_hash: {
        Args: {
          p_delivery_token_hash: string
          p_email: string
          p_phone_e164: string
          p_user_id: string
        }
        Returns: Json
      }
      claim_external_friendship_invite: {
        Args: {
          p_actor_user_id: string
          p_delivery_token: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      claim_graph_cycle_job: { Args: { p_worker_id?: string }; Returns: Json }
      claim_welcome_email_delivery: {
        Args: { p_actor_user_id: string }
        Returns: {
          display_name: string
          email: string
        }[]
      }
      cleanup_supabase_usage_retention: { Args: never; Returns: Json }
      complete_graph_cycle_job: {
        Args: { p_job_id: string; p_result_json: Json; p_worker_id: string }
        Returns: Json
      }
      compute_graph_component_snapshot: {
        Args: {
          p_currency_code?: string
          p_left_user_id: string
          p_right_user_id: string
        }
        Returns: Json
      }
      compute_graph_component_snapshot_hash: {
        Args: {
          p_currency_code?: string
          p_left_user_id: string
          p_right_user_id: string
        }
        Returns: string
      }
      compute_graph_snapshot_hash: { Args: never; Returns: string }
      compute_happy_circle_participant_set_hash: {
        Args: { p_participant_user_ids: string[] }
        Returns: string
      }
      create_account_invite: {
        Args: {
          p_actor_user_id: string
          p_channel: Database["public"]["Enums"]["account_invite_channel"]
          p_idempotency_key: string
          p_intended_recipient_alias?: string
          p_intended_recipient_phone_e164?: string
          p_intended_recipient_phone_label?: string
          p_source_context?: string
        }
        Returns: Json
      }
      create_balance_request: {
        Args: {
          p_actor_user_id: string
          p_amount_minor: number
          p_category?: Database["public"]["Enums"]["transaction_category"]
          p_creditor_user_id: string
          p_debtor_user_id: string
          p_description: string
          p_idempotency_key: string
          p_parent_request_id?: string
          p_request_type: Database["public"]["Enums"]["request_type"]
          p_responder_user_id: string
          p_target_ledger_transaction_id?: string
        }
        Returns: Json
      }
      create_external_friendship_invite: {
        Args: {
          p_actor_user_id: string
          p_channel: Database["public"]["Enums"]["friendship_invite_channel"]
          p_idempotency_key: string
          p_intended_recipient_alias?: string
          p_intended_recipient_phone_e164?: string
          p_intended_recipient_phone_label?: string
          p_source_context?: string
        }
        Returns: Json
      }
      create_internal_friendship_invite: {
        Args: {
          p_actor_user_id: string
          p_idempotency_key: string
          p_source_context?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      create_people_outreach: {
        Args: {
          p_actor_user_id: string
          p_channel: Database["public"]["Enums"]["account_invite_channel"]
          p_idempotency_key: string
          p_intended_recipient_alias?: string
          p_intended_recipient_phone_e164?: string
          p_intended_recipient_phone_label?: string
          p_source_context?: string
        }
        Returns: Json
      }
      current_user_is_settlement_participant: {
        Args: { p_settlement_proposal_id: string }
        Returns: boolean
      }
      decide_cycle_settlement: {
        Args: {
          p_actor_user_id: string
          p_decision: Database["public"]["Enums"]["settlement_participant_decision"]
          p_idempotency_key: string
          p_proposal_id: string
        }
        Returns: Json
      }
      effective_account_invite_delivery_status: {
        Args: { p_expires_at: string; p_revoked_at: string; p_status: string }
        Returns: string
      }
      effective_account_invite_status: {
        Args: {
          p_expires_at: string
          p_status: Database["public"]["Enums"]["account_invite_status"]
        }
        Returns: Database["public"]["Enums"]["account_invite_status"]
      }
      effective_friendship_delivery_status: {
        Args: {
          p_expires_at: string
          p_revoked_at: string
          p_status: Database["public"]["Enums"]["friendship_invite_delivery_status"]
        }
        Returns: Database["public"]["Enums"]["friendship_invite_delivery_status"]
      }
      effective_friendship_invite_status: {
        Args: {
          p_expires_at: string
          p_status: Database["public"]["Enums"]["friendship_invite_status"]
        }
        Returns: Database["public"]["Enums"]["friendship_invite_status"]
      }
      enqueue_graph_cycle_job: {
        Args: {
          p_actor_user_id: string
          p_anchor_user_id: string
          p_currency_code?: string
          p_left_user_id: string
          p_right_user_id: string
          p_source_id: string
          p_source_type: string
        }
        Returns: Json
      }
      enqueue_manual_graph_cycle_job: {
        Args: { p_actor_user_id: string; p_idempotency_key: string }
        Returns: Json
      }
      ensure_relationship_accounts: {
        Args: { p_relationship_id: string }
        Returns: undefined
      }
      execute_cycle_settlement: {
        Args: {
          p_actor_user_id: string
          p_idempotency_key: string
          p_proposal_id: string
        }
        Returns: Json
      }
      fail_graph_cycle_job: {
        Args: { p_error: string; p_job_id: string; p_worker_id: string }
        Returns: Json
      }
      friendship_channel_from_label: {
        Args: { p_label: string }
        Returns: Database["public"]["Enums"]["friendship_invite_channel"]
      }
      friendship_identity_flags: { Args: { p_user_id: string }; Returns: Json }
      friendship_identity_ready: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      generate_short_token: { Args: { p_bytes?: number }; Returns: string }
      get_account_invite_preview_public: {
        Args: {
          p_actor_user_id?: string
          p_client_fingerprint_hash?: string
          p_delivery_token: string
          p_record_app_open?: boolean
        }
        Returns: Json
      }
      get_friendship_invite_preview: {
        Args: { p_actor_user_id: string; p_delivery_token: string }
        Returns: Json
      }
      get_graph_cycle_job_context: { Args: { p_job_id: string }; Returns: Json }
      graph_pair_lock_key: {
        Args: {
          p_currency_code?: string
          p_left_user_id: string
          p_right_user_id: string
        }
        Returns: number
      }
      hash_analytics_device_id: {
        Args: { p_device_id: string }
        Returns: string
      }
      hash_invite_token: { Args: { p_token: string }; Returns: string }
      ingest_product_analytics: {
        Args: {
          p_actor_user_id: string
          p_client_session: Json
          p_events?: Json
        }
        Returns: Json
      }
      lock_graph_pair: {
        Args: {
          p_currency_code?: string
          p_left_user_id: string
          p_right_user_id: string
        }
        Returns: undefined
      }
      mark_happy_circle_proposal_stale: {
        Args: {
          p_actor_user_id: string
          p_proposal_id: string
          p_reason?: Database["public"]["Enums"]["settlement_stale_reason"]
        }
        Returns: undefined
      }
      mark_outdated_settlement_proposals_stale: {
        Args: { p_current_graph_snapshot_hash: string }
        Returns: number
      }
      mark_touched_settlement_proposals_stale: {
        Args: { p_touched_user_ids: string[] }
        Returns: number
      }
      mark_welcome_email_sent: {
        Args: { p_actor_user_id: string }
        Returns: undefined
      }
      mask_email_value: { Args: { p_email: string }; Returns: string }
      mask_phone_value: { Args: { p_phone: string }; Returns: string }
      normalize_phone_e164: {
        Args: {
          p_country_calling_code: string
          p_phone_national_number: string
        }
        Returns: string
      }
      propose_cycle_settlement: {
        Args: {
          p_actor_user_id: string
          p_anchor_user_high_id?: string
          p_anchor_user_low_id?: string
          p_currency_code?: string
          p_graph_snapshot: Json
          p_graph_snapshot_hash: string
          p_idempotency_key: string
          p_movements_json: Json
          p_participant_user_ids: string[]
          p_source_graph_cycle_job_id?: string
        }
        Returns: Json
      }
      record_product_event: {
        Args: {
          p_actor_user_id: string
          p_client_event_id: string
          p_event_name: string
          p_metadata_json?: Json
          p_occurred_at?: string
          p_screen_name?: string
          p_session_id: string
        }
        Returns: string
      }
      record_support_error_report: {
        Args: {
          p_actor_user_id: string
          p_app_version?: string
          p_error_code?: string
          p_error_message?: string
          p_fatal?: boolean
          p_function_name?: string
          p_kind: string
          p_metadata_json?: Json
          p_occurred_at?: string
          p_platform?: string
          p_request_id?: string
          p_route?: string
          p_screen_name?: string
          p_support_id: string
        }
        Returns: string
      }
      refresh_all_pair_net_edges_cache: { Args: never; Returns: undefined }
      refresh_analytics_daily_facts: {
        Args: { p_day: string }
        Returns: undefined
      }
      refresh_analytics_recent_facts: {
        Args: { p_days_back?: number }
        Returns: undefined
      }
      refresh_pair_net_edge_for_pair: {
        Args: {
          p_last_ledger_transaction_id?: string
          p_left_user_id: string
          p_right_user_id: string
        }
        Returns: undefined
      }
      reject_financial_request: {
        Args: {
          p_actor_user_id: string
          p_idempotency_key: string
          p_request_id: string
        }
        Returns: Json
      }
      release_welcome_email_delivery: {
        Args: { p_actor_user_id: string; p_error: string }
        Returns: undefined
      }
      request_account_deletion: {
        Args: { p_actor_user_id: string; p_idempotency_key: string }
        Returns: Json
      }
      requeue_stale_graph_cycle_jobs: {
        Args: { p_limit?: number; p_timeout_seconds?: number }
        Returns: Json
      }
      resolve_people_targets: {
        Args: { p_actor_user_id: string; p_phone_e164_list: string[] }
        Returns: Json
      }
      respond_internal_friendship_invite: {
        Args: {
          p_actor_user_id: string
          p_decision: string
          p_idempotency_key: string
          p_invite_id: string
        }
        Returns: Json
      }
      review_account_invite: {
        Args: {
          p_actor_user_id: string
          p_decision: string
          p_idempotency_key: string
          p_invite_id: string
        }
        Returns: Json
      }
      review_external_friendship_invite: {
        Args: {
          p_actor_user_id: string
          p_decision: string
          p_idempotency_key: string
          p_invite_id: string
        }
        Returns: Json
      }
      sanitize_product_event_metadata:
        | {
            Args: { p_event_name: string; p_metadata_json: Json }
            Returns: Json
          }
        | { Args: { p_metadata_json: Json }; Returns: Json }
      sanitize_support_error_metadata: {
        Args: { p_metadata_json: Json }
        Returns: Json
      }
      start_app_session: {
        Args: {
          p_actor_user_id: string
          p_app_version?: string
          p_client_session_id: string
          p_device_id?: string
          p_platform: string
          p_started_at?: string
        }
        Returns: string
      }
      supersede_graph_cycle_job: {
        Args: { p_job_id: string; p_result_json: Json }
        Returns: Json
      }
      validate_cycle_settlement_payload: {
        Args: {
          p_anchor_user_high_id?: string
          p_anchor_user_low_id?: string
          p_currency_code?: string
          p_graph_snapshot: Json
          p_movements_json: Json
          p_participant_user_ids: string[]
        }
        Returns: Json
      }
    }
    Enums: {
      account_access_state: "needs_invite" | "needs_activation" | "active"
      account_invite_channel: "remote" | "qr"
      account_invite_status:
        | "pending_activation"
        | "pending_inviter_review"
        | "accepted"
        | "rejected"
        | "canceled"
        | "expired"
      friendship_invite_channel:
        | "internal"
        | "whatsapp"
        | "link"
        | "qr"
        | "remote"
      friendship_invite_delivery_status:
        | "issued"
        | "claimed"
        | "revoked"
        | "expired"
      friendship_invite_flow: "internal" | "external"
      friendship_invite_resolution_actor: "sender" | "recipient" | "system"
      friendship_invite_status:
        | "pending_recipient"
        | "pending_claim"
        | "pending_sender_review"
        | "accepted"
        | "rejected"
        | "canceled"
        | "expired"
      graph_cycle_job_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "superseded"
      happy_circle_case_status: "active" | "completed" | "closed"
      ledger_account_kind: "receivable" | "payable"
      ledger_entry_side: "debit" | "credit"
      ledger_source_type: "user" | "system"
      ledger_transaction_type:
        | "balance_increase_acceptance"
        | "transaction_reversal_acceptance"
        | "cycle_settlement"
      relationship_status: "active" | "archived"
      request_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "amended"
        | "canceled"
        | "expired"
      request_type: "balance_increase" | "transaction_reversal"
      settlement_participant_decision: "pending" | "approved" | "rejected"
      settlement_proposal_status:
        | "pending_approvals"
        | "approved"
        | "rejected"
        | "stale"
        | "executed"
        | "expired"
      settlement_stale_reason:
        | "balance_changed"
        | "related_execution_changed_balance"
        | "participant_set_changed"
      transaction_category:
        | "food_drinks"
        | "transport"
        | "entertainment"
        | "services"
        | "home"
        | "other"
        | "cycle"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_access_state: ["needs_invite", "needs_activation", "active"],
      account_invite_channel: ["remote", "qr"],
      account_invite_status: [
        "pending_activation",
        "pending_inviter_review",
        "accepted",
        "rejected",
        "canceled",
        "expired",
      ],
      friendship_invite_channel: [
        "internal",
        "whatsapp",
        "link",
        "qr",
        "remote",
      ],
      friendship_invite_delivery_status: [
        "issued",
        "claimed",
        "revoked",
        "expired",
      ],
      friendship_invite_flow: ["internal", "external"],
      friendship_invite_resolution_actor: ["sender", "recipient", "system"],
      friendship_invite_status: [
        "pending_recipient",
        "pending_claim",
        "pending_sender_review",
        "accepted",
        "rejected",
        "canceled",
        "expired",
      ],
      graph_cycle_job_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "superseded",
      ],
      happy_circle_case_status: ["active", "completed", "closed"],
      ledger_account_kind: ["receivable", "payable"],
      ledger_entry_side: ["debit", "credit"],
      ledger_source_type: ["user", "system"],
      ledger_transaction_type: [
        "balance_increase_acceptance",
        "transaction_reversal_acceptance",
        "cycle_settlement",
      ],
      relationship_status: ["active", "archived"],
      request_status: [
        "pending",
        "accepted",
        "rejected",
        "amended",
        "canceled",
        "expired",
      ],
      request_type: ["balance_increase", "transaction_reversal"],
      settlement_participant_decision: ["pending", "approved", "rejected"],
      settlement_proposal_status: [
        "pending_approvals",
        "approved",
        "rejected",
        "stale",
        "executed",
        "expired",
      ],
      settlement_stale_reason: [
        "balance_changed",
        "related_execution_changed_balance",
        "participant_set_changed",
      ],
      transaction_category: [
        "food_drinks",
        "transport",
        "entertainment",
        "services",
        "home",
        "other",
        "cycle",
      ],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
