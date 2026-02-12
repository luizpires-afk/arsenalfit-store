import { Link, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Home, LayoutGrid, Menu, Package, ShoppingCart, X } from "lucide-react";
import { Button } from "@/Components/ui/button";
import { Badge } from "@/Components/ui/badge";
import { useCart } from "@/hooks/useCart";
import { UserMenu } from "@/Components/auth/UserMenu";
import { useAuth } from "@/hooks/useAuth";
import { getFirstName } from "@/utils";

const NAV_ITEMS = [
  {
    label: "Início",
    href: "/",
    icon: Home,
    isActive: (pathname: string) => pathname === "/" || pathname === "/home",
  },
  {
    label: "Categorias",
    href: "/categorias",
    icon: LayoutGrid,
    isActive: (pathname: string) =>
      pathname.startsWith("/categorias") || pathname.startsWith("/categoria"),
  },
  {
    label: "Produtos",
    href: "/produtos",
    icon: Package,
    isActive: (pathname: string) =>
      pathname.startsWith("/produtos") || pathname.startsWith("/produto"),
  },
];

const getIsActive = (pathname: string, match?: (value: string) => boolean) =>
  match ? match(pathname) : false;

type BrandMarkProps = {
  variant: "full" | "icon";
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
  textClassName?: string;
  imgClassName?: string;
};

const BRAND_ICON_SIZES: Record<NonNullable<BrandMarkProps["size"]>, string> = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-12 w-12",
};

const BRAND_FULL_SIZES: Record<NonNullable<BrandMarkProps["size"]>, string> = {
  sm: "h-9",
  md: "h-11",
  lg: "h-12",
};

const BrandMark = ({
  variant,
  href = "/",
  size = "md",
  className = "",
  showText = false,
  textClassName = "",
  imgClassName = "",
}: BrandMarkProps) => {
  const [failed, setFailed] = useState(false);
  const isFull = variant === "full";

  return (
    <Link
      to={href}
      className={`flex items-center gap-3 group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl ${className}`}
      aria-label="Ir para a página inicial"
    >
      {isFull ? (
        failed ? (
          <span className="text-lg font-black uppercase tracking-[0.32em] text-zinc-900">
            ARSENAL<span className="text-primary">FIT</span>
          </span>
        ) : (
          <img
            src="/images/logo-arsenalfit-full.png"
            alt="ArsenalFit"
            className={`${BRAND_FULL_SIZES[size]} w-auto max-w-[260px] object-contain ${imgClassName}`}
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <div className={`relative ${BRAND_ICON_SIZES[size]} rounded-2xl overflow-hidden bg-transparent`}>
          {failed ? (
            <div className="bg-primary text-black font-black rounded-2xl h-full w-full flex items-center justify-center text-xl">
              A
            </div>
          ) : (
            <img
              src="/images/logo-arsenalfit-icon.png"
              alt="ArsenalFit"
              className={`h-full w-full object-cover ${imgClassName}`}
              onError={() => setFailed(true)}
            />
          )}
        </div>
      )}
      {showText && (
        <span className={`text-[11px] font-black uppercase tracking-[0.28em] ${textClassName}`}>
          <span className="text-zinc-800">ARSENAL</span>
          <span className="text-primary">FIT</span>
        </span>
      )}
    </Link>
  );
};

export const Header = () => {
  const { cartCount } = useCart();
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (mobileOpen) {
      requestAnimationFrame(() => firstMobileLinkRef.current?.focus());
    } else {
      menuButtonRef.current?.focus();
    }
  }, [mobileOpen]);

  const headerHeight = isScrolled
    ? "h-[var(--header-height-scrolled)]"
    : "h-[var(--header-height)]";
  const brandSize = isScrolled ? "sm" : "md";
  const isCartActive = location.pathname.startsWith("/carrinho");
  const mobileGreeting = useMemo(() => {
    const firstName = getFirstName(user);
    return firstName ? `Olá, ${firstName}!` : "Olá!";
  }, [user]);

  const handleMobileLogout = async () => {
    await signOut();
    setMobileOpen(false);
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b border-white/5 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 transition-all duration-300 ${headerHeight} ${
        isScrolled ? "shadow-[var(--header-shadow)]" : ""
      }`}
    >
      <div className="container h-full flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <BrandMark
            variant="icon"
            size={brandSize}
            showText
            textClassName="hidden lg:block"
            imgClassName="scale-[1.12]"
          />
        </div>

        <nav
          className="hidden lg:flex items-center gap-8 text-[11px] font-black uppercase tracking-[0.24em]"
          aria-label="Navegação principal"
        >
          {NAV_ITEMS.map((item) => {
            const active = getIsActive(location.pathname, item.isActive);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2 px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full after:bg-primary after:transition-transform after:duration-300 ${
                  active
                    ? "text-primary after:scale-x-100"
                    : "text-zinc-500 hover:text-zinc-900 after:scale-x-0 hover:after:scale-x-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            to="/carrinho"
            className={`relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl ${
              isCartActive ? "text-primary" : ""
            }`}
            aria-label="Abrir carrinho"
            aria-current={isCartActive ? "page" : undefined}
          >
            <Button
              variant="ghost"
              size="icon"
              data-cart-icon
              className={`hover:bg-primary/10 hover:text-primary text-zinc-700 dark:text-zinc-300 transition-all rounded-xl ${
                isCartActive ? "text-primary bg-primary/10" : ""
              }`}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <Badge className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center bg-primary text-black font-black border-2 border-background shadow-lg shadow-primary/20">
                  {cartCount}
                </Badge>
              )}
            </Button>
          </Link>
          <div className="h-8 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1 hidden sm:block" />
          <div className="hidden lg:block">
            <UserMenu />
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200/70 bg-white text-zinc-700 shadow-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Abrir menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          />
          <div
            id="mobile-menu"
            className="absolute right-0 top-0 h-full w-[82%] max-w-[340px] bg-white shadow-2xl border-l border-zinc-200/60 flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/70">
              <span className="text-[11px] font-black uppercase tracking-[0.28em] text-zinc-400">
                Menu
              </span>
              <button
                type="button"
                className="h-9 w-9 rounded-lg border border-zinc-200/70 text-zinc-600 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="Fechar menu"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4 mx-auto" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-4" aria-label="Menu mobile">
              {NAV_ITEMS.map((item, index) => {
                const active = getIsActive(location.pathname, item.isActive);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    ref={index === 0 ? firstMobileLinkRef : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto border-t border-zinc-200/70 p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-zinc-400">
                Conta
              </p>
              {user ? (
                <>
                  <div className="text-xs font-semibold text-zinc-500 px-1">
                    {mobileGreeting}
                  </div>
                  <Link
                    to="/perfil"
                    className="flex items-center justify-between rounded-xl border border-zinc-200/70 px-4 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
                  >
                    Minha conta
                    {isAdmin && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary">
                        ADMIN
                      </span>
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={handleMobileLogout}
                    className="w-full rounded-xl border border-red-200/70 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    Sair
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="flex items-center justify-center rounded-xl bg-primary text-black font-black uppercase tracking-[0.18em] py-3"
                >
                  Entrar
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
