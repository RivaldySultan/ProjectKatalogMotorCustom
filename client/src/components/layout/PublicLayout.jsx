import Footer from './Footer';
import Navbar from './Navbar';
import './PublicLayout.css';

export default function PublicLayout({ children }) {
  return (
    <div className="rm-site">
      <a className="rm-skip-link" href="#main-content">
        Lewati ke konten utama
      </a>
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
