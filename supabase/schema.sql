--- ==========================================
--- 1. LIMPEZA E INFRAESTRUTURA
--- ==========================================
-- Remove triggers antigos para evitar duplicidade
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_products_modtime ON public.products;
DROP TRIGGER IF EXISTS update_profiles_modtime ON public.profiles;

--- ==========================================
--- 2. TIPOS E ROLES
--- ==========================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL DEFAULT 'user',
    UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    receive_notifications BOOLEAN DEFAULT false,
    receive_promotions BOOLEAN DEFAULT false,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

--- ==========================================
--- 3. TABELAS DE NEGÓCIO
--- ==========================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    short_description TEXT,
    advantages TEXT[] DEFAULT '{}',
    price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2),
    discount_percentage INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    is_on_sale BOOLEAN DEFAULT false,
    image_url TEXT,
    images TEXT[] DEFAULT '{}',
    affiliate_link TEXT,
    instructions TEXT,
    usage_instructions TEXT,
    specifications JSONB,
    sku TEXT,
    stock_quantity INTEGER DEFAULT 0,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    marketplace TEXT DEFAULT 'manual',
    external_id TEXT, 
    free_shipping BOOLEAN DEFAULT false,
    last_sync TIMESTAMP WITH TIME ZONE,
    clicks_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE(user_id, product_id)
);

--- ==========================================
--- 4. FUNÇÕES (SECURITY DEFINER + SEARCH_PATH)
--- ==========================================

-- Verificador de Role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
END;
$$;

-- Atualizador de Timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql 
SET search_path = public AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Contador de Cliques
CREATE OR REPLACE FUNCTION public.increment_product_clicks(product_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    UPDATE public.products SET clicks_count = clicks_count + 1 WHERE id = product_id;
END;
$$;

-- Handler de Novo Usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');

    RETURN NEW;   
END;
$$;

--- ==========================================
--- 5. TRIGGERS
--- ==========================================
CREATE TRIGGER update_products_modtime BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

--- ==========================================
--- 6. SEGURANÇA (RLS)
--- ==========================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS: User Roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- POLÍTICAS: Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- POLÍTICAS: Products
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products" ON public.products FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products" ON public.products FOR ALL USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Service role bypass" ON public.products;
CREATE POLICY "Service role bypass" ON public.products FOR ALL TO service_role USING (true);

-- POLÍTICAS: Categories
DROP POLICY IF EXISTS "Public can view categories" ON public.categories;
CREATE POLICY "Public can view categories" ON public.categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- POLÍTICAS: Favorites
DROP POLICY IF EXISTS "Users manage own favorites" ON public.favorites;
CREATE POLICY "Users manage own favorites" ON public.favorites FOR ALL USING (auth.uid() = user_id);

--- ==========================================
--- 7. PERMISSÕES E SEED
--- ==========================================
GRANT EXECUTE ON FUNCTION public.increment_product_clicks TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.categories TO anon, authenticated;

-- Seed de Categorias
INSERT INTO public.categories (name, slug) 
VALUES ('Suplementos', 'suplementos'), ('Acessórios', 'acessorios'), ('Equipamentos', 'equipamentos')
ON CONFLICT (slug) DO NOTHING;

-- ⭐ CONFIGURAÇÃO ADMIN (LUIZ) ⭐
INSERT INTO public.user_roles (user_id, role)
VALUES ('78c55456-cd4e-472f-bcdc-4ef5add49de6', 'admin')
ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin';

INSERT INTO public.profiles (user_id, email, full_name)
VALUES ('78c55456-cd4e-472f-bcdc-4ef5add49de6', 'luizfop.31@gmail.com', 'Luiz Admin')
ON CONFLICT (user_id) DO UPDATE SET full_name = 'Luiz Admin';
