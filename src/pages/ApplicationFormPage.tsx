import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import {
  fetchApplicationById,
  saveDraftApplication,
  submitApplication,
  uploadDocument,
} from '../lib/api';
import type { DocumentCategory, Inventor } from '../types/database.types';
import { applicationFormSchema } from '../features/applications/schemas';
import {
  UserPlus,
  Trash2,
  Upload,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Save,
  Send,
} from 'lucide-react';

export const ApplicationFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);

  // Application Form State
  const [appId, setAppId] = useState<string | undefined>(id);
  const [referenceNumber, setReferenceNumber] = useState<string>('Auto-generated upon save');
  const [applicantName, setApplicantName] = useState<string>(currentUser?.full_name || '');
  const [applicantEmail, setApplicantEmail] = useState<string>(currentUser?.university_email || '');
  const [applicantDepartment, setApplicantDepartment] = useState<string>(currentUser?.department || '');
  const [applicantRegNumber, setApplicantRegNumber] = useState<string>(currentUser?.registration_number || '');
  const [applicantPhone, setApplicantPhone] = useState<string>(currentUser?.phone || '');

  // Auto-sync applicant fields when profile loads
  useEffect(() => {
    if (currentUser) {
      setApplicantName((p) => p || currentUser.full_name || '');
      setApplicantEmail((p) => p || currentUser.university_email || '');
      setApplicantDepartment((p) => p || currentUser.department || '');
      setApplicantRegNumber((p) => p || currentUser.registration_number || '');
      setApplicantPhone((p) => p || currentUser.phone || '');
    }
  }, [currentUser]);

  const FORM_STAGES = [
    { id: 1, name: 'Applicant' },
    { id: 2, name: 'Inventors' },
    { id: 3, name: 'Title & Field' },
    { id: 4, name: 'Problem' },
    { id: 5, name: 'Technical & Novelty' },
    { id: 6, name: 'Practical Use' },
    { id: 7, name: 'Documents' },
    { id: 8, name: 'Review & Submit' },
  ];

  const validateStep = (stepNumber: number): boolean => {
    const errors: Record<string, string> = {};

    if (stepNumber === 1) {
      if (!applicantName || applicantName.trim().length < 2) {
        errors.applicant_name = 'Full legal name is required (minimum 2 characters).';
      }
      if (!applicantEmail || !applicantEmail.includes('@')) {
        errors.applicant_email = 'Valid university email is required.';
      }
      if (!applicantDepartment || applicantDepartment.trim().length < 2) {
        errors.applicant_department = 'Department / School is required.';
      }
      if (!applicantRegNumber || applicantRegNumber.trim().length < 2) {
        errors.applicant_registration_number = 'Registration / Roll / Employee number is required.';
      }
      if (!applicantPhone || applicantPhone.trim().length < 10) {
        errors.applicant_phone = 'Contact phone number must have at least 10 digits.';
      }
    } else if (stepNumber === 2) {
      if (inventors.length === 0) {
        errors.inventors = 'At least one inventor must be registered.';
      } else {
        inventors.forEach((inv, idx) => {
          if (!inv.full_name || inv.full_name.trim().length < 2) {
            errors[`inventor_${idx}_name`] = `Inventor #${idx + 1} name is required.`;
          }
          if (!inv.email || !inv.email.includes('@')) {
            errors[`inventor_${idx}_email`] = `Inventor #${idx + 1} valid email is required.`;
          }
        });
      }
    } else if (stepNumber === 3) {
      if (!title || title.trim().length < 5) {
        errors.title = 'Invention title must be at least 5 characters.';
      }
      if (!technicalField || technicalField.trim().length < 3) {
        errors.technical_field = 'Technical domain / field is required (minimum 3 characters).';
      }
    } else if (stepNumber === 4) {
      if (!backgroundProblem || backgroundProblem.trim().length < 20) {
        errors.background_problem = 'Please provide an adequate problem statement (minimum 20 characters).';
      }
    } else if (stepNumber === 5) {
      if (!description || description.trim().length < 30) {
        errors.description = 'Please articulate the detailed technical disclosure (minimum 30 characters).';
      }
      if (!noveltyFeatures || noveltyFeatures.trim().length < 20) {
        errors.novelty_features = 'Please define the novel and inventive features (minimum 20 characters).';
      }
    } else if (stepNumber === 6) {
      if (!practicalApplications || practicalApplications.trim().length < 20) {
        errors.practical_applications = 'Please describe industrial or practical utility (minimum 20 characters).';
      }
    } else if (stepNumber === 7) {
      if (uploadedDocs.length === 0) {
        errors.documents = 'At least one technical specification document (PDF/DOCX) or drawing must be attached.';
      }
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFeedbackMessage({
        type: 'error',
        text: Object.values(errors)[0],
      });
      return false;
    }

    setFeedbackMessage(null);
    return true;
  };

  const handleNextStep = (targetStep: number) => {
    if (targetStep > currentStep) {
      if (!validateStep(currentStep)) return;
    }
    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [title, setTitle] = useState<string>('');
  const [technicalField, setTechnicalField] = useState<string>('');
  const [backgroundProblem, setBackgroundProblem] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [noveltyFeatures, setNoveltyFeatures] = useState<string>('');
  const [practicalApplications, setPracticalApplications] = useState<string>('');

  // Inventors Array
  const [inventors, setInventors] = useState<Partial<Inventor>[]>([
    {
      full_name: currentUser?.full_name || '',
      email: currentUser?.university_email || '',
      phone: currentUser?.phone || '',
      affiliation_type: 'student',
      department: currentUser?.department || 'Technology & Sciences',
      is_primary: true,
      order_index: 0,
    },
  ]);

  // Uploaded Documents state
  const [uploadedDocs, setUploadedDocs] = useState<{ id: string; category: DocumentCategory; filename: string; size: number }[]>([]);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);

  // Load existing application if editing
  useEffect(() => {
    async function loadExisting() {
      if (!id || !currentUser) return;
      try {
        const app = await fetchApplicationById(id, currentUser);
        if (app) {
          if (app.status !== 'draft') {
            navigate(`/applications/${id}`, { replace: true });
            return;
          }
          setAppId(app.id);
          setReferenceNumber(app.reference_number);
          setTitle(app.title || '');
          setTechnicalField(app.technical_field || '');
          setBackgroundProblem(app.background_problem || '');
          setDescription(app.description || '');
          setNoveltyFeatures(app.novelty_features || '');
          setPracticalApplications(app.practical_applications || '');

          if (app.inventors && app.inventors.length > 0) {
            setInventors(app.inventors);
          }
          if (app.application_documents) {
            setUploadedDocs(
              app.application_documents.map((d) => ({
                id: d.id,
                category: d.document_category,
                filename: d.original_filename,
                size: d.file_size_bytes,
              }))
            );
          }
        }
      } catch (err) {
        console.error('Failed to load application:', err);
      }
    }

    loadExisting();
  }, [id, currentUser, navigate]);

  // Handle adding an inventor
  const addInventor = () => {
    setInventors([
      ...inventors,
      {
        full_name: '',
        email: '',
        phone: '',
        affiliation_type: 'student',
        department: '',
        is_primary: false,
        order_index: inventors.length,
      },
    ]);
  };

  const removeInventor = (index: number) => {
    if (inventors.length <= 1) return;
    setInventors(inventors.filter((_, idx) => idx !== index));
  };

  const updateInventor = (index: number, field: keyof Inventor, value: unknown) => {
    const updated = [...inventors];
    updated[index] = { ...updated[index], [field]: value };
    setInventors(updated);
  };

  // Draft Save Handler
  const handleSaveDraft = async () => {
    if (!currentUser) return;
    setIsSavingDraft(true);
    setFeedbackMessage(null);
    try {
      const saved = await saveDraftApplication(
        {
          id: appId,
          title: title || 'Untitled Invention Draft',
          technical_field: technicalField,
          background_problem: backgroundProblem,
          description: description,
          novelty_features: noveltyFeatures,
          practical_applications: practicalApplications,
        },
        inventors,
        currentUser.id
      );

      setAppId(saved.id);
      setReferenceNumber(saved.reference_number);
      setFeedbackMessage({
        type: 'success',
        text: `Draft successfully saved (${saved.reference_number}). You may return anytime to complete it.`,
      });
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save draft',
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Document Upload Handler
  const handleFileUpload = async (category: DocumentCategory, file: File) => {
    if (!currentUser) return;
    setUploadingCategory(category);
    setFeedbackMessage(null);

    try {
      // If application doesn't have an ID yet, save draft first
      let currentAppId = appId;
      if (!currentAppId) {
        const saved = await saveDraftApplication(
          {
            title: title || 'Untitled Invention Draft',
            technical_field: technicalField,
            background_problem: backgroundProblem,
            description: description,
            novelty_features: noveltyFeatures,
            practical_applications: practicalApplications,
          },
          inventors,
          currentUser.id
        );
        currentAppId = saved.id;
        setAppId(saved.id);
        setReferenceNumber(saved.reference_number);
      }

      const doc = await uploadDocument(currentAppId, file, category, currentUser.id);
      setUploadedDocs((prev) => [
        ...prev.filter((d) => d.category !== category), // replace if category uploaded
        {
          id: doc.id,
          category: doc.document_category,
          filename: doc.original_filename,
          size: doc.file_size_bytes,
        },
      ]);
      setFeedbackMessage({
        type: 'success',
        text: `File "${file.name}" uploaded successfully and linked to draft.`,
      });
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Upload failed',
      });
    } finally {
      setUploadingCategory(null);
    }
  };

  // Validate and submit
  const handleOpenSubmitReview = () => {
    setFormErrors({});
    const payload = {
      applicant_name: applicantName,
      applicant_email: applicantEmail,
      applicant_department: applicantDepartment,
      applicant_registration_number: applicantRegNumber,
      applicant_phone: applicantPhone,
      title,
      technical_field: technicalField,
      background_problem: backgroundProblem,
      description,
      novelty_features: noveltyFeatures,
      practical_applications: practicalApplications,
      inventors,
    };

    const validation = applicationFormSchema.safeParse(payload);
    if (!validation.success) {
      const flattened = validation.error.flatten().fieldErrors;
      const errorsMap: Record<string, string> = {};
      Object.entries(flattened).forEach(([k, v]) => {
        if (v && v.length > 0) errorsMap[k] = v[0];
      });
      setFormErrors(errorsMap);
      
      // Auto-navigate to earliest section with missing requirements
      if (errorsMap.applicant_name || errorsMap.applicant_email || errorsMap.applicant_department || errorsMap.applicant_registration_number || errorsMap.applicant_phone) {
        setCurrentStep(1);
      } else if (Object.keys(errorsMap).some(k => k.startsWith('inventors') || k.startsWith('inventor'))) {
        setCurrentStep(2);
      } else if (errorsMap.title || errorsMap.technical_field) {
        setCurrentStep(3);
      } else if (errorsMap.background_problem) {
        setCurrentStep(4);
      } else if (errorsMap.description || errorsMap.novelty_features) {
        setCurrentStep(5);
      } else if (errorsMap.practical_applications) {
        setCurrentStep(6);
      }

      setFeedbackMessage({
        type: 'error',
        text: Object.values(errorsMap)[0] || 'Please complete mandatory form fields before submitting.',
      });
      return;
    }

    if (uploadedDocs.length === 0) {
      setFeedbackMessage({
        type: 'error',
        text: 'At least one technical specification document (PDF) must be uploaded.',
      });
      return;
    }

    setShowSubmitModal(true);
  };

  const handleConfirmFinalSubmit = async () => {
    if (!currentUser) return;
    setIsSubmitting(true);
    setFeedbackMessage(null);

    try {
      // Ensure latest data is saved
      const saved = await saveDraftApplication(
        {
          id: appId,
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

      await submitApplication(saved.id, currentUser.id, 'Student completed formal submission.');
      navigate(`/applications/${saved.id}`, { replace: true });
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Submission failed',
      });
      setShowSubmitModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container container-narrow">
      {/* Top Banner and Breadcrumbs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <Link to="/dashboard" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            &larr; Back to Dashboard
          </Link>
          <h1 style={{ fontSize: '1.5rem', marginTop: '6px' }}>Patent Application Form</h1>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Reference: <strong style={{ fontFamily: 'var(--font-mono)' }}>{referenceNumber}</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveDraft}
          className="btn btn-outline"
          disabled={isSavingDraft}
        >
          <Save size={16} />
          {isSavingDraft ? 'Saving Draft...' : 'Save Incomplete Draft'}
        </button>
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

      {/* Redesigned Responsive Stage Navigation Track */}
      <div style={{ marginBottom: '28px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Stage {currentStep} of {FORM_STAGES.length}: {FORM_STAGES[currentStep - 1].name}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            {Math.round((currentStep / FORM_STAGES.length) * 100)}% Completed
          </span>
        </div>

        {/* Progress bar line */}
        <div style={{ width: '100%', height: '5px', backgroundColor: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{ width: `${(currentStep / FORM_STAGES.length) * 100}%`, height: '100%', backgroundColor: 'var(--accent-primary)', transition: 'width 0.25s ease' }} />
        </div>

        {/* Step pill buttons (horizontally scrollable without truncation) */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {FORM_STAGES.map((s) => {
            const isActive = currentStep === s.id;
            const isCompleted = currentStep > s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleNextStep(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--border-light)',
                  backgroundColor: isActive ? 'var(--accent-primary)' : isCompleted ? '#ffffff' : 'transparent',
                  color: isActive ? '#ffffff' : isCompleted ? 'var(--color-success)' : 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: isActive ? 700 : 500,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 2px 6px rgba(10,25,47,0.15)' : 'none',
                }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isActive ? '#ffffff' : isCompleted ? 'var(--color-success)' : 'var(--border-light)',
                    color: isActive ? 'var(--accent-primary)' : '#ffffff',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                  }}
                >
                  {isCompleted ? '✓' : s.id}
                </span>
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 1: Applicant Information */}
      {currentStep === 1 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Section 1: Primary Applicant Details</h3>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Institutional Record</span>
          </div>
          <div className="card-body">
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">
                  Full Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className={`form-control ${formErrors.applicant_name ? 'has-error' : ''}`}
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  placeholder="e.g. Aditya Sharma"
                />
                {formErrors.applicant_name && <div className="form-error">{formErrors.applicant_name}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">
                  University Email <span className="required">*</span>
                </label>
                <input
                  type="email"
                  className={`form-control ${formErrors.applicant_email ? 'has-error' : ''}`}
                  value={applicantEmail}
                  onChange={(e) => setApplicantEmail(e.target.value)}
                  placeholder="aditya.sharma@muj.manipal.edu"
                />
                {formErrors.applicant_email && <div className="form-error">{formErrors.applicant_email}</div>}
              </div>
            </div>

            <div className="grid-3">
              <div className="form-group">
                <label className="form-label">
                  Department / School <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className={`form-control ${formErrors.applicant_department ? 'has-error' : ''}`}
                  value={applicantDepartment}
                  onChange={(e) => setApplicantDepartment(e.target.value)}
                  placeholder="e.g. Computer Science"
                />
                {formErrors.applicant_department && (
                  <div className="form-error">{formErrors.applicant_department}</div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">
                  Registration / Roll No. <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className={`form-control ${formErrors.applicant_registration_number ? 'has-error' : ''}`}
                  value={applicantRegNumber}
                  onChange={(e) => setApplicantRegNumber(e.target.value)}
                  placeholder="e.g. 219301045"
                />
                {formErrors.applicant_registration_number && (
                  <div className="form-error">{formErrors.applicant_registration_number}</div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">
                  Contact Phone <span className="required">*</span>
                </label>
                <input
                  type="tel"
                  className={`form-control ${formErrors.applicant_phone ? 'has-error' : ''}`}
                  value={applicantPhone}
                  onChange={(e) => setApplicantPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                />
                {formErrors.applicant_phone && <div className="form-error">{formErrors.applicant_phone}</div>}
              </div>
            </div>
          </div>
          <div className="card-footer">
            <button type="button" onClick={() => handleNextStep(2)} className="btn btn-primary">
              Next: Inventor Information
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Inventor Information */}
      {currentStep === 2 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Section 2: Inventor Details</h3>
            <button type="button" onClick={addInventor} className="btn btn-outline btn-sm">
              <UserPlus size={14} />
              Add Co-Inventor
            </button>
          </div>
          <div className="card-body">
            <p style={{ marginBottom: '20px', fontSize: '0.875rem' }}>
              Specify all students, faculty guides, or research collaborators who contributed technically to the invention.
            </p>

            {inventors.map((inv, idx) => (
              <div
                key={idx}
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Inventor #{idx + 1} {inv.is_primary ? '(Lead / Primary)' : '(Co-Inventor)'}
                  </span>
                  {inventors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInventor(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={inv.full_name || ''}
                      onChange={(e) => updateInventor(idx, 'full_name', e.target.value)}
                      placeholder="Full Name"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">University Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={inv.email || ''}
                      onChange={(e) => updateInventor(idx, 'email', e.target.value)}
                      placeholder="email@muj.manipal.edu"
                    />
                  </div>
                </div>

                <div className="grid-3">
                  <div className="form-group">
                    <label className="form-label">Affiliation</label>
                    <select
                      className="form-control"
                      value={inv.affiliation_type || 'student'}
                      onChange={(e) => updateInventor(idx, 'affiliation_type', e.target.value)}
                    >
                      <option value="student">Student</option>
                      <option value="faculty">Faculty / Guide</option>
                      <option value="external">External Collaborator</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <input
                      type="text"
                      className="form-control"
                      value={inv.department || ''}
                      onChange={(e) => updateInventor(idx, 'department', e.target.value)}
                      placeholder="e.g. Mechanical Engineering"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input
                      type="tel"
                      className="form-control"
                      value={inv.phone || ''}
                      onChange={(e) => updateInventor(idx, 'phone', e.target.value)}
                      placeholder="+91..."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="card-footer">
            <button type="button" onClick={() => handleNextStep(1)} className="btn btn-outline">
              <ArrowLeft size={16} /> Previous
            </button>
            <button type="button" onClick={() => handleNextStep(3)} className="btn btn-primary">
              Next: Invention Title <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Invention Title & Field */}
      {currentStep === 3 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Section 3: Title and Technical Field</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">
                Invention Title <span className="required">*</span>
              </label>
              <input
                type="text"
                className={`form-control ${formErrors.title ? 'has-error' : ''}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Adaptive Energy Harvesting Micro-Controller for Remote IoT Sensors"
              />
              <p className="form-helper">
                Must be clear, technical, and concise. Avoid promotional language or trade names.
              </p>
              {formErrors.title && <div className="form-error">{formErrors.title}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">
                Technical Domain / Classification Field <span className="required">*</span>
              </label>
              <input
                type="text"
                className={`form-control ${formErrors.technical_field ? 'has-error' : ''}`}
                value={technicalField}
                onChange={(e) => setTechnicalField(e.target.value)}
                placeholder="e.g. Embedded Electronics, Mechanical Vibration Transducers"
              />
              {formErrors.technical_field && <div className="form-error">{formErrors.technical_field}</div>}
            </div>
          </div>
          <div className="card-footer">
            <button type="button" onClick={() => handleNextStep(2)} className="btn btn-outline">
              <ArrowLeft size={16} /> Previous
            </button>
            <button type="button" onClick={() => handleNextStep(4)} className="btn btn-primary">
              Next: Problem Statement <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Background and Problem Statement */}
      {currentStep === 4 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Section 4: Background and Technical Problem</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">
                Prior Art Limitations and Problem Statement <span className="required">*</span>
              </label>
              <textarea
                className={`form-control ${formErrors.background_problem ? 'has-error' : ''}`}
                rows={6}
                value={backgroundProblem}
                onChange={(e) => setBackgroundProblem(e.target.value)}
                placeholder="Describe existing solutions, prior art limitations, and the precise technical challenge this invention solves."
              />
              <p className="form-helper">Minimum 20 characters.</p>
              {formErrors.background_problem && (
                <div className="form-error">{formErrors.background_problem}</div>
              )}
            </div>
          </div>
          <div className="card-footer">
            <button type="button" onClick={() => handleNextStep(3)} className="btn btn-outline">
              <ArrowLeft size={16} /> Previous
            </button>
            <button type="button" onClick={() => handleNextStep(5)} className="btn btn-primary">
              Next: Description & Novelty <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Description and Novelty */}
      {currentStep === 5 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Section 5: Detailed Description and Novelty</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">
                Detailed Technical Description <span className="required">*</span>
              </label>
              <textarea
                className={`form-control ${formErrors.description ? 'has-error' : ''}`}
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide a comprehensive explanation of how the system/device operates, key components, and underlying mechanism."
              />
              {formErrors.description && <div className="form-error">{formErrors.description}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">
                Distinguishing Novel Features <span className="required">*</span>
              </label>
              <textarea
                className={`form-control ${formErrors.novelty_features ? 'has-error' : ''}`}
                rows={4}
                value={noveltyFeatures}
                onChange={(e) => setNoveltyFeatures(e.target.value)}
                placeholder="Articulate explicitly what makes this invention novel over known state-of-the-art solutions."
              />
              {formErrors.novelty_features && <div className="form-error">{formErrors.novelty_features}</div>}
            </div>
          </div>
          <div className="card-footer">
            <button type="button" onClick={() => handleNextStep(4)} className="btn btn-outline">
              <ArrowLeft size={16} /> Previous
            </button>
            <button type="button" onClick={() => handleNextStep(6)} className="btn btn-primary">
              Next: Practical Use <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: Practical Applications */}
      {currentStep === 6 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Section 6: Industrial Utility and Practical Applications</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">
                Proposed Applications & Commercial Utility <span className="required">*</span>
              </label>
              <textarea
                className={`form-control ${formErrors.practical_applications ? 'has-error' : ''}`}
                rows={5}
                value={practicalApplications}
                onChange={(e) => setPracticalApplications(e.target.value)}
                placeholder="Explain the practical commercial application, target industries, and economic or operational benefits."
              />
              {formErrors.practical_applications && (
                <div className="form-error">{formErrors.practical_applications}</div>
              )}
            </div>
          </div>
          <div className="card-footer">
            <button type="button" onClick={() => handleNextStep(5)} className="btn btn-outline">
              <ArrowLeft size={16} /> Previous
            </button>
            <button type="button" onClick={() => handleNextStep(7)} className="btn btn-primary">
              Next: Supporting Documents <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 7: Supporting Documents */}
      {currentStep === 7 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Section 7: Private Document Attachments</h3>
          </div>
          <div className="card-body">
            <p style={{ fontSize: '0.875rem', marginBottom: '20px' }}>
              Upload technical documents into private institutional storage. Permitted formats: PDF, DOCX, PNG, JPEG. Maximum file size: 25 MB per document.
            </p>

            {/* Document Upload Slots */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Complete Spec */}
              <div
                style={{
                  border: '1px solid var(--border-light)',
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '0.9375rem' }}>1. Complete Specification / Write-up (PDF/DOCX)</strong>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      Detailed write-up containing abstract, claims, and method.
                    </div>
                  </div>
                  <div>
                    <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                      <Upload size={14} />
                      {uploadingCategory === 'complete_specification' ? 'Uploading...' : 'Choose File'}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleFileUpload('complete_specification', e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
                {uploadedDocs.find((d) => d.category === 'complete_specification') && (
                  <div style={{ marginTop: '10px', fontSize: '0.8125rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} />
                    Attached: {uploadedDocs.find((d) => d.category === 'complete_specification')?.filename} (
                    {(
                      (uploadedDocs.find((d) => d.category === 'complete_specification')?.size || 0) /
                      (1024 * 1024)
                    ).toFixed(2)}{' '}
                    MB)
                  </div>
                )}
              </div>

              {/* Technical Drawings */}
              <div
                style={{
                  border: '1px solid var(--border-light)',
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '0.9375rem' }}>2. Technical Drawings / Circuit Diagrams (PNG/PDF)</strong>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      Schematics, block diagrams, flowcharts, or CAD views.
                    </div>
                  </div>
                  <div>
                    <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                      <Upload size={14} />
                      {uploadingCategory === 'drawings' ? 'Uploading...' : 'Choose File'}
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleFileUpload('drawings', e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
                {uploadedDocs.find((d) => d.category === 'drawings') && (
                  <div style={{ marginTop: '10px', fontSize: '0.8125rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} />
                    Attached: {uploadedDocs.find((d) => d.category === 'drawings')?.filename}
                  </div>
                )}
              </div>

              {/* Declarations */}
              <div
                style={{
                  border: '1px solid var(--border-light)',
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '0.9375rem' }}>3. Faculty NOC or Student Declarations (PDF)</strong>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      Institutional disclosure declaration or guide concurrence.
                    </div>
                  </div>
                  <div>
                    <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                      <Upload size={14} />
                      {uploadingCategory === 'declaration' ? 'Uploading...' : 'Choose File'}
                      <input
                        type="file"
                        accept=".pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleFileUpload('declaration', e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
                {uploadedDocs.find((d) => d.category === 'declaration') && (
                  <div style={{ marginTop: '10px', fontSize: '0.8125rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} />
                    Attached: {uploadedDocs.find((d) => d.category === 'declaration')?.filename}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="card-footer">
            <button type="button" onClick={() => handleNextStep(6)} className="btn btn-outline">
              <ArrowLeft size={16} /> Previous
            </button>
            <button type="button" onClick={() => handleNextStep(8)} className="btn btn-primary">
              Next: Review & Submit <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 8: Review & Pre-Submission Summary */}
      {currentStep === 8 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Section 8: Pre-Submission Review</h3>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Verify all details before final transmission
            </span>
          </div>
          <div className="card-body">
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Invention Title</h4>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.0625rem' }}>
                {title || 'No title entered'}
              </p>
            </div>

            <div className="grid-2" style={{ marginBottom: '20px' }}>
              <div>
                <h4 style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Technical Field</h4>
                <p>{technicalField || 'Not specified'}</p>
              </div>
              <div>
                <h4 style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Inventors Count</h4>
                <p>{inventors.length} inventor(s) registered</p>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Problem Statement</h4>
              <p>{backgroundProblem || 'Not provided'}</p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Uploaded Documents</h4>
              {uploadedDocs.length === 0 ? (
                <p style={{ color: 'var(--color-danger)' }}>No documents attached yet.</p>
              ) : (
                <ul style={{ paddingLeft: '20px', fontSize: '0.875rem' }}>
                  {uploadedDocs.map((d) => (
                    <li key={d.id}>
                      {d.filename} ({d.category})
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-light)',
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
              }}
            >
              <strong>Institutional Confirmation:</strong> By clicking "Submit Application", your disclosure will be submitted to the Patent Review Cell for official screening. Once submitted, editing will be locked until the coordinator requests corrections or opens a revision cycle.
            </div>
          </div>
          <div className="card-footer">
            <button type="button" onClick={() => handleNextStep(7)} className="btn btn-outline">
              <ArrowLeft size={16} /> Previous
            </button>
            <button
              type="button"
              onClick={handleOpenSubmitReview}
              className="btn btn-primary"
            >
              <Send size={16} />
              Submit Application
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showSubmitModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="card-header">
              <h3 className="card-title">Confirm Submission to Patent Coordinator</h3>
            </div>
            <div className="card-body">
              <p style={{ marginBottom: '16px' }}>
                Are you sure you want to submit application <strong>{referenceNumber}</strong> for formal university screening?
              </p>
              <ul style={{ paddingLeft: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <li>Your draft will transition to <strong>Submitted</strong> status.</li>
                <li>The Patent Review Cell will receive access to your disclosure and documents.</li>
                <li>You will be notified in-portal if specific corrections or clarifications are required.</li>
              </ul>
            </div>
            <div className="card-footer">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="btn btn-outline"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFinalSubmit}
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Transmitting...' : 'Confirm and Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
