import Link from './Link';
import './Logo.css';

export default function Logo({ href = '/', tone = 'light', className = '', onClick }) {
  return (
    <Link
      aria-label="RUKA Motorworks, back to home"
      className={`rm-logo rm-logo--${tone}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      to={href}
    >
      <span aria-hidden="true" className="rm-logo__emblem">
        <span />
        <span />
      </span>
      <span className="rm-logo__name">
        <span className="rm-logo__brand">RUKA</span>
        <span className="rm-logo__descriptor">MOTORWORKS</span>
      </span>
    </Link>
  );
}
