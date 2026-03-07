import { Toaster } from "@/Components/ui/toaster";
import { Toaster as Sonner } from "@/Components/ui/sonner";
import { TooltipProvider } from "@/Components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
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
import ProductDetail from "@/Pages/ProductDetails";
import CategoryPage from "@/Pages/Category";
import FitnessCategorySEO from "@/Pages/FitnessCategorySEO";
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
import Terms from "@/Pages/Terms";
import Privacy from "@/Pages/Privacy";
import Affiliates from "@/Pages/Affiliates";
import Verify from "@/Pages/Verify";
import ResetPassword from "@/Pages/ResetPassword";
import OutProduct from "@/Pages/OutProduct";
import ComoMonitorar from "@/Pages/ComoMonitorar";
import { AdminRoute } from "@/Components/auth/AdminRoute";

const AdminDashboard = lazy(() => import("@/admin/dashboard/AdminDashboard"));
const SeoPages = lazy(() => import("@/admin/seo/SeoPages"));
const SeoClusters = lazy(() => import("@/admin/seo/SeoClusters"));
const SeoHealth = lazy(() => import("@/admin/seo/SeoHealth"));
const ProductsTable = lazy(() => import("@/admin/products/ProductsTable"));
const LegacyProductsConsole = lazy(() => import("@/admin/products/LegacyProductsConsole"));
const ProductsQueue = lazy(() => import("@/admin/products/ProductsQueue"));
const ImportProducts = lazy(() => import("@/admin/products/ImportProducts"));
const TrendProducts = lazy(() => import("@/admin/discovery/TrendProducts"));
const ViralProducts = lazy(() => import("@/admin/discovery/ViralProducts"));
const DiscoveryQueue = lazy(() => import("@/admin/discovery/DiscoveryQueue"));
const PriceSync = lazy(() => import("@/admin/pricing/PriceSync"));
const AdminPriceAdjustments = lazy(() => import("@/admin/pricing/PriceAdjustments"));
const AiSystemDashboard = lazy(() => import("@/admin/ai/AiSystemDashboard"));
const SystemExplorer = lazy(() => import("@/admin/system/SystemExplorer"));
const PipelineHealth = lazy(() => import("@/admin/system/PipelineHealth"));
const OperationalReliability = lazy(() => import("@/admin/system/OperationalReliability"));
const AdminOperatingOS = lazy(() => import("@/admin/operations/AdminOperatingOS"));
const AdminShell = lazy(() => import("@/admin/layout/AdminShell"));
const SeoLandingPage = lazy(() => import("@/Pages/SeoLandingPage"));

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
    <RouteErrorBoundary>
      <Header />
      <Suspense fallback={<div className="container-tight py-10 text-sm text-zinc-500">Carregando pagina...</div>}>
      <Routes>
        <Route
          path="/"
          element={
            <RouteErrorBoundary>
              <HomeV2 />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/home"
          element={
            <RouteErrorBoundary>
              <HomeV2 />
            </RouteErrorBoundary>
          }
        />
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/confirm" element={<AuthConfirmed />} />
        <Route path="/auth/sent" element={<AuthSent />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/register" element={<Register />} />
        <Route path="/update-password" element={<UpdatePassword />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminShell />
            </AdminRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="ops" element={<AdminOperatingOS />} />
          <Route path="seo-pages" element={<SeoPages />} />
          <Route path="seo-clusters" element={<SeoClusters />} />
          <Route path="seo-health" element={<SeoHealth />} />
          <Route path="products" element={<ProductsTable />} />
          <Route path="products-legacy" element={<LegacyProductsConsole />} />
          <Route path="products-queue" element={<ProductsQueue />} />
          <Route path="import-products" element={<ImportProducts />} />
          <Route path="product-import" element={<Navigate to="/admin/import-products" replace />} />
          <Route path="trend-products" element={<TrendProducts />} />
          <Route path="viral-products" element={<ViralProducts />} />
          <Route path="discovery" element={<DiscoveryQueue />} />
          <Route path="price-sync" element={<PriceSync />} />
          <Route path="price-adjustments" element={<AdminPriceAdjustments />} />
          <Route path="ai-system" element={<AiSystemDashboard />} />
          <Route path="system-explorer" element={<SystemExplorer />} />
          <Route path="pipeline-health" element={<PipelineHealth />} />
          <Route path="operational-reliability" element={<OperationalReliability />} />
          <Route path="control-center" element={<Navigate to="/admin" replace />} />
        </Route>
        <Route
          path="/produto/:slug"
          element={
            <RouteErrorBoundary>
              <ProductDetail />
            </RouteErrorBoundary>
          }
        />
        <Route path="/categoria/:slug" element={<CategoryPage />} />
        <Route path="/fitness/:slug" element={<FitnessCategorySEO />} />
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
        <Route path="/seo/:category/:keyword" element={<SeoLandingPage />} />
        <Route path="/seo/:slug" element={<SeoLandingPage />} />
        <Route path="/seo/*" element={<SeoLandingPage />} />
        <Route path="/carrinho" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/favoritos" element={<Favorites />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      <SiteFooter />
    </RouteErrorBoundary>
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
