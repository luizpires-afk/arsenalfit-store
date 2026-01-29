import { createClient } from '@supabase/supabase-js'

// Use os seus dados reais aqui
const supabaseUrl = 'https://pixqurduxqfcujfadkbw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpeHF1cmR1eHFmY3VqZmFka2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMDIwMzMsImV4cCI6MjA4NDc3ODAzM30.S1rXTIpIP5PsrKm4aQ3eg2_Nb5f6jBEugTMWm_cIW7Y'

export const base44 = createClient(supabaseUrl, supabaseKey)

// Função auxiliar para buscar produtos com nomes de categorias/marcas
export const getProducts = async () => {
  const { data, error } = await base44
    .from('products')
    .select(`
      *,
      categories (name),
      brands (name)
    `) // Isso faz o "Join" automático
  
  if (error) throw error
  return data
}