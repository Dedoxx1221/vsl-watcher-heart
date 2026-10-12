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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      events: {
        Row: {
          client_event_id: string
          created_at: string
          from_position: number | null
          id: number
          position: number
          session_id: string
          type: string
          video_id: string
        }
        Insert: {
          client_event_id: string
          created_at?: string
          from_position?: number | null
          id?: number
          position?: number
          session_id: string
          type: string
          video_id: string
        }
        Update: {
          client_event_id?: string
          created_at?: string
          from_position?: number | null
          id?: number
          position?: number
          session_id?: string
          type?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          campaign: string | null
          city: string | null
          clicked_checkout: boolean
          country: string | null
          current_position: number
          device_type: string | null
          id: string
          is_playing: boolean
          last_seen_at: string
          max_position: number
          paused_seconds: number
          played: boolean
          reached_offer: boolean
          referrer: string | null
          region: string | null
          started_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          video_id: string
          viewer_id: string
          watched_seconds: number
        }
        Insert: {
          campaign?: string | null
          city?: string | null
          clicked_checkout?: boolean
          country?: string | null
          current_position?: number
          device_type?: string | null
          id: string
          is_playing?: boolean
          last_seen_at?: string
          max_position?: number
          paused_seconds?: number
          played?: boolean
          reached_offer?: boolean
          referrer?: string | null
          region?: string | null
          started_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          video_id: string
          viewer_id: string
          watched_seconds?: number
        }
        Update: {
          campaign?: string | null
          city?: string | null
          clicked_checkout?: boolean
          country?: string | null
          current_position?: number
          device_type?: string | null
          id?: string
          is_playing?: boolean
          last_seen_at?: string
          max_position?: number
          paused_seconds?: number
          played?: boolean
          reached_offer?: boolean
          referrer?: string | null
          region?: string | null
          started_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          video_id?: string
          viewer_id?: string
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          checkout_url: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          name: string
          offer_time_seconds: number | null
          owner_id: string | null
          player_settings: Json
          thumbnail_url: string | null
          video_url: string
        }
        Insert: {
          checkout_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          name: string
          offer_time_seconds?: number | null
          owner_id?: string | null
          player_settings?: Json
          thumbnail_url?: string | null
          video_url: string
        }
        Update: {
          checkout_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          name?: string
          offer_time_seconds?: number | null
          owner_id?: string | null
          player_settings?: Json
          thumbnail_url?: string | null
          video_url?: string
        }
        Relationships: []
      }
      watch_ranges: {
        Row: {
          client_range_id: string
          end_s: number
          id: number
          session_id: string
          start_s: number
          video_id: string
        }
        Insert: {
          client_range_id: string
          end_s: number
          id?: number
          session_id: string
          start_s: number
          video_id: string
        }
        Update: {
          client_range_id?: string
          end_s?: number
          id?: number
          session_id?: string
          start_s?: number
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_ranges_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_ranges_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_live_vsl_analytics: { Args: { _video_id: string }; Returns: Json }
      get_video_analytics: {
        Args: {
          _campaign: string
          _from: string
          _to: string
          _video_id: string
        }
        Returns: Json
      }
      reset_video_metrics: { Args: { _video_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
