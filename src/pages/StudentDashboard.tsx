import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { fetchApplications, fetchNotifications } from '../lib/api';
import type { Application, InPortalNotification } from '../types/database.types';
import { getStatusBadgeClass, getStatusDisplayName } from '../features/applications/workflow';
import {
  PlusCircle,
  FileText,
  AlertTriangle,
  Eye,
  Layers,
  Clock,
  ArrowRight,
  Search,
  FileEdit,
  ShieldAlert,
  Bell
} from 'lucide-react';

export const StudentDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [notifications, setNotifications] = useState<InPortalNotification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'all' | 'action_needed' | 'review' | 'draft' | 'approved'>('all');

  useEffect(() => {
    async function loadDashboardData() {
      if (!currentUser) return;
      setIsLoading(true);
      try {
        const [apps, notifs] = await Promise.all([
          fetchApplications(currentUser),
          fetchNotifications(currentUser.id),
        ]);
        setApplications(apps);
        setNotifications(notifs);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load applications');
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboardData();
  }, [currentUser]);

  // Derived metrics
  const totalCount = applications.length;
  const draftCount = applications.filter((a) => a.status === 'draft').length;
  const inReviewCount = applications.filter((a) => ['submitted', 'under_review', 'resubmitted'].includes(a.status)).length;
  const actionRequiredApps = applications.filter((a) => a.status === 'corrections_required');
  const approvedCount = applications.filter((a) => a.status === 'approved_next_stage').length;

  // Filtered applications
  const filteredApps = applications.filter((app) => {
    if (filterTab === 'action_needed' && app.status !== 'corrections_required') return false;
    if (filterTab === 'review' && !['submitted', 'under_review', 'resubmitted'].includes(app.status)) return false;
    if (filterTab === 'draft' && app.status !== 'draft') return false;
    if (filterTab === 'approved' && app.status !== 'approved_next_stage') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRef = app.reference_number?.toLowerCase().includes(q);
      const matchTitle = app.title?.toLowerCase().includes(q);
      const matchField = app.technical_field?.toLowerCase().includes(q);
      return matchRef || matchTitle || matchField;
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: '80px', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: '#6385B2' }}>Loading your patent disclosures and examination telemetry...</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: '36px 60px' }}>
      {/* Header & New Application Action (Inspired by Image 1 Editorial Layout) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '36px',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span
              style={{
                backgroundColor: '#E8EEF6',
                color: '#204E96',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 12px',
                borderRadius: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Applicant Workspace
            </span>
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.025em', color: '#152E5A' }}>
            Welcome, {currentUser?.full_name}
          </h1>
        </div>

        <Link
          to="/applications/new"
          className="btn btn-primary"
        >
          <span />
          <PlusCircle size={18} />
          Draft New Patent Disclosure
        </Link>
      </div>

      {/* In-Portal Notification Banner */}
      {notifications.length > 0 && notifications.some((n) => !n.is_read) && (
        <div 
          style={{ 
            marginBottom: '24px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            backgroundColor: '#E8EEF6',
            border: '1px solid #CBDDF2',
            borderRadius: '20px',
            padding: '14px 20px',
            color: '#204E96'
          }}
        >
          <Bell size={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>
            <strong style={{ fontWeight: 700 }}>Recent Notice:</strong> {notifications.find((n) => !n.is_read)?.message}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-danger" style={{ marginBottom: '24px', borderRadius: '20px' }}>
          <AlertTriangle size={18} />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* Critical Action Required Banner */}
      {actionRequiredApps.length > 0 && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '2px solid #F87171',
            borderRadius: '24px',
            padding: '20px 24px',
            marginBottom: '32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            boxShadow: '0 4px 16px rgba(239, 68, 68, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', padding: '10px', borderRadius: '6px' }}>
              <ShieldAlert size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#991B1B', fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                Revisions Requested on {actionRequiredApps.length} Disclosure{actionRequiredApps.length > 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#B91C1C', marginTop: '4px', lineHeight: 1.5 }}>
                The Patent Review Cell has evaluated your filing and provided itemized feedback. Please update the draft and resubmit.
              </div>
            </div>
          </div>
          <Link
            to={`/applications/${actionRequiredApps[0].id}/corrections`}
            className="btn btn-danger"
            style={{ fontWeight: 700, borderRadius: '6px', padding: '10px 22px' }}
          >
            Resolve Remarks Now <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {/* Filter and Search Controls (Pill Filter Buttons) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        {/* Pill Filters matching Reference Style */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `All Disclosures (${totalCount})` },
            { id: 'action_needed', label: `Action Needed (${actionRequiredApps.length})` },
            { id: 'review', label: `In Examination (${inReviewCount})` },
            { id: 'draft', label: `Drafts (${draftCount})` },
            { id: 'approved', label: `Approved (${approvedCount})` },
          ].map((tab) => {
            const isActive = filterTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id as any)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  border: '1.5px solid',
                  borderColor: isActive ? '#204E96' : '#EBE5D5',
                  backgroundColor: isActive ? '#204E96' : '#FFFFFF',
                  color: isActive ? '#FFFFFF' : '#354F77',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 2px 8px rgba(32, 78, 150, 0.2)' : 'none',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: '280px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6385B2' }}>
            <Search size={16} />
          </span>
          <input
            type="text"
            className="form-control"
            style={{ 
              paddingLeft: '36px', 
              fontSize: '0.85rem', 
              height: '40px', 
              borderRadius: '6px',
              backgroundColor: '#FFFFFF',
              border: '1.5px solid #EBE5D5'
            }}
            placeholder="Search by title, reference, or domain..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Disclosures Table Card (Clean White, 24px Radius) */}
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
            Invention Disclosures Registry
          </h2>
          <span style={{ fontSize: '0.8125rem', color: '#6385B2', fontWeight: 500 }}>
            Showing {filteredApps.length} of {applications.length} applications
          </span>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {filteredApps.length === 0 ? (
            <div className="empty-state" style={{ padding: '64px 20px', textAlign: 'center' }}>
              <FileText size={44} color="#6385B2" style={{ margin: '0 auto 14px' }} />
              <h3 className="empty-state-title" style={{ fontSize: '1.15rem', fontWeight: 700, color: '#152E5A' }}>
                {searchQuery || filterTab !== 'all' ? 'No Matching Disclosures Found' : 'No Patent Applications Drafted Yet'}
              </h3>
              <p className="empty-state-description" style={{ color: '#354F77', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 24px' }}>
                {searchQuery || filterTab !== 'all'
                  ? 'Try adjusting your search keywords or filter tab to find your application.'
                  : 'Start your intellectual property journey by filing an invention disclosure through the E-Cell MUJ patent portal.'}
              </p>
              {!searchQuery && filterTab === 'all' && (
                <Link to="/applications/new" className="btn btn-primary" style={{ borderRadius: '6px', padding: '10px 24px' }}>
                  <PlusCircle size={16} />
                  Draft First Invention Disclosure
                </Link>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #EBE5D5', backgroundColor: '#F4EFE0' }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Reference
                    </th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Invention Title &amp; Field
                    </th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Status
                    </th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Version
                    </th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Last Activity
                    </th>
                    <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: '#152E5A', textTransform: 'uppercase' }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApps.map((app) => {
                    const isCorrection = app.status === 'corrections_required';
                    return (
                      <tr
                        key={app.id}
                        style={{
                          borderBottom: '1px solid #EBE5D5',
                          backgroundColor: isCorrection ? '#FFF8F8' : 'transparent',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '16px 20px', verticalAlign: 'middle' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono, monospace)',
                              fontWeight: 700,
                              fontSize: '0.8125rem',
                              color: '#152E5A',
                              backgroundColor: '#E8EEF6',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid #CBDDF2',
                            }}
                          >
                            {app.reference_number}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', verticalAlign: 'middle', maxWidth: '340px' }}>
                          <div style={{ fontWeight: 700, color: '#152E5A', fontSize: '0.92rem', lineHeight: 1.35 }}>
                            {app.title || 'Untitled Invention Draft'}
                          </div>
                          <div style={{ fontSize: '0.78125rem', color: '#6385B2', marginTop: '3px' }}>
                            {app.technical_field || 'Technical field unassigned'}
                          </div>
                          {isCorrection && (
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                color: '#DC2626',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                marginTop: '4px',
                              }}
                            >
                              <AlertTriangle size={12} />
                              Reviewer Remarks Pending Resolution
                            </div>
                          )}
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
                              color: '#354F77',
                              fontWeight: 600,
                            }}
                          >
                            <Layers size={13} color="#6385B2" />
                            v{app.current_version || 1}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', verticalAlign: 'middle', color: '#6385B2', fontSize: '0.8125rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Clock size={13} />
                            {new Date(app.updated_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px', verticalAlign: 'middle', textAlign: 'right' }}>
                          {isCorrection ? (
                            <Link
                              to={`/applications/${app.id}/corrections`}
                              className="btn btn-sm btn-danger"
                              style={{ fontWeight: 700, borderRadius: '6px', padding: '6px 14px' }}
                            >
                              Resolve
                              <ArrowRight size={13} />
                            </Link>
                          ) : app.status === 'draft' ? (
                            <Link
                              to={`/applications/${app.id}/edit`}
                              className="btn btn-sm btn-outline"
                              style={{ fontWeight: 600, borderRadius: '6px', padding: '6px 14px' }}
                            >
                              <FileEdit size={13} />
                              Edit Draft
                            </Link>
                          ) : (
                            <Link
                              to={`/applications/${app.id}`}
                              className="btn btn-sm btn-outline"
                              style={{ fontWeight: 600, borderRadius: '6px', padding: '6px 14px' }}
                            >
                              <Eye size={13} />
                              View
                            </Link>
                          )}
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

export default StudentDashboard;
