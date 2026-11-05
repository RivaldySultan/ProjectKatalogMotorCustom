import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import { usePageTitle } from '../lib/usePageTitle';
import './NotFoundPage.css';

export default function NotFoundPage() {
  usePageTitle('Page Not Found — RUKA Motorworks');

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="rm-container rm-not-found">
        <p className="rm-meta">404 / Page Not Found</p>
        <p aria-hidden="true" className="rm-not-found__code">404</p>
        <h1 className="rm-h1">This road is not on the map yet.</h1>
        <p className="rm-not-found__copy">
          Return home or browse the available builds in our catalog.
        </p>
        <div className="rm-not-found__actions">
          <Button to="/" variant="primary" icon={<Icon name="arrow-up-right" size={18} />}>
            Back to Home
          </Button>
          <Button to="/katalog" variant="outline">
            View Catalog
          </Button>
        </div>
      </div>
    </main>
  );
}
