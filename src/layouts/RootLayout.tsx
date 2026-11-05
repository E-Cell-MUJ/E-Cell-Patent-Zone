import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { 
  LogOut, 
  Shield, 
  User, 
  BookOpen, 
  Sparkles, 
  ExternalLink,
  ChevronRight,
  PlusCircle,
  FolderKanban,
  ArrowUp,
  Instagram,
  Linkedin
} from 'lucide-react';
import { INSTITUTION, COORDINATOR } from '../config/constants';
import { GuidelinesModal } from '../components/GuidelinesModal';
import ecellLogo from '../assets/ecell-logo.png';

export const RootLayout: React.FC = () => {
  const { currentUser, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);



  useEffect(() => {
    const checkScroll = () => {
      if (window.scrollY > 200) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener('scroll', checkScroll);
    return () => window.removeEventListener('scroll', checkScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="app-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#FAF7EE' }}>
      {/* Top Institutional Notification Bar (Warm Cream Editorial) */}
      <div
        style={{
          backgroundColor: '#F4EFE0',
          color: '#354F77',
          fontSize: '0.78125rem',
          padding: '8px 0',
          borderBottom: '1px solid #EBE5D5',
          letterSpacing: '0.01em',
        }}
      >
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: '#204E96',
                color: '#ffffff',
                padding: '2px 10px',
                borderRadius: '6px',
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <Sparkles size={11} />
              E-CELL MUJ INNOVATION ZONE
            </span>
            <span style={{ color: '#152E5A', fontWeight: 600 }}>
              {INSTITUTION.NAME} • {INSTITUTION.DEPARTMENTS.IPR_CELL}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              onClick={() => setIsGuidelinesOpen(true)}
              style={{
                background: 'transparent',
                color: '#204E96',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 6px',
                borderRadius: '4px',
                transition: 'all 0.15s ease',
              }}
              className="hover:underline"
            >
              <BookOpen size={13} />
              <span>IPR &amp; Patent Filing Rules</span>
            </button>

            {currentUser ? (
              <span style={{ color: '#354F77', fontSize: '0.75rem' }}>
                Signed in: <strong style={{ color: '#152E5A' }}>{currentUser.full_name}</strong>
              </span>
            ) : (
              <Link
                to="/login"
                style={{
                  color: '#204E96',
                  fontSize: '0.75rem',
                  textDecoration: 'none',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                Sign In <ChevronRight size={12} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Official Header (Light Warm Cream Theme matching Reference) */}
      <header
        className="site-header"
        style={{
          backgroundColor: '#FAF7EE',
          borderBottom: '1px solid #EBE5D5',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 12px rgba(21, 46, 90, 0.04)',
        }}
      >
        <div className="container">
          <div className="header-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
            {/* Brand Logo & Title */}
            <Link
              to="/"
              className="brand-wrapper"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}
            >
              <img
                src={ecellLogo}
                alt="E-CELL MUJ"
                style={{
                  width: '42px',
                  height: '42px',
                  objectFit: 'contain',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 2px 8px rgba(21, 46, 90, 0.08)',
                }}
              />
              <div className="brand-text-block">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 800,
                      fontSize: '1.2rem',
                      color: '#152E5A',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    E-CELL MUJ
                  </span>
                  <span
                    style={{
                      backgroundColor: '#E8EEF6',
                      color: '#204E96',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Patent Portal
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6385B2', lineHeight: 1.2, marginTop: '2px', fontWeight: 500 }}>
                  Directorate of Research &amp; IPR Cell • Manipal University Jaipur
                </div>
              </div>
            </Link>

            {/* Navigation Bar (Role-Aware, Editorial Pill Actions) */}
            <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Student Navigation */}
              {currentUser?.role === 'student' && (
                <>
                  <Link
                    to="/dashboard"
                    className={`nav-item ${location.pathname === '/dashboard' ? 'active' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      color: location.pathname === '/dashboard' ? '#204E96' : '#152E5A',
                      backgroundColor: location.pathname === '/dashboard' ? '#E8EEF6' : 'transparent',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <FolderKanban size={15} />
                    My Disclosures
                  </Link>
                  <Link
                    to="/applications/new"
                    className="btn btn-primary"
                    style={{ fontSize: '0.8125rem', padding: '0.5em 1.6em' }}
                  >
                    <span />
                    <PlusCircle size={15} />
                    New Patent Disclosure
                  </Link>
                </>
              )}

              {/* Coordinator Admin Navigation */}
              {currentUser?.role === 'admin' && (
                <Link
                  to="/admin/dashboard"
                  className="btn btn-primary"
                  style={{ fontSize: '0.8125rem', padding: '0.5em 1.6em' }}
                >
                  <span />
                  <Shield size={15} />
                  Patent Review Desk
                </Link>
              )}

              {/* Super Admin Navigation */}
              {currentUser?.role === 'super_admin' && (
                <Link
                  to="/superadmin/dashboard"
                  className={`nav-item ${location.pathname.startsWith('/superadmin') ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 18px',
                    borderRadius: '6px',
                    color: '#ffffff',
                    backgroundColor: '#204E96',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    boxShadow: '0 2px 8px rgba(32, 78, 150, 0.25)',
                  }}
                >
                  <Shield size={15} />
                  Super Admin Governance
                </Link>
              )}

              {/* User Profile Pill / Sign Out or Sign In */}
              {currentUser ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '6px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 12px',
                      backgroundColor: '#FFFFFF',
                      borderRadius: '6px',
                      border: '1px solid #EBE5D5',
                      boxShadow: '0 1px 4px rgba(21, 46, 90, 0.05)',
                    }}
                  >
                    {currentUser.role === 'super_admin' ? (
                      <Shield size={15} color="#204E96" />
                    ) : currentUser.role === 'admin' ? (
                      <Shield size={15} color="#204E96" />
                    ) : (
                      <User size={15} color="#204E96" />
                    )}
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 700, color: '#152E5A', fontSize: '0.8125rem', lineHeight: 1.2 }}>
                        {currentUser.full_name}
                      </div>
                      <div
                        style={{
                          fontSize: '0.6875rem',
                          color: '#6385B2',
                          fontWeight: 600,
                        }}
                      >
                        {currentUser.role === 'super_admin'
                          ? 'Super Admin'
                          : currentUser.role === 'admin'
                          ? 'Patent Coordinator'
                          : 'Student Applicant'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="btn btn-outline btn-sm"
                    style={{
                      color: '#B91C1C',
                      borderColor: '#FECACA',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '0.78125rem',
                      padding: '6px 14px',
                    }}
                    title="Sign Out of Portal"
                  >
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Link
                    to="/login"
                    className="btn btn-primary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '9px 24px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      backgroundColor: '#204E96',
                      color: '#ffffff',
                    }}
                  >
                    <User size={14} />
                    Portal Sign In
                  </Link>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Application Content */}
      <main className="main-content" style={{ flex: '1 0 auto', paddingBottom: '48px', backgroundColor: '#FAF7EE' }}>
        <Outlet />
      </main>

      {/* Statutory Guidelines Modal */}
      <GuidelinesModal
        isOpen={isGuidelinesOpen}
        onClose={() => setIsGuidelinesOpen(false)}
      />

      {/* Full Royal Blue Institutional Footer (Matching Photo Design with Rounded Top Corners) */}
      <footer
        className="site-footer"
        style={{
          backgroundColor: '#FAF7EE',
          padding: '0 20px 28px',
          marginTop: 'auto',
        }}
      >
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            borderRadius: '40px',
            background: 'radial-gradient(ellipse at 15% 20%, rgba(68, 138, 240, 0.35), transparent 55%), linear-gradient(145deg, #183F7E 0%, #204E96 50%, #153466 100%)',
            boxShadow: '0 16px 48px rgba(21, 46, 90, 0.16)',
            padding: '52px 48px 36px',
            color: '#FFFFFF',
            position: 'relative',
          }}
        >
          {/* 4 Institutional Columns (All Content from Image 1 Kept Exactly Same) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '36px',
              paddingBottom: '36px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.14)',
            }}
          >
            {/* Col 1: Brand & University Identity */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <img
                  src={ecellLogo}
                  alt="E-CELL MUJ"
                  style={{
                    width: '34px',
                    height: '34px',
                    objectFit: 'contain',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    padding: '2px',
                  }}
                />
                <span style={{ fontWeight: 800, color: '#FFFFFF', fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                  E-CELL MUJ • Patent &amp; IPR Cell
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#CBDDF2', lineHeight: 1.65 }}>
                Engineered &amp; deployed by the <strong style={{ color: '#FFFFFF' }}>Entrepreneurship Cell (E-Cell MUJ)</strong> in partnership with the <strong style={{ color: '#FFFFFF' }}>Directorate of Research &amp; IPR Cell</strong>.
              </p>
              <div style={{ marginTop: '12px', fontSize: '0.8125rem', color: '#BACCE3', lineHeight: 1.5 }}>
                Manipal University Jaipur, Dehmi Kalan, Jaipur-Ajmer Expressway, Rajasthan 303007
              </div>
            </div>

            {/* Col 2: Navigation Links */}
            <div>
              <h4 style={{ color: '#FFFFFF', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 14px' }}>
                Navigation
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.875rem', color: '#CBDDF2', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <li>
                  <Link to="/" style={{ color: '#CBDDF2', textDecoration: 'none', transition: 'color 0.15s ease' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')} onMouseLeave={(e) => (e.currentTarget.style.color = '#CBDDF2')}>
                    Home / Workspace
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setIsGuidelinesOpen(true)}
                    style={{ background: 'none', border: 'none', padding: 0, color: '#CBDDF2', cursor: 'pointer', textAlign: 'left', fontSize: '0.875rem', transition: 'color 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#CBDDF2')}
                  >
                    Statutory Filing Guidelines
                  </button>
                </li>
                <li>
                  <a
                    href="https://ipindia.gov.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#CBDDF2', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#CBDDF2')}
                  >
                    Indian Patent Office (CGPDTM) <ExternalLink size={12} />
                  </a>
                </li>
                <li>
                  <a
                    href={INSTITUTION.WEBSITE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#CBDDF2', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#CBDDF2')}
                  >
                    Manipal University Jaipur <ExternalLink size={12} />
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Contact & Desk */}
            <div>
              <h4 style={{ color: '#FFFFFF', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 14px' }}>
                Contact
              </h4>
              <div style={{ fontSize: '0.875rem', color: '#CBDDF2', lineHeight: 1.65 }}>
                <div>
                  <strong style={{ color: '#FFFFFF' }}>Patent Review Cell</strong>
                </div>
                <div>
                  Directorate of Research &amp; Innovation
                </div>
                <div style={{ marginTop: '6px' }}>
                  Email:{' '}
                  <a href={`mailto:${COORDINATOR.EMAIL}`} style={{ color: '#FFFFFF', textDecoration: 'underline', fontWeight: 600 }}>
                    {COORDINATOR.EMAIL}
                  </a>
                </div>
                <div style={{ marginTop: '4px' }}>
                  Support:{' '}
                  <a href={`mailto:${INSTITUTION.CONTACT_EMAIL}`} style={{ color: '#FFFFFF', textDecoration: 'underline', fontWeight: 600 }}>
                    {INSTITUTION.CONTACT_EMAIL}
                  </a>
                </div>
              </div>
            </div>

            {/* Col 4: Follow Us & Institutional Standards */}
            <div>
              <h4 style={{ color: '#FFFFFF', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 14px' }}>
                Follow Us
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '6px',
                    backgroundColor: '#FFFFFF',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#204E96',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  }}
                  title="Instagram"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '6px',
                    backgroundColor: '#FFFFFF',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#204E96',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  }}
                  title="LinkedIn"
                >
                  <Linkedin size={18} />
                </a>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#BACCE3', lineHeight: 1.5 }}>
                Compliant with Indian Patents Act 1970 • First-to-File Protocol
              </div>
            </div>
          </div>

          {/* Bottom Copyright */}
          <div
            style={{
              paddingTop: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              fontSize: '0.8125rem',
              color: '#BACCE3',
            }}
          >
            <div>
              &copy; {new Date().getFullYear()} Manipal University Jaipur. Developed by <strong style={{ color: '#FFFFFF' }}>E-Cell MUJ</strong>.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span>Version 2.4-Production</span>
              <span>•</span>
              <span>Confidential IPR Repository</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Scroll-to-Top Button (Matches Reference Images 1, 3, 4) */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fab-scroll-top"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <ArrowUp size={20} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};

export default RootLayout;
