import Icon from '../ui/Icon';
import Link from '../ui/Link';
import Logo from '../ui/Logo';
import { getWhatsAppLink, WHATSAPP_MESSAGE } from '../../lib/whatsapp';
import './Footer.css';

const CATALOG_LINKS = [
  { to: '/katalog', label: 'Semua build' },
  { to: '/katalog', label: 'Café racer / Thunder' },
  { to: '/katalog', label: 'Chopper / Scorpio' },
  { to: '/katalog', label: 'British style / Tiger' },
];

const ABOUT_LINKS = [
  { to: '/#tentang', label: 'Tentang Ruka' },
  { to: '/#process', label: 'Proses custom' },
  { to: '/#faq', label: 'Pertanyaan umum' },
];

const CURRENT_YEAR = new Date().getFullYear();

export default function Footer({ year = CURRENT_YEAR }) {
  return (
    <footer className="rm-footer" id="site-footer">
      <div className="rm-footer__inner">
        <div className="rm-footer__top">
          <div className="rm-footer__identity">
            <Logo />
            <p className="rm-footer__description">
              Bengkel motor custom independen. Bentuk yang jujur, karakter yang
              personal.
            </p>
            <p className="rm-footer__meta">Bandung / Indonesia</p>
          </div>

          <nav aria-labelledby="rm-footer-katalog" className="rm-footer__column">
            <h2 className="rm-footer__title" id="rm-footer-katalog">
              Jelajahi katalog
            </h2>
            <ul className="rm-footer__list">
              {CATALOG_LINKS.map((link) => (
                <li key={link.label}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="rm-footer-tentang" className="rm-footer__column">
            <h2 className="rm-footer__title" id="rm-footer-tentang">
              Tentang bengkel
            </h2>
            <ul className="rm-footer__list">
              {ABOUT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="rm-footer__column">
            <h2 className="rm-footer__title">Kontak</h2>
            <ul className="rm-footer__list">
              <li>Bandung, Jawa Barat</li>
              <li>Kunjungan dengan janji temu</li>
              <li>
                <a
                  href={getWhatsAppLink(WHATSAPP_MESSAGE)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  WhatsApp
                  <Icon name="arrow-up-right" size={14} />
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="rm-footer__bottom">
          <p className="rm-footer__wordmark">RUKA MOTORWORKS</p>
          <div className="rm-footer__closing">
            <p className="rm-footer__slogan">
              Mesin lama. Sudut pandang baru.
            </p>
            <p className="rm-footer__copyright">
              © {year} RUKA Motorworks
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
