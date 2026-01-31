import { Toaster } from "@/Components/ui/toaster";
import { Toaster as Sonner } from "@/Components/ui/sonner";
import { TooltipProvider } from "@/Components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";

// Pages
import Home from "@/Pages/Home";
import Login from "@/Pages/Login";
import Cadastro from "@/Pages/Cadastro";
import Admin from "@/Pages/Admin";
import ProductDetail from "@/Pages/ProductDetails";
import CategoryPage from "@/Pages/Category";
import Products from "@/Pages/Products";
import Profile from "@/Pages/Profile";
import Auth from "@/Pages/Auth";
import Offers from "@/Pages/Offers";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Home />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/confirm" element={<AuthConfirmed />} />
            <Route path="/auth/sent" element={<AuthSent />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/register" element={<Register />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/price-adjustments" element={<PriceAdjustments />} />
            <Route path="/produto/:slug" element={<ProductDetail />} />
            <Route path="/categoria/:slug" element={<CategoryPage />} />
            <Route path="/categorias" element={<CategoryPage />} />
            <Route path="/produtos" element={<Products />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/ofertas" element={<Offers />} />
            <Route path="/melhores-ofertas" element={<MelhoresOfertas />} />
            <Route path="/carrinho" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/favoritos" element={<Favorites />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
