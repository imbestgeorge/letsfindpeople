import { Link } from 'react-router-dom';
import logo from "../assets/logo.png";

import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      {/* Logo */}
      <img
        src={logo}
        alt="Logo"
        style={{ height: '100px', display: 'block', margin: '0 auto 20px' }}
      />

      {/* Policy Links */}
      <div>
        <Link to="/privacy" style={{ color: 'white', margin: '0 10px' }}>
          Privacy Policy
        </Link>
        <Link to="/terms" style={{ color: 'white', margin: '0 10px' }}>
          Terms & Conditions
        </Link>
        <Link to="/cookies" style={{ color: 'white', margin: '0 10px' }}>
          Cookies
        </Link>
        <Link to="/refunds" style={{ color: 'white', margin: '0 10px' }}>
          Refunds
        </Link>
        <Link to="/contact" style={{ color: 'white', margin: '0 10px' }}>
          Contact
        </Link>
      </div>
    </footer>
  );
}
