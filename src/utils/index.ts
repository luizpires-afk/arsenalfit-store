type PageName =
  | "Home"
  | "Products"
  | "ProductDetail"
  | "Profile"
  | "Cart"
  | "Offers"
  | "Categories"
  | "Admin"
  | "Login"
  | "Register"
  | "Auth"
  | "Compare"
  | "Favorites";

type PageParams = Record<string, string | number | undefined>;

const pageRoutes: Record<PageName, string> = {
  Home: "/",
  Products: "/produtos",
  ProductDetail: "/produto",
  Profile: "/perfil",
  Cart: "/carrinho",
  Offers: "/melhores-ofertas",
  Categories: "/categorias",
  Admin: "/admin",
  Login: "/login",
  Register: "/register",
  Auth: "/auth",
  Compare: "/compare",
  Favorites: "/favoritos",
};

export function createPageUrl(page: PageName, params?: PageParams) {
  if (page === "ProductDetail") {
    const slug = params?.slug ?? params?.id;
    if (slug) return `/produto/${slug}`;
  }

  const base = pageRoutes[page] ?? "/";
  if (!params) return base;

  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  return query ? `${base}?${query}` : base;
}

export { getFirstName } from "./user";

