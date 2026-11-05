import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import {
  fetchApplicationById,
  downloadSecureDocument,
  transitionApplicationStatus,
  createCorrectionRequest,
  addApplicationComment,
  fetchApplicationComments,
} from '../lib/api';
import type { Application, ApplicationComment } from '../types/database.types';
import {
  getStatusBadgeClass,
  getStatusDisplayName,
} from '../features/applications/workflow';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Download,
  Send,
  PlusCircle,
  MessageSquare,
  KeyRound,
  GitCompare,
} from 'lucide-react';
import { COORDINATOR } from '../config/constants';
import { VersionDiffViewer } from '../components/VersionDiffViewer';

export const AdminApplicationReviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentUser, isAal2, verifyTotpMfa } = useAuth();

  const [application, setApplication] = useState<Application | null>(null);
  const [comments, setComments] = useState<ApplicationComment[]>([]);
  const [newComment, setNewComment] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Correction Modal State
  const [showCorrectionModal, setShowCorrectionModal] = useState<boolean>(false);
  const [correctionField, setCorrectionField] = useState<string>('description');
  const [correctionComment, setCorrectionComment] = useState<string>('');
  const [correctionsList, setCorrectionsList] = useState<{ field: string; comment: string }[]>([]);

  // Approval Modal State
  const [showApproveModal, setShowApproveModal] = useState<boolean>(false);
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  const [mfaCode, setMfaCode] = useState<string>('');
  const [mfaError, setMfaError] = useState<string | null>(null);

  // Version Diff Inspector State
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
        setFeedbackMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to load application',
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [id, currentUser]);

  const handleDownloadDoc = async (path: string, filename: string) => {
    try {
      await downloadSecureDocument(path, filename);
    } catch {
      alert('Unable to download secure document.');
    }
  };

  const handleStartReview = async () => {
    if (!application || !currentUser) return;
    setIsActionLoading(true);
    try {
      const updated = await transitionApplicationStatus(
        application.id,
        'under_review',
        currentUser,
        `${COORDINATOR.FULL_NAME} commenced active examination.`
      );
      setApplication(updated);
      setFeedbackMessage({
        type: 'success',
        text: 'Application status changed to Under Review.',
      });
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Status update failed',
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAddCorrectionItem = () => {
    if (!correctionComment.trim()) return;
    setCorrectionsList([...correctionsList, { field: correctionField, comment: correctionComment.trim() }]);
    setCorrectionComment('');
  };

  const handleSendCorrectionRequests = async () => {
    if (!application || !currentUser) return;
    const itemsToSend = [...correctionsList];
    if (itemsToSend.length === 0 && correctionComment.trim()) {
      itemsToSend.push({ field: correctionField, comment: correctionComment.trim() });
    }
    if (itemsToSend.length === 0) return;

    setIsActionLoading(true);
    setFeedbackMessage(null);

    try {
      for (const item of itemsToSend) {
        await createCorrectionRequest(application.id, currentUser.id, item.comment, item.field);
      }

      const updated = await transitionApplicationStatus(
        application.id,
        'corrections_required',
        currentUser,
        `${COORDINATOR.FULL_NAME} requested ${itemsToSend.length} itemized correction(s).`
      );

      setApplication(updated);
      setShowCorrectionModal(false);
      setCorrectionsList([]);
      setCorrectionComment('');
      setFeedbackMessage({
        type: 'success',
        text: 'Corrections successfully dispatched to the student with notification.',
      });
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to request corrections',
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleConfirmApproval = async () => {
    if (!application || !currentUser) return;
    setMfaError(null);

    // If AAL2 step-up required, verify code
    if (!isAal2) {
      if (!mfaCode.trim()) {
        setMfaError('Please enter your 6-digit TOTP coordinator authenticator code.');
        return;
      }
      const verified = await verifyTotpMfa(mfaCode.trim());
      if (!verified) {
        setMfaError('That authenticator code did not match. Try the current code.');
        return;
      }
    }

    setIsActionLoading(true);
    try {
      const updated = await transitionApplicationStatus(
        application.id,
        'approved_next_stage',
        currentUser,
        approvalNotes.trim() || `Approved by ${COORDINATOR.FULL_NAME} for statutory patent drafting.`
      );
      setApplication(updated);
      setShowApproveModal(false);
      setFeedbackMessage({
        type: 'success',
        text: 'Application approved for the next internal stage. Disclosure forwarded to IPR filing cell.',
      });
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Approval failed',
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePostAdminComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !application || !currentUser) return;
    try {
      await addApplicationComment(application.id, currentUser.id, newComment.trim(), 'general');
      const updated = await fetchApplicationComments(application.id, currentUser.role);
      setComments(updated);
      setNewComment('');
    } catch (err) {
      console.error('Failed to post comment', err);
    }
  };

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: '60px', textAlign: 'center' }}>
        <p>Loading application review dossier...</p>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="container" style={{ paddingBlock: '40px' }}>
        <div className="alert alert-danger">Application not found or inaccessible.</div>
        <Link to="/admin/dashboard" className="btn btn-outline">
          &larr; Return to Coordinator Registry
        </Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: '24px 60px' }}>
      {/* Top Breadcrumb & Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <Link to="/admin/dashboard" className="btn btn-outline btn-sm">
          &larr; Back to Screening Registry
        </Link>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {((application.application_versions && application.application_versions.length > 0) ||
            application.current_version > 1) && (
            <button
              type="button"
              onClick={() => setShowDiffViewer(!showDiffViewer)}
              className="btn btn-outline btn-sm"
              style={{
                borderColor: showDiffViewer ? '#0284c7' : '#cbd5e1',
                color: showDiffViewer ? '#0284c7' : '#334155',
                backgroundColor: showDiffViewer ? '#f0f9ff' : 'transparent',
              }}
            >
              <GitCompare size={14} />
              {showDiffViewer ? 'Hide Version Diff' : 'Compare Versions (Diff)'}
            </button>
          )}

          {application.status === 'submitted' && (
            <button
              type="button"
              onClick={handleStartReview}
              className="btn btn-primary btn-sm"
              disabled={isActionLoading}
            >
              Commence Active Review
            </button>
          )}

          {(application.status === 'under_review' ||
            application.status === 'submitted' ||
            application.status === 'resubmitted') && (
            <>
              <button
                type="button"
                onClick={() => setShowCorrectionModal(true)}
                className="btn btn-danger btn-sm"
                disabled={isActionLoading}
              >
                Request Corrections
              </button>
              <button
                type="button"
                onClick={() => setShowApproveModal(true)}
                className="btn btn-primary btn-sm"
                disabled={isActionLoading}
              >
                <CheckCircle2 size={14} />
                Approve for Next Stage
              </button>
            </>
          )}
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`alert ${feedbackMessage.type === 'success' ? 'alert-success' : 'alert-danger'}`}
          style={{ marginBottom: '20px' }}
        >
          {feedbackMessage.text}
        </div>
      )}

      {/* Version Diff Inspector */}
      {showDiffViewer && (
        <VersionDiffViewer
          application={application}
          versions={application.application_versions}
          onClose={() => setShowDiffViewer(false)}
        />
      )}

      {/* Main Review Card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1.125rem' }}>
                {application.reference_number}
              </strong>
              <span className={getStatusBadgeClass(application.status)}>
                {getStatusDisplayName(application.status)}
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Version {application.current_version}
              </span>
            </div>
            <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>
              {application.title}
            </h1>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {application.profiles?.full_name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {application.profiles?.university_email} | {application.profiles?.department || 'Department Unassigned'}
            </div>
          </div>
        </div>

        <div className="card-body">
          {/* Technical Field */}
          <div style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Technical Field
            </span>
            <div style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', marginTop: '2px' }}>
              {application.technical_field}
            </div>
          </div>

          {/* Background Problem */}
          <div style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Background Problem &amp; Prior Art Deficiencies
            </span>
            <div
              style={{
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                marginTop: '4px',
                whiteSpace: 'pre-wrap',
                backgroundColor: 'var(--bg-secondary)',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {application.background_problem}
            </div>
          </div>

          {/* Detailed Description */}
          <div style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Detailed Technical Description
            </span>
            <div
              style={{
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                marginTop: '4px',
                whiteSpace: 'pre-wrap',
                backgroundColor: 'var(--bg-secondary)',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {application.description}
            </div>
          </div>

          {/* Novelty Features */}
          <div style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Novelty &amp; Inventive Step
            </span>
            <div
              style={{
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                marginTop: '4px',
                whiteSpace: 'pre-wrap',
                backgroundColor: 'var(--bg-secondary)',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {application.novelty_features}
            </div>
          </div>

          {/* Practical Applications */}
          {application.practical_applications && (
            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Practical Applications &amp; Utility
              </span>
              <div
                style={{
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  whiteSpace: 'pre-wrap',
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {application.practical_applications}
              </div>
            </div>
          )}

          {/* Inventors Section */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '0.9375rem', marginBottom: '10px' }}>Inventors Roster</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {(application.inventors || []).map((inv, idx) => (
                <div
                  key={inv.id || idx}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: inv.is_primary ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                    {inv.full_name} {inv.is_primary && '(Lead Applicant)'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {inv.email}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {inv.affiliation_type} &bull; {inv.department}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Attached Technical Documents */}
          <div>
            <h3 style={{ fontSize: '0.9375rem', marginBottom: '10px' }}>Submitted Files &amp; Drawings</h3>
            {application.application_documents && application.application_documents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {application.application_documents.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-light)',
                    }}
                  >
                    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      <strong style={{ fontSize: '0.8125rem' }}>{doc.original_filename}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        ({doc.document_category} &bull; {(doc.file_size_bytes / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadDoc(doc.storage_path, doc.original_filename)}
                      className="btn btn-outline btn-sm"
                    >
                      <Download size={13} /> Secure Download
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                No technical specifications or drawings uploaded.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Internal Notes & Status History */}
      <div className="grid-2" style={{ gap: '20px' }}>
        {/* Verification Status Audit Log */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Verified Audit Trail</h3>
          </div>
          <div className="card-body" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {(application.application_status_history || []).map((hist) => (
                <li
                  key={hist.id}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border-light)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)' }}>
                    <strong>{getStatusDisplayName(hist.to_status)}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(hist.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                  {hist.reason && (
                    <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {hist.reason}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Review Notes & Coordinator Comments */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Coordinator Review Notes</h3>
          </div>
          <div className="card-body">
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '12px' }}>
              {comments.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                  No internal notes recorded yet.
                </p>
              ) : (
                comments.map((comm) => (
                  <div
                    key={comm.id}
                    style={{
                      padding: '8px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: '8px',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {comm.author?.full_name || 'Coordinator'}:
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {comm.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handlePostAdminComment}>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Record an internal examination note..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-outline btn-sm">
                <MessageSquare size={13} /> Add Note
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* CORRECTION REQUEST MODAL */}
      {showCorrectionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)' }}>
                <AlertTriangle size={18} />
                <h3 className="card-title" style={{ color: 'var(--color-danger)' }}>
                  Author Itemized Correction Request
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCorrectionModal(false)}
                className="btn btn-outline btn-sm"
              >
                Cancel
              </button>
            </div>

            <div className="card-body">
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Specify targeted feedback on technical fields or documents. The application will be unlocked for the student with your notes displayed.
              </p>

              {/* Items to send list */}
              {correctionsList.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Staged Correction Items ({correctionsList.length}):
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                    {correctionsList.map((c, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.8125rem',
                        }}
                      >
                        <strong>Field: {c.field}</strong> &bull; {c.comment}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Target Section / Field</label>
                <select
                  className="form-control"
                  value={correctionField}
                  onChange={(e) => setCorrectionField(e.target.value)}
                >
                  <option value="title">Title of Invention</option>
                  <option value="technical_field">Technical Field</option>
                  <option value="background_problem">Background Problem &amp; Prior Art</option>
                  <option value="description">Detailed Description</option>
                  <option value="novelty_features">Novelty &amp; Inventive Steps</option>
                  <option value="practical_applications">Practical Applications</option>
                  <option value="inventors">Inventors Roster</option>
                  <option value="complete_specification">Attached Specification Document</option>
                  <option value="drawings">Technical Drawings / Diagrams</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Reviewer Instructions / Defect Description</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="e.g. Please clarify the dynamic impedance tuning mechanism and include quantitative experimental metrics."
                  value={correctionComment}
                  onChange={(e) => setCorrectionComment(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={handleAddCorrectionItem}
                  className="btn btn-outline btn-sm"
                  disabled={!correctionComment.trim()}
                >
                  <PlusCircle size={14} /> Add Another Remark
                </button>
              </div>
            </div>

            <div className="card-footer" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowCorrectionModal(false)}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendCorrectionRequests}
                className="btn btn-danger"
                disabled={isActionLoading || (correctionsList.length === 0 && !correctionComment.trim())}
              >
                <Send size={14} /> Dispatch Correction Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPROVAL MODAL */}
      {showApproveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div className="card" style={{ maxWidth: '520px', width: '100%' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)' }}>
                <CheckCircle2 size={20} />
                <h3 className="card-title" style={{ color: 'var(--color-success)' }}>
                  Authorize Statutory Next Stage
                </h3>
              </div>
            </div>

            <div className="card-body">
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                You are approving application <strong>{application.reference_number}</strong>. This confirms that {COORDINATOR.FULL_NAME} has vetted the technical disclosure and authorized forwarding to the IPR drafting attorney cell.
              </p>

              {mfaError && (
                <div className="alert alert-danger" style={{ marginBottom: '12px' }}>
                  <AlertCircle size={16} />
                  <span>{mfaError}</span>
                </div>
              )}

              {/* AAL2 MFA Check */}
              {!isAal2 && (
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    <KeyRound size={15} color="var(--accent-teal)" />
                    <span>AAL2 Coordinator Authentication Required</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                    Enter the 6-digit code from your authenticator app to authorize this statutory transition.
                  </p>
                  <input
                    type="text"
                    maxLength={6}
                    className="form-control"
                    placeholder="123456"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.2em', textAlign: 'center' }}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Coordinator Clearance Note (Optional)</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder={COORDINATOR.APPROVAL_REASON_DEFAULT}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="card-footer" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApproval}
                className="btn btn-primary"
                disabled={isActionLoading}
              >
                <CheckCircle2 size={14} /> Confirm Statutory Approval
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
