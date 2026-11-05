import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import {
  fetchApplicationById,
  downloadSecureDocument,
  addApplicationComment,
  fetchApplicationComments,
} from '../lib/api';
import type { Application, ApplicationComment } from '../types/database.types';
import { getStatusBadgeClass, getStatusDisplayName } from '../features/applications/workflow';
import {
  Layers,
  Download,
  AlertTriangle,
  ShieldCheck,
  GitCompare,
} from 'lucide-react';
import { VersionDiffViewer } from '../components/VersionDiffViewer';

export const ApplicationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useAuth();

  const [application, setApplication] = useState<Application | null>(null);
  const [comments, setComments] = useState<ApplicationComment[]>([]);
  const [newComment, setNewComment] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPostingComment, setIsPostingComment] = useState<boolean>(false);
  const [showDiffViewer, setShowDiffViewer] = useState<boolean>(false);

  useEffect(() => {
    async function loadData() {
      if (!id || !currentUser) return;
      setIsLoading(true);
      try {
        const app = await fetchApplicationById(id, currentUser);
        setApplication(app);
        if (app) {
          const comms = await fetchApplicationComments(app.id, currentUser.role);
          setComments(comms);
        }
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load application details');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [id, currentUser]);

  const handleDownloadDocument = async (docPath: string, filename: string) => {
    try {
      await downloadSecureDocument(docPath, filename);
    } catch {
      alert('Unable to download secure document.');
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !application || !currentUser) return;
    setIsPostingComment(true);
    try {
      await addApplicationComment(application.id, currentUser.id, newComment.trim(), 'general');
      const updated = await fetchApplicationComments(application.id, currentUser.role);
      setComments(updated);
      setNewComment('');
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setIsPostingComment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: '60px', textAlign: 'center' }}>
        <p>Loading application details and verified audit history...</p>
      </div>
    );
  }

  if (errorMessage || !application) {
    return (
      <div className="container" style={{ paddingBlock: '40px' }}>
        <div className="alert alert-danger">{errorMessage || 'Application not found'}</div>
        <Link to="/dashboard" className="btn btn-outline">
          &larr; Return to Dashboard
        </Link>
      </div>
    );
  }

  const isOwner = currentUser?.id === application.owner_id;
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="container">
      {/* Header and Status Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '28px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <Link
            to={isAdmin ? '/admin/dashboard' : '/dashboard'}
            style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}
          >
            &larr; Back to {isAdmin ? 'Admin Console' : 'Dashboard'}
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
            <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{application.reference_number}</h1>
            <span className={getStatusBadgeClass(application.status)}>
              {getStatusDisplayName(application.status)}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.8125rem',
                backgroundColor: 'var(--bg-tertiary)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Layers size={13} /> Version {application.current_version}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Created: {new Date(application.created_at).toLocaleDateString('en-IN')} | Last Updated:{' '}
            {new Date(application.updated_at).toLocaleDateString('en-IN')}
          </p>
        </div>

        {/* State-specific Actions */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {((application.application_versions && application.application_versions.length > 0) ||
            application.current_version > 1) && (
            <button
              type="button"
              onClick={() => setShowDiffViewer(!showDiffViewer)}
              className="btn btn-outline"
              style={{
                borderColor: showDiffViewer ? '#204E96' : 'var(--border-color)',
                color: showDiffViewer ? '#204E96' : 'var(--text-primary)',
                backgroundColor: showDiffViewer ? '#E8EEF6' : 'transparent',
              }}
            >
              <GitCompare size={15} />
              {showDiffViewer ? 'Hide Version Diff' : 'Compare Revisions'}
            </button>
          )}

          {isOwner && application.status === 'draft' && (
            <Link to={`/applications/${application.id}/edit`} className="btn btn-primary">
              Continue Editing Draft
            </Link>
          )}

          {isOwner && application.status === 'corrections_required' && (
            <Link to={`/applications/${application.id}/corrections`} className="btn btn-danger">
              <AlertTriangle size={16} />
              Address Requested Corrections
            </Link>
          )}

          {isAdmin && (
            <Link to={`/admin/applications/${application.id}`} className="btn btn-secondary">
              <ShieldCheck size={16} />
              Open Coordinator Decision Console
            </Link>
          )}
        </div>
      </div>

      {/* Version Diff Inspector */}
      {showDiffViewer && (
        <VersionDiffViewer
          application={application}
          versions={application.application_versions}
          onClose={() => setShowDiffViewer(false)}
        />
      )}

      {/* Active Correction Requests Banner */}
      {application.status === 'corrections_required' && (
        <div className="alert alert-danger" style={{ marginBottom: '28px' }}>
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 6px', color: 'var(--color-danger)' }}>
              Corrections Requested by Patent Coordinator
            </h4>
            <p style={{ margin: '0 0 10px', fontSize: '0.875rem' }}>
              The patent review cell has flagged specific items requiring modification or clarification before this disclosure can be approved.
            </p>
            {isOwner && (
              <Link to={`/applications/${application.id}/corrections`} className="btn btn-danger btn-sm">
                Open Correction Workspace &rarr;
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Main Grid: Details + Documents + History */}
      <div className="grid-main-aside">
        {/* Left Column: Full Technical Disclosure */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Invention Overview */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Technical Disclosure Overview</h3>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Invention Title
                </span>
                <h2 style={{ fontSize: '1.25rem', marginTop: '4px', color: 'var(--text-primary)' }}>
                  {application.title}
                </h2>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Technical Domain
                </span>
                <p style={{ marginTop: '4px' }}>{application.technical_field}</p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Problem Statement & Prior Art Limitations
                </span>
                <p style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{application.background_problem}</p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Detailed Description of Invention
                </span>
                <p style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{application.description}</p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Distinguishing Novel Features
                </span>
                <p style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{application.novelty_features}</p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Proposed Industrial Applications & Utility
                </span>
                <p style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{application.practical_applications}</p>
              </div>
            </div>
          </div>

          {/* Inventors Registry */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Registered Inventors</h3>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Affiliation</th>
                      <th>Department</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {application.inventors?.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{inv.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inv.email}</div>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{inv.affiliation_type}</td>
                        <td>{inv.department}</td>
                        <td>
                          {inv.is_primary ? (
                            <span style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.75rem' }}>
                              Lead Inventor
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Co-Inventor</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Collaboration Comments */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Application Notes & Comments</h3>
            </div>
            <div className="card-body">
              {comments.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  No comments logged yet for this disclosure.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                  {comments.map((comm) => (
                    <div
                      key={comm.id}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          marginBottom: '4px',
                        }}
                      >
                        <strong>{comm.author?.full_name || 'Coordinator'}</strong>
                        <span>{new Date(comm.created_at).toLocaleString('en-IN')}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{comm.content}</p>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handlePostComment} style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Post an administrative note or question..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-outline btn-sm"
                  disabled={isPostingComment || !newComment.trim()}
                >
                  Post Note
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Private Documents + Audit History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Documents Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Private Documents</h3>
            </div>
            <div className="card-body">
              {application.application_documents && application.application_documents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {application.application_documents.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-secondary)',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '0.8125rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {doc.original_filename}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {doc.document_category} | {(doc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadDocument(doc.storage_path, doc.original_filename)}
                        className="btn btn-outline btn-sm"
                        title="Download Document"
                      >
                        <Download size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No attached documents found.</p>
              )}
            </div>
          </div>

          {/* Audit Trail Timeline */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Status Transition Audit Log</h3>
            </div>
            <div className="card-body" style={{ padding: '16px' }}>
              {application.application_status_history && application.application_status_history.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {application.application_status_history.map((hist) => (
                    <div
                      key={hist.id}
                      style={{
                        borderLeft: '2px solid var(--border-medium)',
                        paddingLeft: '12px',
                        position: 'relative',
                      }}
                    >
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Status: {getStatusDisplayName(hist.to_status)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0' }}>
                        {hist.reason || 'Transition recorded.'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(hist.created_at).toLocaleString('en-IN')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No transitions recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
