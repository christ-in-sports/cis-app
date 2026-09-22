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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attendance_days: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          group_id: string
          id: string
          label: string | null
          locked: boolean
          notes: string | null
          season_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date: string
          group_id: string
          id?: string
          label?: string | null
          locked?: boolean
          notes?: string | null
          season_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          group_id?: string
          id?: string
          label?: string | null
          locked?: boolean
          notes?: string | null
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_days_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "attendance_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_groups: {
        Row: {
          active: boolean
          created_at: string | null
          created_by: string | null
          exclude_ids: string[]
          grade_max: number | null
          grade_min: number | null
          id: string
          include_ids: string[]
          name: string
          session: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          created_by?: string | null
          exclude_ids?: string[]
          grade_max?: number | null
          grade_min?: number | null
          id?: string
          include_ids?: string[]
          name: string
          session?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          created_by?: string | null
          exclude_ids?: string[]
          grade_max?: number | null
          grade_min?: number | null
          id?: string
          include_ids?: string[]
          name?: string
          session?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          day_id: string
          id: string
          marked_at: string | null
          marked_by: string | null
          method: string
          registration_id: string
          status: string
        }
        Insert: {
          day_id: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          method?: string
          registration_id: string
          status?: string
        }
        Update: {
          day_id?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          method?: string
          registration_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "attendance_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      game_days: {
        Row: {
          courts_available: number | null
          created_at: string | null
          date: string
          duration_min: number | null
          id: string
          notes: string | null
          sport_type: string | null
          start_time: string | null
          tournament_id: string
        }
        Insert: {
          courts_available?: number | null
          created_at?: string | null
          date: string
          duration_min?: number | null
          id?: string
          notes?: string | null
          sport_type?: string | null
          start_time?: string | null
          tournament_id: string
        }
        Update: {
          courts_available?: number | null
          created_at?: string | null
          date?: string
          duration_min?: number | null
          id?: string
          notes?: string | null
          sport_type?: string | null
          start_time?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_days_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      match_scores: {
        Row: {
          away_score: number | null
          home_score: number | null
          id: string
          match_id: string
          score_details: Json | null
          updated_at: string | null
        }
        Insert: {
          away_score?: number | null
          home_score?: number | null
          id?: string
          match_id: string
          score_details?: Json | null
          updated_at?: string | null
        }
        Update: {
          away_score?: number | null
          home_score?: number | null
          id?: string
          match_id?: string
          score_details?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_scores_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_team_id: string | null
          bracket: string | null
          court: number | null
          created_at: string | null
          estimated_duration_min: number | null
          home_team_id: string | null
          id: string
          is_draw: boolean | null
          match_type: string
          round: number | null
          scheduled_date: string | null
          scheduled_time: string | null
          sport_id: string
          status: string
          tournament_id: string
          updated_at: string | null
          winner_team_id: string | null
        }
        Insert: {
          away_team_id?: string | null
          bracket?: string | null
          court?: number | null
          created_at?: string | null
          estimated_duration_min?: number | null
          home_team_id?: string | null
          id?: string
          is_draw?: boolean | null
          match_type: string
          round?: number | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          sport_id: string
          status?: string
          tournament_id: string
          updated_at?: string | null
          winner_team_id?: string | null
        }
        Update: {
          away_team_id?: string | null
          bracket?: string | null
          court?: number | null
          created_at?: string | null
          estimated_duration_min?: number | null
          home_team_id?: string | null
          id?: string
          is_draw?: boolean | null
          match_type?: string
          round?: number | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          sport_id?: string
          status?: string
          tournament_id?: string
          updated_at?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_teams: {
        Row: {
          active: boolean
          created_at: string | null
          id: string
          name: string
          session: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          id?: string
          name: string
          session?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          id?: string
          name?: string
          session?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          id: string
          match_id: string | null
          sent_at: string | null
          sent_by: string | null
          title: string
          tournament_id: string
        }
        Insert: {
          body: string
          id?: string
          match_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          title: string
          tournament_id: string
        }
        Update: {
          body?: string
          id?: string
          match_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          title?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      overall_standings: {
        Row: {
          basketball_points: number | null
          dodgeball_points: number | null
          id: string
          position: number | null
          soccer_points: number | null
          team_id: string
          total_points: number | null
          tournament_id: string
          updated_at: string | null
          volleyball_points: number | null
        }
        Insert: {
          basketball_points?: number | null
          dodgeball_points?: number | null
          id?: string
          position?: number | null
          soccer_points?: number | null
          team_id: string
          total_points?: number | null
          tournament_id: string
          updated_at?: string | null
          volleyball_points?: number | null
        }
        Update: {
          basketball_points?: number | null
          dodgeball_points?: number | null
          id?: string
          position?: number | null
          soccer_points?: number | null
          team_id?: string
          total_points?: number | null
          tournament_id?: string
          updated_at?: string | null
          volleyball_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "overall_standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overall_standings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          is_coach: boolean
          is_staff: boolean
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          is_coach?: boolean
          is_staff?: boolean
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_coach?: boolean
          is_staff?: boolean
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          fcm_token: string
          id: string
          tournament_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          fcm_token: string
          id?: string
          tournament_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          fcm_token?: string
          id?: string
          tournament_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          active: boolean
          address: string | null
          attendance: Json
          attendance_archive: Json
          created_at: string | null
          created_by: string | null
          dob: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          gender: string | null
          grade: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          last_name: string
          notes: string | null
          qr_token: string | null
          session: string | null
          source: string
          team_id: string | null
          updated_at: string | null
          youth_email: string | null
          youth_phone: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          attendance?: Json
          attendance_archive?: Json
          created_at?: string | null
          created_by?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          gender?: string | null
          grade?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          last_name: string
          notes?: string | null
          qr_token?: string | null
          session?: string | null
          source?: string
          team_id?: string | null
          updated_at?: string | null
          youth_email?: string | null
          youth_phone?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          attendance?: Json
          attendance_archive?: Json
          created_at?: string | null
          created_by?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          gender?: string | null
          grade?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          last_name?: string
          notes?: string | null
          qr_token?: string | null
          session?: string | null
          source?: string
          team_id?: string | null
          updated_at?: string | null
          youth_email?: string | null
          youth_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_team_fk"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "ministry_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string | null
          ends_on: string | null
          id: string
          is_current: boolean
          name: string
          starts_on: string
        }
        Insert: {
          created_at?: string | null
          ends_on?: string | null
          id?: string
          is_current?: boolean
          name: string
          starts_on?: string
        }
        Update: {
          created_at?: string | null
          ends_on?: string | null
          id?: string
          is_current?: boolean
          name?: string
          starts_on?: string
        }
        Relationships: []
      }
      sports: {
        Row: {
          created_at: string | null
          id: string
          play_mode: string
          settings: Json | null
          sport_type: string
          status: string
          tournament_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          play_mode: string
          settings?: Json | null
          sport_type: string
          status?: string
          tournament_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          play_mode?: string
          settings?: Json | null
          sport_type?: string
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sports_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      standings: {
        Row: {
          conceded: number | null
          difference: number | null
          drawn: number | null
          id: string
          lost: number | null
          played: number | null
          points: number | null
          position: number | null
          scored: number | null
          sport_id: string
          team_id: string
          updated_at: string | null
          won: number | null
        }
        Insert: {
          conceded?: number | null
          difference?: number | null
          drawn?: number | null
          id?: string
          lost?: number | null
          played?: number | null
          points?: number | null
          position?: number | null
          scored?: number | null
          sport_id: string
          team_id: string
          updated_at?: string | null
          won?: number | null
        }
        Update: {
          conceded?: number | null
          difference?: number | null
          drawn?: number | null
          id?: string
          lost?: number | null
          played?: number | null
          points?: number | null
          position?: number | null
          scored?: number | null
          sport_id?: string
          team_id?: string
          updated_at?: string | null
          won?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "standings_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_coaches: {
        Row: {
          added_at: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          added_at?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_coaches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "ministry_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_coaches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          seed: number | null
          tournament_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          seed?: number | null
          tournament_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          seed?: number | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_members: {
        Row: {
          id: string
          joined_at: string | null
          role: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          role?: string
          tournament_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          role?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_members_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_members_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string | null
          current_sport: string | null
          description: string | null
          id: string
          name: string
          owner_id: string
          share_code: string | null
          sport_weights: Json | null
          status: string
          team_count: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_sport?: string | null
          description?: string | null
          id?: string
          name: string
          owner_id: string
          share_code?: string | null
          sport_weights?: Json | null
          status?: string
          team_count: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_sport?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          share_code?: string | null
          sport_weights?: Json | null
          status?: string
          team_count?: number
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attendance_summary: {
        Args: { p_season?: string }
        Returns: {
          absent: number
          attended: number
          eligible: number
          excused: number
          first_name: string
          grade: string
          last_name: string
          late: number
          pct: number
          present: number
          registration_id: string
          session: string
          team_id: string
          team_name: string
          unmarked: number
        }[]
      }
      can_mark: { Args: { p_reg: string }; Returns: boolean }
      check_in_by_token: {
        Args: { p_day: string; p_method?: string; p_token: string }
        Returns: Json
      }
      default_session: { Args: { g: string }; Returns: string }
      get_my_tournament_ids: { Args: never; Returns: string[] }
      grade_num: { Args: { g: string }; Returns: number }
      is_coach: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      parse_session_choice: {
        Args: { p_choice: string; p_grade: string }
        Returns: string
      }
      populate_attendance_day: { Args: { p_day: string }; Returns: number }
      start_new_season: { Args: { p_name: string }; Returns: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
