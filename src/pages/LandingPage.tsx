import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import {
  ShieldCheck,
  FileText,
  ArrowRight,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { INSTITUTION, COORDINATOR } from '../config/constants';
import { fetchApplicationById } from '../lib/api';
import { GuidelinesModal } from '../components/GuidelinesModal';

export const LandingPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [refSearch, setRefSearch] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);

  const handleTrackApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refSearch.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      // If user is not logged in, prompt sign-in
      if (!currentUser) {
        navigate('/auth/login', { state: { trackingRef: refSearch.trim() } });
        return;
      }

      // Try locating by reference number or ID
      const app = await fetchApplicationById(refSearch.trim(), currentUser);
      if (app) {
        navigate(`/applications/${app.id}`);
      } else {
        setSearchError('Application not found or access restricted to authorized inventors.');
      }
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Unable to retrieve application status.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="container" style={{ paddingBlock: '24px 60px' }}>
      {/* Institutional Pre-Screening Notice */}
      <div className="alert alert-info" style={{ marginBottom: '28px', backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}>
        <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px', color: '#0284c7' }} />
        <div style={{ fontSize: '0.8125rem', color: '#0369a1', lineHeight: 1.5 }}>
          <strong>Official Institutional Screening Notice:</strong> This portal facilitates internal university pre-screening and coordinator novelty review by the {INSTITUTION.DEPARTMENTS.IPR_CELL}. Directorate approval qualifies approved inventions for sponsored statutory filing and drafting before the Indian Patent Office (IPO).
        </div>
      </div>

      {/* Hero Section */}
      <div
        className="card"
        style={{
          padding: '48px 40px',
          marginBottom: '36px',
          boxShadow: '0 4px 24px rgba(10, 25, 47, 0.05)',
          border: '1px solid var(--border-light)',
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        }}
      >
        <div style={{ maxWidth: '820px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              backgroundColor: '#e0f2fe',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#0369a1',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <ShieldCheck size={14} />
            {INSTITUTION.NAME} &bull; {INSTITUTION.DEPARTMENTS.IPR_CELL}
          </div>

          <h1
            style={{
              fontSize: '2.125rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              color: 'var(--text-primary)',
              margin: '0 0 16px',
            }}
          >
            Patent Application &amp; Invention Disclosure Portal
          </h1>

          <p
            style={{
              fontSize: '1.0625rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              margin: '0 0 28px',
            }}
          >
            A centralized digital gateway for {INSTITUTION.SHORT_NAME} students and faculty to submit intellectual property disclosures, track examination milestones, and resolve itemized review comments with Patent Coordinator <strong>{COORDINATOR.FULL_NAME}</strong>.
          </p>

          {/* Primary CTA Buttons */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            {currentUser ? (
              currentUser.role === 'super_admin' ? (
                <Link to="/superadmin/dashboard" className="btn btn-primary btn-lg" style={{ padding: '12px 24px', backgroundColor: '#7e22ce', borderColor: '#7e22ce' }}>
                  <ShieldCheck size={18} />
                  Open Portal Supervision Console
                  <ArrowRight size={16} />
                </Link>
              ) : currentUser.role === 'admin' ? (
                <Link to="/admin/dashboard" className="btn btn-primary btn-lg" style={{ padding: '12px 24px' }}>
                  <ShieldCheck size={18} />
                  Open Coordinator Screening Registry
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <>
                  <Link to="/workspace" className="btn btn-primary btn-lg" style={{ padding: '12px 24px' }}>
                    <FileText size={18} />
                    Open Patent Workspace
                    <ArrowRight size={16} />
                  </Link>
                  <Link to="/dashboard" className="btn btn-outline btn-lg" style={{ padding: '12px 20px' }}>
                    View My Applications ({currentUser.full_name})
                  </Link>
                </>
              )
            ) : (
              <>
                <Link to="/auth/login" className="btn btn-primary btn-lg">
                  <span />
                  Sign In with University ID
                  <ArrowRight size={16} />
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setIsGuidelinesOpen(true)}
              className="btn btn-outline btn-lg"
              style={{ padding: '12px 18px', color: '#64748b' }}
            >
              <BookOpen size={16} />
              IPR Guidelines
            </button>
          </div>
        </div>
      </div>

      {/* 4-Stage University Patenting Workflow */}
      <div style={{ marginBottom: '44px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Statutory Examination &amp; Disclosure Workflow
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Eliminating fragmented email chains with transparent, version-controlled patent drafting:
          </p>
        </div>

        <div className="grid-2" style={{ gap: '24px' }}>
          <div className="editorial-card">
            <div className="card-dot-indicator">
              <span /><span /><span /><span />
            </div>
            <h3 className="editorial-card-title">1. Structured Technical Disclosure</h3>
            <p className="editorial-card-desc">
              Submit comprehensive disclosures including technical domain, problem statement, working mechanism, novel inventive step, and inventor percentage shares with automated 100% share balance validation.
            </p>
          </div>

          <div className="editorial-card">
            <div className="card-dot-indicator pattern-2">
              <span /><span /><span /><span />
            </div>
            <h3 className="editorial-card-title">2. Novelty Screening (Patent Coordinator)</h3>
            <p className="editorial-card-desc">
              Preliminary novelty screening under Section 2(1)(j) and Section 3 of the Indian Patents Act 1970. The coordinator assesses patentability, prior-art differentiation, and institutional eligibility.
            </p>
          </div>

          <div className="editorial-card">
            <div className="card-dot-indicator">
              <span /><span /><span /><span />
            </div>
            <h3 className="editorial-card-title">3. Itemized Correction &amp; Version N+1</h3>
            <p className="editorial-card-desc">
              If claims or drawings require refinement, the coordinator issues itemized remarks. Applicants resolve remarks in a split-screen workspace, preserving complete audit trails across revisions.
            </p>
          </div>

          <div className="editorial-card">
            <div className="card-dot-indicator pattern-2">
              <span /><span /><span /><span />
            </div>
            <h3 className="editorial-card-title">4. Directorate Approval &amp; Filing Cell</h3>
            <p className="editorial-card-desc">
              Approved applications are formally signed off via coordinator MFA step-up and routed to the university patent attorneys for statutory drafting and filing with the Controller General of Patents.
            </p>
          </div>
        </div>
      </div>

      {/* Security, Confidentiality & Quick Tracker */}
      <div className="grid-2" style={{ gap: '24px' }}>
        {/* Quick Reference Tracker */}
        <div className="editorial-card">
          <div className="card-dot-indicator">
            <span /><span /><span /><span />
          </div>
          <h3 className="editorial-card-title">Application Status Search</h3>
          <p className="editorial-card-desc" style={{ marginBottom: '18px' }}>
            Enter your official disclosure reference number (e.g. <code>{INSTITUTION.SHORT_NAME}-PAT-2026-0001</code>) to inspect review status:
          </p>

          <form onSubmit={handleTrackApplication} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-control"
              placeholder={`${INSTITUTION.SHORT_NAME}-PAT-YYYY-XXXX`}
              value={refSearch}
              onChange={(e) => setRefSearch(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', borderRadius: '6px', padding: '10px 18px' }}
            />
            <button type="submit" className="btn btn-primary" disabled={isSearching}>
              <span />
              {isSearching ? 'Searching...' : 'Track'}
            </button>
          </form>

          {searchError && (
            <div style={{ color: 'var(--color-danger)', fontSize: '0.75rem', marginTop: '10px' }}>
              {searchError}
            </div>
          )}
        </div>

        {/* Confidentiality & Security Guarantee */}
        <div className="editorial-card">
          <div className="card-dot-indicator pattern-2">
            <span /><span /><span /><span />
          </div>
          <h3 className="editorial-card-title">Data Isolation &amp; Confidentiality</h3>
          <p className="editorial-card-desc">
            Invention disclosures, prior-art documents, and engineering schematics are stored in isolated private storage. Strict database Row-Level Security (RLS) ensures that student disclosures are inaccessible to other students, while administrative oversight is strictly reserved for Patent Coordinator <strong>{COORDINATOR.FULL_NAME}</strong>.
          </p>
        </div>
      </div>

      <GuidelinesModal isOpen={isGuidelinesOpen} onClose={() => setIsGuidelinesOpen(false)} />
    </div>
  );
};
