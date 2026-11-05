import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import {
  fetchApplicationById,
  saveDraftApplication,
  resubmitApplication,
  uploadDocument,
} from '../lib/api';
import type { Application, CorrectionRequest, DocumentCategory } from '../types/database.types';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Upload,
  Send,
} from 'lucide-react';

export const CorrectionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [application, setApplication] = useState<Application | null>(null);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Editable fields
  const [title, setTitle] = useState<string>('');
  const [technicalField, setTechnicalField] = useState<string>('');
  const [backgroundProblem, setBackgroundProblem] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [noveltyFeatures, setNoveltyFeatures] = useState<string>('');
  const [practicalApplications, setPracticalApplications] = useState<string>('');
  const [resubmissionNotes, setResubmissionNotes] = useState<string>('');

  // Confirmation checklist
  const [confirmedChecklist, setConfirmedChecklist] = useState<boolean>(false);
  const [replacingDocCategory, setReplacingDocCategory] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!id || !currentUser) return;
      setIsLoading(true);
      try {
        const app = await fetchApplicationById(id, currentUser);
        if (!app) {
          navigate('/dashboard', { replace: true });
          return;
        }

        if (app.status !== 'corrections_required') {
          // If not in corrections_required, redirect to detail
          navigate(`/applications/${id}`, { replace: true });
          return;
        }

        setApplication(app);
        setTitle(app.title);
        setTechnicalField(app.technical_field);
        setBackgroundProblem(app.background_problem);
        setDescription(app.description);
        setNoveltyFeatures(app.novelty_features);
        setPracticalApplications(app.practical_applications);

        const pending = (app.correction_requests || []).filter((c) => c.status === 'pending');
        setCorrections(pending.length > 0 ? pending : (app.correction_requests || []));
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
  }, [id, currentUser, navigate]);

  const handleDocumentReplace = async (category: DocumentCategory, file: File) => {
    if (!application || !currentUser) return;
    setReplacingDocCategory(category);
    try {
      await uploadDocument(application.id, file, category, currentUser.id);
      setFeedbackMessage({
        type: 'success',
        text: `Replacement document "${file.name}" uploaded successfully for category "${category}".`,
      });
      // Refresh application
      const updated = await fetchApplicationById(application.id, currentUser);
      setApplication(updated);
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload replacement document',
      });
    } finally {
      setReplacingDocCategory(null);
    }
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!application || !currentUser) return;

    if (!confirmedChecklist) {
      setFeedbackMessage({
        type: 'error',
        text: 'Please confirm that you have addressed all requested corrections before resubmitting.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMessage(null);

    try {
      // 1. Update application fields
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
        application.inventors || [],
        currentUser.id
      );

      // 2. Resubmit
      await resubmitApplication(
        application.id,
        currentUser.id,
        resubmissionNotes.trim() || 'Student resolved all itemized correction requests.'
      );

      navigate(`/applications/${application.id}`, { replace: true });
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Resubmission failed',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: '60px', textAlign: 'center' }}>
        <p>Loading correction workspace...</p>
      </div>
    );
  }

  if (!application) return null;

  return (
    <div className="container container-narrow">
      <div style={{ marginBottom: '24px' }}>
        <Link to={`/applications/${application.id}`} style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          &larr; Back to Application Details
        </Link>
        <h1 style={{ fontSize: '1.5rem', marginTop: '6px' }}>Correction Resolution Workspace</h1>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Application Reference: <strong style={{ fontFamily: 'var(--font-mono)' }}>{application.reference_number}</strong> | Version: {application.current_version}
        </p>
      </div>

      {feedbackMessage && (
        <div
          className={`alert ${feedbackMessage.type === 'success' ? 'alert-success' : 'alert-danger'}`}
          style={{ marginBottom: '24px' }}
        >
          {feedbackMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <div>{feedbackMessage.text}</div>
        </div>
      )}

      {/* Reviewer Feedback Summary Card */}
      <div
        className="card"
        style={{
          borderLeft: '4px solid var(--color-danger)',
          marginBottom: '28px',
        }}
      >
        <div className="card-header" style={{ backgroundColor: 'var(--color-danger-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)' }}>
            <AlertTriangle size={18} />
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-danger)' }}>
              Coordinator Correction Requests ({corrections.length} item{corrections.length === 1 ? '' : 's'})
            </h3>
          </div>
        </div>
        <div className="card-body">
          <p style={{ fontSize: '0.875rem', marginBottom: '16px' }}>
            The patent review coordinator has reviewed Version {application.current_version} and requested the following modifications:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {corrections.map((corr, idx) => (
              <div
                key={corr.id}
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '0.8125rem', color: 'var(--color-danger)' }}>
                    Item #{idx + 1}: {corr.field_name ? `Field: ${corr.field_name}` : 'Document Replacement'}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(corr.created_at).toLocaleDateString('en-IN')}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  "{corr.comment}"
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Correction Form */}
      <form onSubmit={handleResubmit}>
        <div className="card" style={{ marginBottom: '28px' }}>
          <div className="card-header">
            <h3 className="card-title">Modify Flagged Disclosure Fields</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Invention Title</label>
              <input
                type="text"
                className="form-control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Technical Field</label>
              <input
                type="text"
                className="form-control"
                value={technicalField}
                onChange={(e) => setTechnicalField(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Problem Statement</label>
              <textarea
                className="form-control"
                rows={5}
                value={backgroundProblem}
                onChange={(e) => setBackgroundProblem(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Detailed Description</label>
              <textarea
                className="form-control"
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Novelty Characteristics</label>
              <textarea
                className="form-control"
                rows={5}
                value={noveltyFeatures}
                onChange={(e) => setNoveltyFeatures(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Practical & Commercial Utility</label>
              <textarea
                className="form-control"
                rows={4}
                value={practicalApplications}
                onChange={(e) => setPracticalApplications(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Replace Documents Card */}
        <div className="card" style={{ marginBottom: '28px' }}>
          <div className="card-header">
            <h3 className="card-title">Replace Attached Documents (If Requested)</h3>
          </div>
          <div className="card-body">
            <p style={{ fontSize: '0.875rem', marginBottom: '16px' }}>
              If the patent review cell requested revised drawings or updated specifications, upload the new files below.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Spec Replacement */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.875rem' }}>Replace Technical Specification</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PDF, DOCX (Max 25MB)</div>
                </div>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={14} />
                  {replacingDocCategory === 'complete_specification' ? 'Uploading...' : 'Upload Revision'}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleDocumentReplace('complete_specification', e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>

              {/* Drawings Replacement */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.875rem' }}>Replace Technical Drawings</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PDF, PNG, JPEG</div>
                </div>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={14} />
                  {replacingDocCategory === 'drawings' ? 'Uploading...' : 'Upload Revision'}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleDocumentReplace('drawings', e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Resubmission Notes and Checklist */}
        <div className="card" style={{ marginBottom: '28px' }}>
          <div className="card-header">
            <h3 className="card-title">Resubmission Summary & Confirmation</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">
                Summary of Changes Made (For Coordinator Review) <span className="required">*</span>
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Explain how each item requested by the patent review cell was addressed in this revision."
                value={resubmissionNotes}
                onChange={(e) => setResubmissionNotes(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '16px' }}>
              <input
                id="confirmCorrections"
                type="checkbox"
                checked={confirmedChecklist}
                onChange={(e) => setConfirmedChecklist(e.target.checked)}
                style={{ marginTop: '4px' }}
                required
              />
              <label htmlFor="confirmCorrections" style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                I confirm that I have addressed all requested modifications in full and verified that the replacement information is technically accurate.
              </label>
            </div>
          </div>
          <div className="card-footer">
            <Link to={`/applications/${application.id}`} className="btn btn-outline">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !confirmedChecklist}
            >
              <Send size={16} />
              {isSubmitting ? 'Resubmitting Version...' : `Resubmit Application as Version ${application.current_version + 1}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
