import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import { usePageTitle } from '../lib/usePageTitle';
import './NotFoundPage.css';

export default function NotFoundPage() {
  usePageTitle('Halaman tidak ditemukan — RUKA Motorworks');

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="rm-container rm-not-found">
        <p className="rm-meta">404 / Halaman tidak ditemukan</p>
        <p aria-hidden="true" className="rm-not-found__code">404</p>
        <h1 className="rm-h1">Jalan ini belum ada di peta.</h1>
        <p className="rm-not-found__copy">
          Kembali ke beranda atau lihat katalog build yang tersedia.
        </p>
        <div className="rm-not-found__actions">
          <Button to="/" variant="primary" icon={<Icon name="arrow-up-right" size={18} />}>
            Kembali ke beranda
          </Button>
          <Button to="/katalog" variant="outline">
            Lihat katalog
          </Button>
        </div>
      </div>
    </main>
  );
}
