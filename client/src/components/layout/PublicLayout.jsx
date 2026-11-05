import Footer from './Footer';
import Navbar from './Navbar';
import './PublicLayout.css';

export default function PublicLayout({ children }) {
  return (
    <div className="rm-site">
      <a className="rm-skip-link" href="#main-content">
        Skip to main content
      </a>
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
