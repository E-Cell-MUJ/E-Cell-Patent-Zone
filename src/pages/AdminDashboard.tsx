import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { fetchApplications } from '../lib/api';
import type { Application } from '../types/database.types';
import { getStatusBadgeClass, getStatusDisplayName } from '../features/applications/workflow';
import { 
  Eye, 
  Inbox, 
  Clock, 
  AlertCircle, 
  Search, 
  Layers,
  CheckCircle2,
  Hourglass,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { INSTITUTION } from '../config/constants';

export const AdminDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'submitted' | 'waiting'>('waiting');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadAdminData() {
      if (!currentUser) return;
      setIsLoading(true);
      try {
        const apps = await fetchApplications(currentUser);
        setApplications(apps);
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to load administrative applications'
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadAdminData();
  }, [currentUser]);

  // Exclude unsubmitted drafts from coordinator queue
  const submittedApps = applications.filter((app) => app.status !== 'draft');

  // Metrics
  const pendingScreeningCount = submittedApps.filter((a) => a.status === 'submitted').length;
  const underReviewCount = submittedApps.filter((a) => a.status === 'under_review').length;
  const correctionsDispatchedCount = submittedApps.filter((a) => a.status === 'corrections_required').length;
  const resubmittedCount = submittedApps.filter((a) => a.status === 'resubmitted').length;
  const approvedCount = submittedApps.filter((a) => a.status === 'approved_next_stage').length;

  // Calculate waiting days since last update / submission
  const getWaitingDays = (dateStr?: string | null) => {
    if (!dateStr) return 0;
    const diffMs = Date.now() - new Date(dateStr).getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  // Distinct departments for filter
  const departments = Array.from(
    new Set(
      submittedApps
        .map((a) => a.profiles?.department)
        .filter((d): d is string => Boolean(d))
    )
  );

  // Filtering and searching logic
  const filteredApplications = submittedApps
    .filter((app) => {
      // Status filter
      if (statusFilter === 'needs_action' && !['submitted', 'resubmitted'].includes(app.status)) return false;
      if (statusFilter !== 'all' && statusFilter !== 'needs_action' && app.status !== statusFilter) return false;

      // Department filter
      if (deptFilter !== 'all' && app.profiles?.department !== deptFilter) return false;

      // Search query (reference number, title, or applicant name)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesRef = app.reference_number?.toLowerCase().includes(query);
        const matchesTitle = app.title?.toLowerCase().includes(query);
        const matchesOwner = app.profiles?.full_name?.toLowerCase().includes(query);
        const matchesEmail = app.profiles?.university_email?.toLowerCase().includes(query);
        const matchesDept = app.profiles?.department?.toLowerCase().includes(query);
        return matchesRef || matchesTitle || matchesOwner || matchesEmail || matchesDept;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'waiting') {
        const waitA = getWaitingDays(a.status === 'submitted' ? a.submitted_at : a.updated_at);
        const waitB = getWaitingDays(b.status === 'submitted' ? b.submitted_at : b.updated_at);
        return waitB - waitA;
      }
      if (sortBy === 'submitted') {
        const timeA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
        const timeB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
        return timeB - timeA;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: '80px', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: '#6385B2' }}>Loading patent screening registry...</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: '36px 60px' }}>
      {/* Coordinator Header */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span
            style={{
              backgroundColor: '#E8EEF6',
              color: '#204E96',
              padding: '3px 12px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Coordinator Examination Docket
          </span>
          <span style={{ fontSize: '0.85rem', color: '#6385B2', fontWeight: 500 }}>
            {INSTITUTION.DEPARTMENTS.IPR_CELL} • Directorate of Research
          </span>
        </div>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.025em', color: '#152E5A' }}>
          Patent Screening &amp; Examination Registry
        </h1>
        <p style={{ margin: 0, fontSize: '0.95rem', color: '#354F77', maxWidth: '680px', lineHeight: 1.6 }}>
          Review statutory disclosures, issue itemized correction notices, evaluate prior public disclosures, and authorize internal patent drafting.
        </p>
      </div>

      {errorMessage && (
        <div className="alert alert-danger" style={{ marginBottom: '24px', borderRadius: '20px' }}>
          <AlertCircle size={18} />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* KPI Overview Metric Cards (Image 2 style with 4-dot indicators) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '20px',
          marginBottom: '36px',
        }}
      >
        {/* Pending Screening */}
        <div
          className="card"
          style={{
            padding: '34px 30px', borderRadius: '32px',
            backgroundColor: pendingScreeningCount > 0 ? '#FFFDF8' : '#FFFFFF',
            border: pendingScreeningCount > 0 ? '1.5px solid #204E96' : '1.5px solid #EBE5D5',
            boxShadow: '0 4px 16px rgba(21, 46, 90, 0.04)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="card-dot-indicator">
              <span /><span /><span /><span />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 9999, backgroundColor: '#E8EEF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={17} color="#204E96" />
            </div>
          </div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6385B2', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '12px' }}>
            Pending Screening
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#152E5A', marginTop: '6px', letterSpacing: '-0.02em' }}>
            {pendingScreeningCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#354F77', marginTop: '4px' }}>
            Fresh submissions awaiting review
          </div>
        </div>

        {/* Under Review */}
        <div 
          className="card" 
          style={{ 
            padding: '34px 30px', borderRadius: '32px', 
            backgroundColor: '#FFFFFF',
            border: '1.5px solid #EBE5D5',
            boxShadow: '0 4px 16px rgba(21, 46, 90, 0.04)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="card-dot-indicator">
              <span /><span /><span /><span />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 9999, backgroundColor: '#E8EEF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Hourglass size={17} color="#204E96" />
            </div>
          </div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6385B2', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '12px' }}>
            Under Examination
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#204E96', marginTop: '6px', letterSpacing: '-0.02em' }}>
            {underReviewCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#354F77', marginTop: '4px' }}>
            Active coordinator docket
          </div>
        </div>

        {/* Resubmitted */}
        <div
          className="card"
          style={{
            padding: '34px 30px', borderRadius: '32px',
            backgroundColor: resubmittedCount > 0 ? '#FAF5FF' : '#FFFFFF',
            border: resubmittedCount > 0 ? '1.5px solid #D8B4FE' : '1.5px solid #EBE5D5',
            boxShadow: '0 4px 16px rgba(21, 46, 90, 0.04)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="card-dot-indicator">
              <span style={{ backgroundColor: resubmittedCount > 0 ? '#7E22CE' : '#204E96' }} />
              <span style={{ backgroundColor: resubmittedCount > 0 ? '#7E22CE' : '#204E96' }} />
              <span style={{ backgroundColor: resubmittedCount > 0 ? '#7E22CE' : '#204E96' }} />
              <span style={{ backgroundColor: resubmittedCount > 0 ? '#7E22CE' : '#204E96' }} />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 9999, backgroundColor: resubmittedCount > 0 ? '#F3E8FF' : '#E8EEF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={17} color={resubmittedCount > 0 ? '#7E22CE' : '#204E96'} />
            </div>
          </div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: resubmittedCount > 0 ? '#6B21A8' : '#6385B2', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '12px' }}>
            Resubmitted (V2+)
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: resubmittedCount > 0 ? '#6B21A8' : '#152E5A', marginTop: '6px', letterSpacing: '-0.02em' }}>
            {resubmittedCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#354F77', marginTop: '4px' }}>
            Corrections addressed by student
          </div>
        </div>

        {/* Corrections Dispatched */}
        <div 
          className="card" 
          style={{ 
            padding: '34px 30px', borderRadius: '32px', 
            backgroundColor: '#FFFFFF',
            border: '1.5px solid #EBE5D5',
            boxShadow: '0 4px 16px rgba(21, 46, 90, 0.04)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="card-dot-indicator">
              <span /><span /><span /><span />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 9999, backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={17} color="#B45309" />
            </div>
          </div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6385B2', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '12px' }}>
            Revisions Dispatched
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#B45309', marginTop: '6px', letterSpacing: '-0.02em' }}>
            {correctionsDispatchedCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#354F77', marginTop: '4px' }}>
            Awaiting applicant response
          </div>
        </div>

        {/* Approved Disclosures */}
        <div 
          className="card" 
          style={{ 
            padding: '34px 30px', borderRadius: '32px', 
            backgroundColor: '#FFFFFF',
            border: '1.5px solid #EBE5D5',
            boxShadow: '0 4px 16px rgba(21, 46, 90, 0.04)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="card-dot-indicator">
              <span /><span /><span /><span />
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 9999, backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={17} color="#16A34A" />
            </div>
          </div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6385B2', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '12px' }}>
            Approved Filings
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#16A34A', marginTop: '6px', letterSpacing: '-0.02em' }}>
            {approvedCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#354F77', marginTop: '4px' }}>
            Cleared for drafting
          </div>
        </div>
      </div>

      {/* Filter and Search Controls (Clean Warm Card) */}
      <div 
        className="card" 
        style={{ 
          marginBottom: '24px', 
          borderRadius: '24px', 
          backgroundColor: '#FFFFFF',
          border: '1.5px solid #EBE5D5',
          boxShadow: '0 4px 16px rgba(21, 46, 90, 0.04)'
        }}
      >
        <div className="card-body" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search Input */}
            <div style={{ flex: '1 1 260px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#6385B2' }}>
                <Search size={16} />
              </span>
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '38px', fontSize: '0.85rem', height: '42px', borderRadius: '6px', border: '1.5px solid #EBE5D5' }}
                placeholder="Search reference, applicant name, title, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Status Filter */}
            <div style={{ minWidth: '200px' }}>
              <select
                className="form-control"
                style={{ fontSize: '0.85rem', height: '42px', borderRadius: '6px', border: '1.5px solid #EBE5D5' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Registry Items ({submittedApps.length})</option>
                <option value="needs_action">⚠️ Urgent: Needs Coordinator Action ({pendingScreeningCount + resubmittedCount})</option>
                <option value="submitted">Submitted (Fresh)</option>
                <option value="under_review">Under Review</option>
                <option value="resubmitted">Resubmitted with Corrections</option>
                <option value="corrections_required">Corrections Dispatched</option>
                <option value="approved_next_stage">Approved for Next Stage</option>
              </select>
            </div>

            {/* Department Filter */}
            {departments.length > 0 && (
              <div style={{ minWidth: '170px' }}>
                <select
                  className="form-control"
                  style={{ fontSize: '0.85rem', height: '42px', borderRadius: '6px', border: '1.5px solid #EBE5D5' }}
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                >
                  <option value="all">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Dropdown */}
            <div style={{ minWidth: '170px' }}>
              <select
                className="form-control"
                style={{ fontSize: '0.85rem', height: '42px', borderRadius: '6px', border: '1.5px solid #EBE5D5' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="waiting">Sort: Longest Waiting</option>
                <option value="updated">Sort: Recently Updated</option>
                <option value="submitted">Sort: Initial Submission</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Registry Table */}
      <div 
        className="card" 
        style={{ 
          borderRadius: '24px', 
          backgroundColor: '#FFFFFF',
          border: '1.5px solid #EBE5D5',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(21, 46, 90, 0.04)'
        }}
      >
        <div 
          className="card-header" 
          style={{ 
            padding: '20px 26px', 
            backgroundColor: '#FAF7EE',
            borderBottom: '1px solid #EBE5D5'
          }}
        >
          <h2 className="card-title" style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700, color: '#152E5A' }}>
            Examination Docket
          </h2>
          <span style={{ fontSize: '0.8125rem', color: '#6385B2', fontWeight: 500 }}>
            Showing {filteredApplications.length} of {submittedApps.length} active applications
          </span>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {filteredApplications.length === 0 ? (
            <div className="empty-state" style={{ padding: '64px 20px', textAlign: 'center' }}>
              <Inbox size={44} color="#6385B2" style={{ margin: '0 auto 14px' }} />
              <h3 className="empty-state-title" style={{ fontSize: '1.15rem', fontWeight: 700, color: '#152E5A' }}>
                No Applications Match Your Filters
              </h3>
              <p className="empty-state-description" style={{ color: '#354F77', fontSize: '0.875rem' }}>
                {searchQuery || statusFilter !== 'all' || deptFilter !== 'all'
                  ? 'Try clearing or relaxing your search criteria to see more applications.'
                  : 'There are currently no invention disclosures submitted in the queue.'}
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #EBE5D5', backgroundColor: '#F4EFE0' }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Reference &amp; SLA
                    </th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Invention Title &amp; Field
                    </th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Applicant &amp; Department
                    </th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Status
                    </th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Version
                    </th>
                    <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApplications.map((app) => {
                    const daysWaiting = getWaitingDays(app.status === 'submitted' ? app.submitted_at : app.updated_at);
                    const isUrgent = daysWaiting >= 5 && ['submitted', 'resubmitted'].includes(app.status);

                    return (
                      <tr
                        key={app.id}
                        style={{
                          borderBottom: '1px solid #EBE5D5',
                          backgroundColor: isUrgent ? '#FFFDF0' : 'transparent',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '16px 20px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono, monospace)',
                                fontWeight: 700,
                                fontSize: '0.8125rem',
                                color: '#152E5A',
                                backgroundColor: '#E8EEF6',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBDDF2',
                                width: 'fit-content',
                              }}
                            >
                              {app.reference_number}
                            </span>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                color: daysWaiting > 5 ? '#B45309' : '#6385B2',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <Clock size={11} />
                              {daysWaiting === 0 ? 'Today' : `${daysWaiting}d in queue`}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: '16px 20px', verticalAlign: 'middle', maxWidth: '320px' }}>
                          <div style={{ fontWeight: 700, color: '#152E5A', fontSize: '0.9rem', lineHeight: 1.35 }}>
                            {app.title}
                          </div>
                          <div style={{ fontSize: '0.78125rem', color: '#6385B2', marginTop: '2px' }}>
                            {app.technical_field}
                          </div>
                        </td>

                        <td style={{ padding: '16px 20px', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 700, color: '#152E5A', fontSize: '0.85rem' }}>
                            {app.profiles?.full_name || 'Applicant'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6385B2' }}>
                            {app.profiles?.department || 'Department unassigned'}
                          </div>
                        </td>

                        <td style={{ padding: '16px 20px', verticalAlign: 'middle' }}>
                          <span className={`badge ${getStatusBadgeClass(app.status)}`} style={{ borderRadius: '6px' }}>
                            {getStatusDisplayName(app.status)}
                          </span>
                        </td>

                        <td style={{ padding: '16px 20px', verticalAlign: 'middle' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              color: '#354F77',
                            }}
                          >
                            <Layers size={13} color="#6385B2" />
                            v{app.current_version}
                          </span>
                        </td>

                        <td style={{ padding: '16px 20px', verticalAlign: 'middle', textAlign: 'right' }}>
                          <Link
                            to={`/admin/applications/${app.id}`}
                            className="btn btn-primary btn-sm"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: 700,
                              borderRadius: '6px',
                              padding: '7px 16px',
                              backgroundColor: '#204E96',
                              color: '#ffffff',
                            }}
                          >
                            <Eye size={13} />
                            <span>Examine Dossier</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
