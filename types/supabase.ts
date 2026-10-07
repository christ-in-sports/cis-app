export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      import_batches: {
        Row: {
          committed_at: string | null
          created_at: string
          error_message: string | null
          error_rows: number
          file_name: string
          id: string
          missing_required: string[]
          season_id: string
          status: string
          total_rows: number
          unmapped_headers: string[]
          updated_at: string
          uploaded_by: string | null
          valid_rows: number
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          error_message?: string | null
          error_rows?: number
          file_name: string
          id?: string
          missing_required?: string[]
          season_id: string
          status?: string
          total_rows?: number
          unmapped_headers?: string[]
          updated_at?: string
          uploaded_by?: string | null
          valid_rows?: number
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          error_message?: string | null
          error_rows?: number
          file_name?: string
          id?: string
          missing_required?: string[]
          season_id?: string
          status?: string
          total_rows?: number
          unmapped_headers?: string[]
          updated_at?: string
          uploaded_by?: string | null
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          action: string | null
          batch_id: string
          consent_claim: string | null
          created_at: string
          display_name: string | null
          duplicate_of_row: number | null
          errors: Json
          id: string
          matched_kid_id: string | null
          parsed: Json | null
          raw: Json
          row_number: number
        }
        Insert: {
          action?: string | null
          batch_id: string
          consent_claim?: string | null
          created_at?: string
          display_name?: string | null
          duplicate_of_row?: number | null
          errors?: Json
          id?: string
          matched_kid_id?: string | null
          parsed?: Json | null
          raw: Json
          row_number: number
        }
        Update: {
          action?: string | null
          batch_id?: string
          consent_claim?: string | null
          created_at?: string
          display_name?: string | null
          duplicate_of_row?: number | null
          errors?: Json
          id?: string
          matched_kid_id?: string | null
          parsed?: Json | null
          raw?: Json
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_matched_kid_id_fkey"
            columns: ["matched_kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kids: {
        Row: {
          allergies: string | null
          created_at: string
          dob: string
          email: string | null
          emergency_contact_name: string
          emergency_contact_phone: string
          first_name: string
          gender: string
          guardian_email: string
          guardian_name: string
          guardian_phone: string
          home_address: string
          id: string
          last_name: string
          parent_user_id: string | null
          phone: string | null
          skill_tags: string[]
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          created_at?: string
          dob: string
          email?: string | null
          emergency_contact_name: string
          emergency_contact_phone: string
          first_name: string
          gender: string
          guardian_email: string
          guardian_name: string
          guardian_phone: string
          home_address: string
          id?: string
          last_name: string
          parent_user_id?: string | null
          phone?: string | null
          skill_tags?: string[]
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          created_at?: string
          dob?: string
          email?: string | null
          emergency_contact_name?: string
          emergency_contact_phone?: string
          first_name?: string
          gender?: string
          guardian_email?: string
          guardian_name?: string
          guardian_phone?: string
          home_address?: string
          id?: string
          last_name?: string
          parent_user_id?: string | null
          phone?: string | null
          skill_tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          method: string
          received_at: string
          recorded_by: string | null
          registration_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          method: string
          received_at?: string
          recorded_by?: string | null
          registration_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          method?: string
          received_at?: string
          recorded_by?: string | null
          registration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
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
      registrations: {
        Row: {
          active: boolean
          consent_by_user_id: string | null
          consent_given_at: string | null
          created_at: string
          created_by: string | null
          division: string
          grade: number
          id: string
          kid_id: string
          season_id: string
          source: string
          team_id: string | null
          top_sports: string[] | null
          tshirt_size: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          consent_by_user_id?: string | null
          consent_given_at?: string | null
          created_at?: string
          created_by?: string | null
          division: string
          grade: number
          id?: string
          kid_id: string
          season_id: string
          source?: string
          team_id?: string | null
          top_sports?: string[] | null
          tshirt_size: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          consent_by_user_id?: string | null
          consent_given_at?: string | null
          created_at?: string
          created_by?: string | null
          division?: string
          grade?: number
          id?: string
          kid_id?: string
          season_id?: string
          source?: string
          team_id?: string | null
          top_sports?: string[] | null
          tshirt_size?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_consent_by_user_id_fkey"
            columns: ["consent_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_team_id_fkey"
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
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          division: string
          eligible: number
          excused: number
          first_name: string
          grade: number
          last_name: string
          late: number
          pct: number
          present: number
          registration_id: string
          team_id: string
          team_name: string
          unmarked: number
        }[]
      }
      can_mark: { Args: { p_reg: string }; Returns: boolean }
      can_read_kid: { Args: { p_kid: string }; Returns: boolean }
      check_in_by_token: {
        Args: { p_day: string; p_method?: string; p_token: string }
        Returns: Json
      }
      coaches_kid: { Args: { p_kid: string }; Returns: boolean }
      default_session: { Args: { g: string }; Returns: string }
      delete_payment: { Args: { p_payment_id: string }; Returns: string }
      grade_num: { Args: { g: string }; Returns: number }
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      import_commit: { Args: { p_batch_id: string }; Returns: Json }
      is_coach: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      link_my_kids: { Args: never; Returns: number }
      parse_session_choice: {
        Args: { p_choice: string; p_grade: string }
        Returns: string
      }
      populate_attendance_day: { Args: { p_day: string }; Returns: number }
      record_payments: {
        Args: {
          p_amount_cents: number
          p_method: string
          p_registration_ids: string[]
        }
        Returns: {
          amount_cents: number
          method: string
          payment_id: string
          received_at: string
          registration_id: string
        }[]
      }
      register_kid: {
        Args: {
          p_consent: boolean
          p_kid: Json
          p_kid_id: string
          p_registration: Json
        }
        Returns: {
          kid_id: string
          registration_id: string
        }[]
      }
      set_registrations_consent: {
        Args: { p_received: boolean; p_registration_ids: string[] }
        Returns: {
          consent_by_user_id: string
          consent_given_at: string
          registration_id: string
        }[]
      }
      start_new_season: { Args: { p_name: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "program" | "coach" | "prayer" | "parent" | "kid"
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
    Enums: {
      app_role: ["admin", "program", "coach", "prayer", "parent", "kid"],
    },
  },
} as const

