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
      customer_profiles: {
        Row: {
          company_name: string | null
          created_at: string
          current_role: string | null
          employment_type: string | null
          id: string
          industry_id: string | null
          linkedin_url: string | null
          updated_at: string
          user_id: string
          years_experience_range: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          current_role?: string | null
          employment_type?: string | null
          id?: string
          industry_id?: string | null
          linkedin_url?: string | null
          updated_at?: string
          user_id: string
          years_experience_range?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          current_role?: string | null
          employment_type?: string | null
          id?: string
          industry_id?: string | null
          linkedin_url?: string | null
          updated_at?: string
          user_id?: string
          years_experience_range?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_availability_overrides: {
        Row: {
          created_at: string
          end_time: string | null
          expert_profile_id: string
          id: string
          original_date: string
          override_date: string | null
          override_type: string
          recurring_rule_id: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          expert_profile_id: string
          id?: string
          original_date: string
          override_date?: string | null
          override_type: string
          recurring_rule_id: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          expert_profile_id?: string
          id?: string
          original_date?: string
          override_date?: string | null
          override_type?: string
          recurring_rule_id?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_availability_overrides_expert_profile_id_fkey"
            columns: ["expert_profile_id"]
            isOneToOne: false
            referencedRelation: "expert_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_availability_overrides_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "expert_monthly_availability_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_availability_settings: {
        Row: {
          created_at: string
          expert_profile_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expert_profile_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expert_profile_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_availability_settings_expert_profile_id_fkey"
            columns: ["expert_profile_id"]
            isOneToOne: true
            referencedRelation: "expert_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      expert_monthly_availability_rules: {
        Row: {
          created_at: string
          day_of_month: number
          end_time: string
          expert_profile_id: string
          id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_month: number
          end_time: string
          expert_profile_id: string
          id?: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_month?: number
          end_time?: string
          expert_profile_id?: string
          id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_monthly_availability_rules_expert_profile_id_fkey"
            columns: ["expert_profile_id"]
            isOneToOne: false
            referencedRelation: "expert_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_one_off_availability: {
        Row: {
          available_date: string
          created_at: string
          end_time: string
          expert_profile_id: string
          id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          available_date: string
          created_at?: string
          end_time: string
          expert_profile_id: string
          id?: string
          start_time: string
          updated_at?: string
        }
        Update: {
          available_date?: string
          created_at?: string
          end_time?: string
          expert_profile_id?: string
          id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_one_off_availability_expert_profile_id_fkey"
            columns: ["expert_profile_id"]
            isOneToOne: false
            referencedRelation: "expert_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_profile_categories: {
        Row: {
          category_id: string
          created_at: string
          expert_profile_id: string
          id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          expert_profile_id: string
          id?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          expert_profile_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_profile_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expert_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_profile_categories_expert_profile_id_fkey"
            columns: ["expert_profile_id"]
            isOneToOne: false
            referencedRelation: "expert_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_profiles: {
        Row: {
          application_status: string
          approved_at: string | null
          approved_by: string | null
          base_hourly_price: number | null
          career_highlights: string | null
          city: string | null
          country: string | null
          created_at: string
          current_company: string | null
          current_position: string | null
          expertise_summary: string | null
          headline: string | null
          id: string
          in_person_enabled: boolean
          linkedin_url: string | null
          online_enabled: boolean
          problems_help_with: string | null
          profile_image_path: string | null
          profile_status: string
          published_at: string | null
          published_by: string | null
          review_message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          short_bio: string | null
          slug: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          who_i_help: string | null
          years_experience_range: string | null
        }
        Insert: {
          application_status?: string
          approved_at?: string | null
          approved_by?: string | null
          base_hourly_price?: number | null
          career_highlights?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          current_company?: string | null
          current_position?: string | null
          expertise_summary?: string | null
          headline?: string | null
          id?: string
          in_person_enabled?: boolean
          linkedin_url?: string | null
          online_enabled?: boolean
          problems_help_with?: string | null
          profile_image_path?: string | null
          profile_status?: string
          published_at?: string | null
          published_by?: string | null
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          short_bio?: string | null
          slug: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          who_i_help?: string | null
          years_experience_range?: string | null
        }
        Update: {
          application_status?: string
          approved_at?: string | null
          approved_by?: string | null
          base_hourly_price?: number | null
          career_highlights?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          current_company?: string | null
          current_position?: string | null
          expertise_summary?: string | null
          headline?: string | null
          id?: string
          in_person_enabled?: boolean
          linkedin_url?: string | null
          online_enabled?: boolean
          problems_help_with?: string | null
          profile_image_path?: string | null
          profile_status?: string
          published_at?: string | null
          published_by?: string | null
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          short_bio?: string | null
          slug?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          who_i_help?: string | null
          years_experience_range?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expert_profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_profiles_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_session_types: {
        Row: {
          base_price: number
          created_at: string
          currency: string
          duration_minutes: number
          expert_profile_id: string
          id: string
          in_person_enabled: boolean
          is_active: boolean
          online_enabled: boolean
          updated_at: string
        }
        Insert: {
          base_price: number
          created_at?: string
          currency?: string
          duration_minutes: number
          expert_profile_id: string
          id?: string
          in_person_enabled?: boolean
          is_active?: boolean
          online_enabled?: boolean
          updated_at?: string
        }
        Update: {
          base_price?: number
          created_at?: string
          currency?: string
          duration_minutes?: number
          expert_profile_id?: string
          id?: string
          in_person_enabled?: boolean
          is_active?: boolean
          online_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_session_types_expert_profile_id_fkey"
            columns: ["expert_profile_id"]
            isOneToOne: false
            referencedRelation: "expert_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      industries: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          city: string | null
          country: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          account_status?: string
          city?: string | null
          country?: string | null
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          account_status?: string
          city?: string | null
          country?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_expert_monthly_rule: {
        Args: {
          p_day_of_month: number
          p_end_time: string
          p_start_time: string
        }
        Returns: string
      }
      add_expert_one_off_availability: {
        Args: {
          p_available_date: string
          p_end_time: string
          p_start_time: string
        }
        Returns: string
      }
      expert_month_total_minutes: {
        Args: {
          p_exclude_one_off_id?: string
          p_exclude_original_date?: string
          p_exclude_override_id?: string
          p_exclude_rule_id?: string
          p_expert_profile_id: string
          p_month: number
          p_year: number
        }
        Returns: number
      }
      expert_recurring_and_override_windows_for_date: {
        Args: {
          p_date: string
          p_exclude_override_id?: string
          p_expert_profile_id: string
        }
        Returns: {
          end_time: string
          start_time: string
        }[]
      }
      get_expert_directory_public: {
        Args: never
        Returns: {
          category_names: string[]
          current_company: string
          current_position: string
          full_name: string
          headline: string
          in_person_enabled: boolean
          online_enabled: boolean
          profile_image_path: string
          slug: string
          starting_price: number
        }[]
      }
      get_expert_profile_public: {
        Args: { p_slug: string }
        Returns: {
          career_highlights: string
          category_names: string[]
          city: string
          country: string
          current_company: string
          current_position: string
          expertise_summary: string
          full_name: string
          headline: string
          in_person_enabled: boolean
          linkedin_url: string
          online_enabled: boolean
          problems_help_with: string
          profile_image_path: string
          short_bio: string
          slug: string
          who_i_help: string
          years_experience_range: string
        }[]
      }
      get_expert_session_types_public: {
        Args: { p_slug: string }
        Returns: {
          base_price: number
          currency: string
          duration_minutes: number
          in_person_enabled: boolean
          online_enabled: boolean
          slug: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_published_expert_photo: {
        Args: { object_name: string }
        Returns: boolean
      }
      max_expert_monthly_availability_minutes: {
        Args: { p_expert_profile_id?: string }
        Returns: number
      }
      remove_expert_month_override: {
        Args: { p_override_id: string }
        Returns: undefined
      }
      remove_expert_monthly_rule: {
        Args: { p_rule_id: string }
        Returns: undefined
      }
      remove_expert_one_off_availability: {
        Args: { p_id: string }
        Returns: undefined
      }
      resolve_own_approved_expert_profile_id: { Args: never; Returns: string }
      set_expert_availability_timezone: {
        Args: { p_timezone: string }
        Returns: undefined
      }
      set_expert_month_override: {
        Args: {
          p_end_time?: string
          p_original_date: string
          p_override_date?: string
          p_override_type: string
          p_recurring_rule_id: string
          p_start_time?: string
        }
        Returns: string
      }
      update_expert_monthly_rule: {
        Args: {
          p_day_of_month: number
          p_end_time: string
          p_rule_id: string
          p_start_time: string
        }
        Returns: undefined
      }
      update_expert_one_off_availability: {
        Args: {
          p_available_date: string
          p_end_time: string
          p_id: string
          p_start_time: string
        }
        Returns: undefined
      }
      validate_availability_time_range: {
        Args: { p_end_time: string; p_start_time: string }
        Returns: undefined
      }
      validate_day_of_month: {
        Args: { p_day_of_month: number }
        Returns: undefined
      }
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
