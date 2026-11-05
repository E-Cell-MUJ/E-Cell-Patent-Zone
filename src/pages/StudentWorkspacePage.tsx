import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import {
  fetchApplications,
  fetchApplicationById,
  saveDraftApplication,
  submitApplication,
  resubmitApplication,
  uploadDocument,
  deleteDocument,
  getSignedDocumentUrl,
} from '../lib/api';
import type { Application, Inventor, DocumentCategory } from '../types/database.types';
import { getStatusDisplayName, getStatusBadgeClass } from '../features/applications/workflow';
import {
  COORDINATOR,
  INSTITUTION,
} from '../config/constants';
import {
  Shield,
  User,
  FileText,
  Save,
  Send,
  CheckCircle2,
  AlertTriangle,
  Upload,
  PlusCircle,
  Trash2,
  ExternalLink,
  Lock,
  RefreshCw,
  ArrowRight,
  Info,
} from 'lucide-react';

export const StudentWorkspacePage: React.FC = () => {
  const { currentUser } = useAuth();

  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [technicalField, setTechnicalField] = useState('');
  const [backgroundProblem, setBackgroundProblem] = useState('');
  const [description, setDescription] = useState('');
  const [noveltyFeatures, setNoveltyFeatures] = useState('');
  const [practicalApplications, setPracticalApplications] = useState('');
  const [inventors, setInventors] = useState<Partial<Inventor>[]>([]);

  // Resubmission state for corrections
  const [resubmissionNote, setResubmissionNote] = useState('');
  const [confirmResolution, setConfirmResolution] = useState(false);

  // Document upload state
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('complete_specification');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  // Load latest or active application for the current user
  const loadActiveApplication = async () => {
    if (!currentUser) {
      resetToEmptyTemplate();
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const apps = await fetchApplications(currentUser);
      if (apps.length > 0) {
        const fullApp = await fetchApplicationById(apps[0].id, currentUser);
        if (fullApp) {
          setApplication(fullApp);
          setTitle(fullApp.title || '');
          setTechnicalField(fullApp.technical_field || '');
          setBackgroundProblem(fullApp.background_problem || '');
          setDescription(fullApp.description || '');
          setNoveltyFeatures(fullApp.novelty_features || '');
          setPracticalApplications(fullApp.practical_applications || '');
          setInventors(fullApp.inventors || []);
        }
      } else {
        // Initialize with default template data for immediate writing
        resetToEmptyTemplate();
      }
    } catch (err: unknown) {
      console.error('Failed to load application:', err);
      resetToEmptyTemplate();
    } finally {
      setIsLoading(false);
    }
  };

  const resetToEmptyTemplate = () => {
    setApplication(null);
    setTitle('');
    setTechnicalField('');
    setBackgroundProblem('');
    setDescription('');
    setNoveltyFeatures('');
    setPracticalApplications('');
    setInventors([
      {
        full_name: currentUser?.full_name || '',
        email: currentUser?.university_email || '',
        phone: currentUser?.phone || '',
        affiliation_type: 'student',
        department: currentUser?.department || '',
        is_primary: true,
      },
    ]);
    setResubmissionNote('');
    setConfirmResolution(false);
  };

  useEffect(() => {
    loadActiveApplication();
  }, [currentUser]);

  const isEditable = !application || application.status === 'draft' || application.status === 'corrections_required';

  // 1. SAVE DRAFT
  const handleSaveDraft = async () => {
    if (!currentUser) {
      setFeedback({
        type: 'error',
        text: 'Please sign in with your official university account to save your patent disclosure draft.',
      });
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const saved = await saveDraftApplication(
        {
          id: application?.id,
          title,
          technical_field: technicalField,
          background_problem: backgroundProblem,
          description,
          novelty_features: noveltyFeatures,
          practical_applications: practicalApplications,
        },
        inventors,
        currentUser.id
      );
      setApplication(saved);
      setFeedback({
        type: 'success',
        text: `Draft saved successfully (${saved.reference_number}). You can continue editing anytime.`,
      });
      await loadActiveApplication();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save draft',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 2. SUBMIT APPLICATION
  const handleSubmit = async () => {
    if (!currentUser) {
      setFeedback({
        type: 'error',
        text: 'Please sign in with your official university account to submit an invention disclosure.',
      });
      return;
    }
    if (!title.trim() || !technicalField.trim() || !backgroundProblem.trim() || !description.trim()) {
      setFeedback({
        type: 'error',
        text: 'Please fill in Title, Technical Field, Problem Statement, and Detailed Description before submitting.',
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      // First save latest data
      const saved = await saveDraftApplication(
        {
          id: application?.id,
          title,
          technical_field: technicalField,
          background_problem: backgroundProblem,
          description,
          novelty_features: noveltyFeatures,
          practical_applications: practicalApplications,
        },
        inventors,
        currentUser.id
      );

      // Transition to submitted
      const submitted = await submitApplication(
        saved.id,
        currentUser.id,
        `Submitted by student for official patent review by ${COORDINATOR.FULL_NAME}.`
      );
      setApplication(submitted);
      setFeedback({
        type: 'success',
        text: `Application submitted successfully (${submitted.reference_number})! It has been forwarded to the Admin Dashboard for screening.`,
      });
      await loadActiveApplication();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Submission failed',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 3. RESUBMIT APPLICATION (After Corrections)
  const handleResubmit = async () => {
    if (!application || !currentUser) return;
    if (!confirmResolution) {
      setFeedback({
        type: 'error',
        text: 'Please check the confirmation box indicating that you have addressed the requested modifications.',
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      // Save revised fields
      await saveDraftApplication(
        {
          id: application.id,
          title,
          technical_field: technicalField,
          background_problem: backgroundProblem,
          description,
          novelty_features: noveltyFeatures,
          practical_applications: practicalApplications,
        },
        inventors,
        currentUser.id
      );

      // Resubmit to increment version and set status to resubmitted
      const resubmitted = await resubmitApplication(
        application.id,
        currentUser.id,
        resubmissionNote.trim() || 'Addressed all reviewer feedback items.'
      );

      setApplication(resubmitted);
      setResubmissionNote('');
      setConfirmResolution(false);
      setFeedback({
        type: 'success',
        text: `Application resubmitted as Version ${resubmitted.current_version}! It is now back in the Admin Dashboard for re-evaluation.`,
      });
      await loadActiveApplication();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Resubmission failed',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 4. ATTACH DOCUMENT
  const handleUploadDocument = async () => {
    if (!application || !currentUser || !uploadFile) return;
    setIsUploadingDoc(true);
    setFeedback(null);
    try {
      await uploadDocument(application.id, uploadFile, uploadCategory, currentUser.id);
      setUploadFile(null);
      setFeedback({
        type: 'success',
        text: `Document attached successfully.`,
      });
      await loadActiveApplication();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Upload failed',
      });
    } finally {
      setIsUploadingDoc(false);
    }
  };

  // 5. DELETE DOCUMENT
  const handleDeleteDocument = async (docId: string) => {
    if (!currentUser || !application) return;
    if (!confirm('Are you sure you want to remove this attached file?')) return;
    try {
      await deleteDocument(docId, currentUser.id);
      setFeedback({
        type: 'info',
        text: 'Attached file deleted.',
      });
      await loadActiveApplication();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  };

  // 6. INVENTOR MANAGEMENT
  const handleAddInventor = () => {
    setInventors([
      ...inventors,
      {
        full_name: '',
        email: '',
        phone: '',
        affiliation_type: 'student',
        department: '',
        is_primary: false,
      },
    ]);
  };

  const handleUpdateInventor = (index: number, key: keyof Inventor, value: any) => {
    const updated = [...inventors];
    updated[index] = { ...updated[index], [key]: value };
    setInventors(updated);
  };

  const handleRemoveInventor = (index: number) => {
    setInventors(inventors.filter((_, i) => i !== index));
  };

  const handleStartFreshApplication = () => {
    if (confirm('Start a new blank application draft? Any unsaved edits on the current view will be cleared.')) {
      resetToEmptyTemplate();
      setFeedback({
        type: 'info',
        text: 'Ready to write a new patent application draft.',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: '64px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading student workspace...</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: '28px 60px' }}>
      {/* Institutional Applicant Dossier Bar */}
      {currentUser ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 16px',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem' }}>
            <User size={16} color="var(--accent-primary)" />
            <span style={{ fontWeight: 600 }}>Applicant Dossier:</span>
            <span style={{ color: 'var(--text-primary)' }}>
              {currentUser.full_name} ({currentUser.university_email}) &bull; {currentUser.department || 'Manipal University Jaipur'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Link to="/dashboard" className="btn btn-outline btn-sm">
              View All My Disclosures <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 18px',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem', color: '#0369a1' }}>
            <Info size={18} />
            <span>
              <strong>Institutional Disclosure Mode:</strong> You can draft technical details below. To save drafts or submit to Coordinator {COORDINATOR.FULL_NAME}, please sign in with your official account.
            </span>
          </div>
          <Link to="/auth/login" className="btn btn-primary btn-sm">
            Sign In with University ID &rarr;
          </Link>
        </div>
      )}

      {/* Main Page Title Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {INSTITUTION.NAME} | {INSTITUTION.DEPARTMENTS.IPR_CELL}
          </div>
          <h1 style={{ fontSize: '1.75rem', margin: '4px 0 6px', color: 'var(--text-primary)' }}>
            Patent Application Workspace
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
            Write, edit, draft, and submit your intellectual property disclosure. Submitted applications are screened directly by Patent Coordinator {COORDINATOR.FULL_NAME}.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleStartFreshApplication}
            className="btn btn-outline btn-sm"
            title="Start writing a new disclosure"
          >
            <PlusCircle size={14} /> Start New Application
          </button>
          <button
            type="button"
            onClick={loadActiveApplication}
            className="btn btn-outline btn-sm"
            title="Reload latest status"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div
          className={`alert ${
            feedback.type === 'success'
              ? 'alert-success'
              : feedback.type === 'error'
              ? 'alert-danger'
              : 'alert-info'
          }`}
          style={{ marginBottom: '24px' }}
        >
          {feedback.type === 'success' && <CheckCircle2 size={18} />}
          {feedback.type === 'error' && <AlertTriangle size={18} />}
          {feedback.type === 'info' && <Info size={18} />}
          <div>{feedback.text}</div>
        </div>
      )}

      {/* STATUS BANNER CARD */}
      <div
        className="card"
        style={{
          marginBottom: '28px',
          backgroundColor:
            application?.status === 'corrections_required'
              ? 'var(--color-danger-bg)'
              : application?.status === 'approved_next_stage'
              ? 'var(--color-success-bg)'
              : 'var(--bg-primary)',
          borderColor:
            application?.status === 'corrections_required'
              ? 'var(--color-danger-border)'
              : application?.status === 'approved_next_stage'
              ? 'var(--color-success-border)'
              : 'var(--border-medium)',
        }}
      >
        <div className="card-body">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Application Ref:
              </span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)' }}>
                {application?.reference_number || 'New Unsaved Draft'}
              </strong>
              <span className={getStatusBadgeClass(application?.status || 'draft')}>
                {getStatusDisplayName(application?.status || 'draft')}
              </span>
              {application && (
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Version {application.current_version}
                </span>
              )}
            </div>

            {/* Quick Actions in Status Bar */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {isEditable && (
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="btn btn-outline btn-sm"
                  disabled={isSaving}
                >
                  <Save size={14} />
                  {isSaving ? 'Saving...' : 'Save Draft'}
                </button>
              )}

              {(!application || application.status === 'draft') && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="btn btn-primary btn-sm"
                  disabled={isSaving}
                >
                  <Send size={14} />
                  Submit Application
                </button>
              )}

              {application?.status === 'corrections_required' && (
                <button
                  type="button"
                  onClick={handleResubmit}
                  className="btn btn-danger btn-sm"
                  disabled={isSaving || !confirmResolution}
                >
                  <Send size={14} />
                  Resubmit Application
                </button>
              )}
            </div>
          </div>

          {/* Contextual Status Guidance */}
          {(!application || application.status === 'draft') && (
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              <strong>Draft in Progress:</strong> You can edit and save your invention disclosure at any time. When all required sections are completed, click <strong>"Submit Application"</strong> to forward it to {COORDINATOR.FULL_NAME} for official university screening.
            </p>
          )}

          {application?.status === 'submitted' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <strong>Application Submitted to Coordinator:</strong> Your disclosure has been forwarded to Patent Coordinator {COORDINATOR.FULL_NAME}. The coordinator can review the disclosure, request itemized corrections, or approve it for statutory filing. Editing is locked while awaiting review.
              </p>
              <Link to={`/admin/applications/${application.id}`} className="btn btn-outline btn-sm">
                Open in Coordinator Review <ExternalLink size={12} />
              </Link>
            </div>
          )}

          {application?.status === 'under_review' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <strong>Under Review by {COORDINATOR.FULL_NAME}:</strong> The patent coordinator is actively examining the technical claims, prior art distinctions, and attached files.
              </p>
              <Link to={`/admin/applications/${application.id}`} className="btn btn-outline btn-sm">
                Open in Coordinator Review <ExternalLink size={12} />
              </Link>
            </div>
          )}

          {/* PROMINENT CORRECTION NOTE DISPLAY */}
          {application?.status === 'corrections_required' && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                <AlertTriangle size={18} />
                <strong style={{ fontSize: '0.9375rem' }}>Note from {COORDINATOR.FULL_NAME} (Action Required):</strong>
              </div>

              {application.correction_requests && application.correction_requests.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                  {application.correction_requests.map((corr, idx) => (
                    <div
                      key={corr.id || idx}
                      style={{
                        padding: '12px 14px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--color-danger-border)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-danger)', marginBottom: '4px' }}>
                        {corr.field_name ? `Requested Modification on: ${corr.field_name}` : 'General Reviewer Note'}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                        &ldquo;{corr.comment}&rdquo;
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  The coordinator requested revisions. Please review and update your disclosure fields below.
                </p>
              )}

              <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                The application fields below are unlocked for editing. Update your text, attach revised documents if requested, provide a summary note below, and click <strong>&ldquo;Resubmit Application&rdquo;</strong>.
              </p>

              {/* Resubmission Notes Field */}
              <div
                style={{
                  padding: '14px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label className="form-label">
                    Student Resubmission Note (Explain how you addressed the coordinator&rsquo;s remarks) <span className="required">*</span>
                  </label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="e.g. Elaborated the novelty section with experimental benchmark metrics and clarified the dynamic impedance tuning mechanism as requested."
                    value={resubmissionNote}
                    onChange={(e) => setResubmissionNote(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    id="confirmCheck"
                    type="checkbox"
                    checked={confirmResolution}
                    onChange={(e) => setConfirmResolution(e.target.checked)}
                  />
                  <label htmlFor="confirmCheck" style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    I confirm that I have addressed all coordinator modifications and that the updated disclosure is technically accurate.
                  </label>
                </div>
              </div>
            </div>
          )}

          {application?.status === 'resubmitted' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <strong>Version {application.current_version} Resubmitted:</strong> Your updated application with corrections has been sent back to {COORDINATOR.FULL_NAME} for re-evaluation.
              </p>
              <Link to={`/admin/applications/${application.id}`} className="btn btn-outline btn-sm">
                Open in Coordinator Review <ExternalLink size={12} />
              </Link>
            </div>
          )}

          {application?.status === 'approved_next_stage' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', marginBottom: '6px' }}>
                <CheckCircle2 size={18} />
                <strong style={{ fontSize: '0.9375rem' }}>Application Approved by {COORDINATOR.FULL_NAME}!</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                This disclosure has successfully passed internal university pre-screening and has been authorized for formal patent drafting and statutory Indian Patent Office (IPO) filing preparation.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* INVENTION DISCLOSURE FORM */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        {/* Core Technical Disclosure Card */}
        <div className="card">
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="var(--accent-primary)" />
              <h2 className="card-title">Technical Disclosure Details</h2>
            </div>
            {!isEditable && (
              <span className="badge badge-submitted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={12} /> Read Only (Locked under review)
              </span>
            )}
          </div>

          <div className="card-body">
            {/* 1. Title */}
            <div className="form-group">
              <label className="form-label">
                1. Title of the Invention <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Clear, concise, and technically meaningful title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!isEditable}
                required
              />
              <p className="form-helper">
                Should concisely indicate the subject matter and technical domain without promotional language.
              </p>
            </div>

            {/* 2. Technical Field */}
            <div className="form-group">
              <label className="form-label">
                2. Technical Field <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Embedded Systems, Renewable Energy, Biomedical Telemetry"
                value={technicalField}
                onChange={(e) => setTechnicalField(e.target.value)}
                disabled={!isEditable}
                required
              />
              <p className="form-helper">
                Identify the primary technological domain and industry to which the invention pertains.
              </p>
            </div>

            {/* 3. Background Problem */}
            <div className="form-group">
              <label className="form-label">
                3. Background Problem &amp; Existing Limitations (Prior Art) <span className="required">*</span>
              </label>
              <textarea
                className="form-control"
                rows={4}
                placeholder="Explain the specific technical problem that existing systems or patents fail to solve..."
                value={backgroundProblem}
                onChange={(e) => setBackgroundProblem(e.target.value)}
                disabled={!isEditable}
                required
              />
              <p className="form-helper">
                Explain drawbacks, cost bottlenecks, or performance constraints of known conventional solutions.
              </p>
            </div>

            {/* 4. Detailed Description */}
            <div className="form-group">
              <label className="form-label">
                4. Detailed Technical Description of the Invention <span className="required">*</span>
              </label>
              <textarea
                className="form-control"
                rows={6}
                placeholder="Describe the structural components, system architecture, electrical/mechanical schematics, and functional mechanism..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isEditable}
                required
              />
              <p className="form-helper">
                Provide sufficient detail to enable a skilled practitioner in the domain to reproduce the invention.
              </p>
            </div>

            {/* 5. Novelty Features */}
            <div className="form-group">
              <label className="form-label">
                5. Novelty &amp; Inventive Step (What makes it new?) <span className="required">*</span>
              </label>
              <textarea
                className="form-control"
                rows={4}
                placeholder="Explicitly list the unique characteristics, algorithms, or structures that distinguish this invention from all prior work..."
                value={noveltyFeatures}
                onChange={(e) => setNoveltyFeatures(e.target.value)}
                disabled={!isEditable}
                required
              />
              <p className="form-helper">
                This section is scrutinized by {COORDINATOR.FULL_NAME} to evaluate non-obviousness and absolute novelty under Indian patent law.
              </p>
            </div>

            {/* 6. Practical Applications */}
            <div className="form-group">
              <label className="form-label">
                6. Practical Applications &amp; Industrial Applicability
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Target commercial industries, practical implementations, and industrial utility..."
                value={practicalApplications}
                onChange={(e) => setPracticalApplications(e.target.value)}
                disabled={!isEditable}
              />
            </div>
          </div>
        </div>

        {/* Inventors Roster Card */}
        <div className="card">
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--accent-primary)" />
              <h2 className="card-title">Inventors Roster ({inventors.length})</h2>
            </div>
            {isEditable && (
              <button
                type="button"
                onClick={handleAddInventor}
                className="btn btn-outline btn-sm"
              >
                <PlusCircle size={14} /> Add Co-Inventor
              </button>
            )}
          </div>

          <div className="card-body">
            {inventors.map((inv, idx) => (
              <div
                key={idx}
                style={{
                  padding: '16px',
                  backgroundColor: inv.is_primary ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '0.875rem' }}>
                      Inventor #{idx + 1}: {inv.full_name || 'Unnamed'}
                    </strong>
                    {inv.is_primary && (
                      <span className="badge badge-submitted">Primary Applicant</span>
                    )}
                  </div>
                  {isEditable && !inv.is_primary && (
                    <button
                      type="button"
                      onClick={() => handleRemoveInventor(idx)}
                      className="btn btn-outline btn-sm"
                      style={{ color: 'var(--color-danger)' }}
                      title="Remove co-inventor"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>

                <div className="grid-3" style={{ gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Full Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={inv.full_name || ''}
                      onChange={(e) => handleUpdateInventor(idx, 'full_name', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>University Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={inv.email || ''}
                      onChange={(e) => handleUpdateInventor(idx, 'email', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Affiliation</label>
                    <select
                      className="form-control"
                      value={inv.affiliation_type || 'student'}
                      onChange={(e) => handleUpdateInventor(idx, 'affiliation_type', e.target.value)}
                      disabled={!isEditable}
                    >
                      <option value="student">Student</option>
                      <option value="faculty">Faculty Member</option>
                      <option value="research_scholar">Research Scholar</option>
                      <option value="external">External Collaborator</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Department</label>
                    <input
                      type="text"
                      className="form-control"
                      value={inv.department || ''}
                      onChange={(e) => handleUpdateInventor(idx, 'department', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Contact Phone</label>
                    <input
                      type="tel"
                      className="form-control"
                      value={inv.phone || ''}
                      onChange={(e) => handleUpdateInventor(idx, 'phone', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Document Attachments Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Attached Technical Documents &amp; Drawings</h2>
          </div>

          <div className="card-body">
            {/* Existing Documents List */}
            {application?.application_documents && application.application_documents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {application.application_documents.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-light)',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.875rem' }}>{doc.original_filename}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Category: <strong>{doc.document_category}</strong> | Size: {(doc.file_size_bytes / 1024).toFixed(1)} KB | Uploaded: {new Date(doc.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={async () => {
                          const url = await getSignedDocumentUrl(doc.storage_path);
                          window.open(url, '_blank');
                        }}
                        className="btn btn-outline btn-sm"
                        title="Download / View document"
                      >
                        <ExternalLink size={13} /> View
                      </button>
                      {isEditable && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="btn btn-outline btn-sm"
                          style={{ color: 'var(--color-danger)' }}
                          title="Delete document"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                No technical specifications or drawings attached yet.
              </p>
            )}

            {/* Upload Attachment Control */}
            {isEditable && (
              <div
                style={{
                  padding: '14px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <h4 style={{ fontSize: '0.875rem', margin: '0 0 10px' }}>Attach New Document</h4>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    className="form-control"
                    style={{ width: 'auto' }}
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                  >
                    <option value="complete_specification">Complete Specification (PDF / DOCX)</option>
                    <option value="drawings">Technical Drawings / Flowcharts (PDF / PNG)</option>
                    <option value="prior_art">Prior Art Comparison (PDF)</option>
                    <option value="declaration">Inventor Declaration / NOC (PDF)</option>
                  </select>

                  <input
                    type="file"
                    className="form-control"
                    style={{ width: 'auto', flex: 1 }}
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />

                  <button
                    type="button"
                    onClick={handleUploadDocument}
                    className="btn btn-outline btn-sm"
                    disabled={!uploadFile || isUploadingDoc || !application}
                  >
                    <Upload size={14} />
                    {isUploadingDoc ? 'Uploading...' : 'Upload File'}
                  </button>
                </div>
                {!application && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Save draft first to enable file attachments.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div
          className="card"
          style={{
            position: 'sticky',
            bottom: '16px',
            boxShadow: 'var(--shadow-md)',
            borderTop: '2px solid var(--accent-primary)',
          }}
        >
          <div
            className="card-body"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '16px 24px',
            }}
          >
            <div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Status: </span>
              <strong>{getStatusDisplayName(application?.status || 'draft')}</strong>
              {application && (
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  (Ref: {application.reference_number})
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {isEditable && (
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="btn btn-outline"
                  disabled={isSaving}
                >
                  <Save size={16} />
                  {isSaving ? 'Saving Draft...' : 'Save Draft Progress'}
                </button>
              )}

              {(!application || application.status === 'draft') && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="btn btn-primary"
                  disabled={isSaving}
                >
                  <Send size={16} />
                  {isSaving ? 'Submitting...' : 'Submit Application to Coordinator'}
                </button>
              )}

              {application?.status === 'corrections_required' && (
                <button
                  type="button"
                  onClick={handleResubmit}
                  className="btn btn-danger"
                  disabled={isSaving || !confirmResolution}
                >
                  <Send size={16} />
                  {isSaving ? 'Resubmitting...' : `Resubmit Application (v${application.current_version + 1})`}
                </button>
              )}

              {application && application.status !== 'draft' && application.status !== 'corrections_required' && (
                <Link
                  to="/admin/dashboard"
                  className="btn btn-secondary"
                >
                  <Shield size={16} /> Open in Coordinator Registry
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
