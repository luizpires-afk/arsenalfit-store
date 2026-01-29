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
  original_price: number | null;
  discount_percentage: number;

  is_featured: boolean;
  is_active: boolean;
  is_on_sale: boolean;

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

  // No SQL está como TEXT DEFAULT 'manual'
  marketplace: "amazon" | "mercadolivre" | "manual" | string;

  external_id: string | null;
  free_shipping: boolean;

  last_sync: string | null;
  clicks_count: number;

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

