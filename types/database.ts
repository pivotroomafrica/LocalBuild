// Auto-generated from the PIVOTROOM-DEMO Supabase project schema.
// Regenerate after any migration change:
//   Supabase Dashboard -> Project -> API Docs -> "Generate types", or the
//   Supabase MCP `generate_typescript_types` tool, or:
//   npx supabase gen types typescript --project-id <project-id> > types/database.ts
// Do not hand-edit — hand-written domain types live in types/profile.ts
// and types/expert.ts.

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
      [_ in never]: never
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
