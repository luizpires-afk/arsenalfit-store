import { createClient } from "@supabase/supabase-js"

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const supabaseUrl = String(rawSupabaseUrl || "").trim() || "https://invalid.local"
const supabaseAnonKey =
  String(rawSupabaseAnonKey || "").trim() ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.placeholder.signature"

if (!rawSupabaseUrl || !rawSupabaseAnonKey) {
  console.warn("Supabase env vars ausentes (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY). App inicializado em modo degradado.")
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)
