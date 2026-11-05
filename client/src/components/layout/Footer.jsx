import Icon from '../ui/Icon';
import Link from '../ui/Link';
import Logo from '../ui/Logo';
import { getWhatsAppLink, WHATSAPP_MESSAGE } from '../../lib/whatsapp';
import './Footer.css';

const CATALOG_LINKS = [
  { to: '/katalog', label: 'All Builds' },
  { to: '/katalog', label: 'Café racer / Thunder' },
  { to: '/katalog', label: 'Chopper / Scorpio' },
  { to: '/katalog', label: 'British style / Tiger' },
];

const ABOUT_LINKS = [
  { to: '/#tentang', label: 'About Ruka' },
  { to: '/#process', label: 'Custom Process' },
  { to: '/#faq', label: 'Frequently Asked Questions' },
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
              An independent custom motorcycle workshop. Honest form, personal
              character.
            </p>
            <p className="rm-footer__meta">Bandung / Indonesia</p>
          </div>

          <nav aria-labelledby="rm-footer-katalog" className="rm-footer__column">
            <h2 className="rm-footer__title" id="rm-footer-katalog">
              Explore the Catalog
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
              About the Workshop
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
            <h2 className="rm-footer__title">Contact</h2>
            <ul className="rm-footer__list">
              <li>Bandung, West Java</li>
              <li>Visits by appointment</li>
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
              Old machines. New perspectives.
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
