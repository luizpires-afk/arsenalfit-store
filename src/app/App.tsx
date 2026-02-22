import { Toaster } from "@/Components/ui/toaster";
import { Toaster as Sonner } from "@/Components/ui/sonner";
import { TooltipProvider } from "@/Components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ScrollToTop from "@/Components/ScrollToTop";
import { Header } from "@/Components/Header";
import { MonitorInfoDialog } from "@/Components/monitoring/MonitorInfoDialog";
import { SiteFooter } from "@/Components/SiteFooter";
import { RouteErrorBoundary } from "@/Components/RouteErrorBoundary";

// Pages
import HomeV2 from "@/Pages/HomeV2";
import Login from "@/Pages/Login";
import Cadastro from "@/Pages/Cadastro";
import Admin from "@/Pages/Admin";
import ProductDetail from "@/Pages/ProductDetails";
import CategoryPage from "@/Pages/Category";
import Categories from "@/Pages/Categories";
import Products from "@/Pages/Products";
import ArsenalCollection from "@/Pages/ArsenalCollection";
import Profile from "@/Pages/Profile";
import Auth from "@/Pages/Auth";
import Cart from "@/Pages/Cart";
import Checkout from "@/Pages/Checkout";
import Favorites from "@/Pages/Favorites";
import Compare from "@/Pages/Compare";
import Register from "@/Pages/Register";
import UpdatePassword from "@/Pages/UpdatePassword";
import MelhoresOfertas from "@/Pages/MelhoresOfertas";
import AuthSent from "@/Pages/AuthSent";
import AuthConfirmed from "@/Pages/AuthConfirmed";
import NotFound from "@/Pages/NotFound";
import PriceAdjustments from "@/Pages/PriceAdjustments";
import PriceSyncReport from "@/Pages/PriceSyncReport";
import Terms from "@/Pages/Terms";
import Privacy from "@/Pages/Privacy";
import Affiliates from "@/Pages/Affiliates";
import Verify from "@/Pages/Verify";
import ResetPassword from "@/Pages/ResetPassword";
import OutProduct from "@/Pages/OutProduct";
import ComoMonitorar from "@/Pages/ComoMonitorar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

const AppRoutes = () => {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<HomeV2 />} />
        <Route path="/home" element={<HomeV2 />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/confirm" element={<AuthConfirmed />} />
        <Route path="/auth/sent" element={<AuthSent />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/register" element={<Register />} />
        <Route path="/update-password" element={<UpdatePassword />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/price-adjustments" element={<PriceAdjustments />} />
        <Route path="/admin/price-sync" element={<PriceSyncReport />} />
        <Route
          path="/produto/:slug"
          element={
            <RouteErrorBoundary>
              <ProductDetail />
            </RouteErrorBoundary>
          }
        />
        <Route path="/categoria/:slug" element={<CategoryPage />} />
        <Route path="/categorias" element={<Categories />} />
        <Route path="/arsenal/:collection" element={<ArsenalCollection />} />
        <Route path="/produtos" element={<Products />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/termos" element={<Terms />} />
        <Route path="/privacidade" element={<Privacy />} />
        <Route path="/afiliados" element={<Affiliates />} />
        <Route path="/verificar" element={<Verify />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/como-monitorar" element={<ComoMonitorar />} />
        <Route path="/out/product/:id" element={<OutProduct />} />
        <Route path="/ofertas" element={<Navigate to="/" replace />} />
        <Route path="/melhores-ofertas" element={<MelhoresOfertas />} />
        <Route path="/carrinho" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/favoritos" element={<Favorites />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <SiteFooter />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <MonitorInfoDialog />
        <BrowserRouter>
          <ScrollToTop />
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
