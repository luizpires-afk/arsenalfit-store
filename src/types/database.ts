export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  created_at: string | null;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;

  advantages: string[] | null;

  price: number;
  pix_price?: number | null;
  pix_price_source?: string | null;
  pix_price_checked_at?: string | null;
  original_price: number | null;
  discount_percentage: number;

  is_featured: boolean;
  is_active: boolean;
  is_on_sale: boolean;
  status?: string | null;

  image_url: string | null;
  images: string[] | null;

  // Fonte original para scraping (ex: link completo do ML)
  source_url?: string | null;

  affiliate_link: string | null;
  instructions: string | null;
  usage_instructions: string | null;
  specifications: Record<string, unknown> | null;

  sku: string | null;
  stock_quantity: number;

  category_id: string | null;
  gender?: string | null;

  // No SQL está como TEXT DEFAULT 'manual'
  marketplace: "amazon" | "mercadolivre" | "manual" | string;

  external_id: string | null;
  free_shipping: boolean;

  previous_price?: number | null;
  detected_price?: number | null;
  detected_at?: string | null;
  next_check_at?: string | null;
  last_sync: string | null;
  last_price_source?: string | null;
  last_price_verified_at?: string | null;
  clicks_count: number;
  auto_disabled_reason?: string | null;
  auto_disabled_at?: string | null;
  is_blocked?: boolean | null;

  created_at: string | null;
  updated_at: string | null;

  // join opcional no Admin: select('*, category:categories(*)')
  category?: Category | null;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  receive_notifications: boolean;
  receive_promotions: boolean;
  email_verified: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface Favorite {
  id: string;
  user_id: string;
  product_id: string;
  created_at: string | null;
  product?: Product | null;
}

export type AppRole = "admin" | "moderator" | "user";

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface MonitoredItem {
  id: string;
  user_id: string;
  user_email?: string | null;
  product_id: string;
  product_title?: string | null;
  image_url?: string | null;
  baseline_price?: number | null;
  last_notified_price?: number | null;
  last_notified_at?: string | null;
  is_enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}


