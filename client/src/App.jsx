import PublicLayout from './components/layout/PublicLayout';
import { useProducts } from './lib/useProducts';
import { useRoute, useRouteScroll } from './lib/router';
import CatalogPage from './pages/CatalogPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminOrdersPage from './pages/AdminOrdersPage';
import AdminCatalogPage from './pages/AdminCatalogPage';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import ProductDetailPage from './pages/ProductDetailPage';
import AdminLoginPage from './components/admin/AdminLoginPage';
import CheckoutPage from './pages/CheckoutPage';
import AdminPurchasesPage from './pages/AdminPurchasesPage';
import CustomerPurchasePage from './pages/CustomerPurchasePage';
import CustomerAuthPage from './pages/CustomerAuthPage';
import CustomerAccountPage from './pages/CustomerAccountPage';
import './App.css';

function PublicPages({ route }) {
  const { products, isLoading, error } = useProducts();

  let page;

  if (route.name === 'catalog') {
    page = <CatalogPage error={error} isLoading={isLoading} products={products} />;
  } else if (route.name === 'detail') {
    page = (
      <ProductDetailPage
        error={error}
        isLoading={isLoading}
        productId={route.id}
        products={products}
      />
    );
  } else if (route.name === 'home') {
    page = <HomePage error={error} isLoading={isLoading} products={products} />;
  } else if (route.name === 'checkout') {
    page = <CheckoutPage key={route.id} productId={route.id} products={products} isLoading={isLoading} />;
  } else {
    page = <NotFoundPage />;
  }

  return <PublicLayout>{page}</PublicLayout>;
}

function App() {
  const route = useRoute();

  useRouteScroll(route.location);

  if (route.name === 'admin') {
    return <AdminDashboardPage />;
  }

  if (route.name === 'admin-catalog') {
    return <AdminCatalogPage route={route} />;
  }

  if (route.name === 'admin-orders') {
    return <AdminOrdersPage route={route} />;
  }

  if (route.name === 'admin-purchases') {
    return <AdminPurchasesPage route={route} />;
  }

  if (route.name === 'admin-login') {
    return <AdminLoginPage sessionExpired={route.hash === '#session-expired'} />;
  }

  if (route.name === 'customer-purchase') {
    return (
      <PublicLayout>
        <CustomerPurchasePage orderId={route.id} accessToken={route.hash.slice(1)} />
      </PublicLayout>
    );
  }

  if (route.name === 'customer-auth') {
    return <PublicLayout><CustomerAuthPage mode={route.mode} /></PublicLayout>;
  }

  if (route.name === 'customer-account') {
    return <PublicLayout><CustomerAccountPage route={route} /></PublicLayout>;
  }

  return <PublicPages route={route} />;
}

export default App;
