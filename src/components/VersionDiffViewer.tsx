import React, { useState } from 'react';
import type { Application, ApplicationVersion } from '../types/database.types';
import { GitCompare, ArrowLeft, Clock } from 'lucide-react';

interface VersionDiffViewerProps {
  application: Application;
  versions?: ApplicationVersion[];
  onClose: () => void;
}

export const VersionDiffViewer: React.FC<VersionDiffViewerProps> = ({
  application,
  versions = [],
  onClose,
}) => {
  // Sort versions by version_number ascending
  const sortedVersions = [...versions].sort((a, b) => a.version_number - b.version_number);

  // If there are versions, default base to first (or second to last) and compare to latest
  const defaultBase = sortedVersions.length >= 2 ? sortedVersions[sortedVersions.length - 2].version_number : 1;
  const defaultCompare = sortedVersions.length >= 1 ? sortedVersions[sortedVersions.length - 1].version_number : application.current_version;

  const [baseVerNum, setBaseVerNum] = useState<number>(defaultBase);
  const [compareVerNum, setCompareVerNum] = useState<number>(defaultCompare);

  const getSnapshotForVersion = (verNum: number): Partial<Application> => {
    if (verNum === application.current_version) {
      return application;
    }
    const found = sortedVersions.find((v) => v.version_number === verNum);
    return (found?.snapshot_data as Partial<Application>) || {};
  };

  const baseData = getSnapshotForVersion(baseVerNum);
  const compareData = getSnapshotForVersion(compareVerNum);

  const compareVersionObj = sortedVersions.find((v) => v.version_number === compareVerNum);

  const fieldsToCompare: { label: string; field: keyof Application }[] = [
    { label: 'Invention Title', field: 'title' },
    { label: 'Technical Field & Domain', field: 'technical_field' },
    { label: 'Background Problem & Deficiencies in Prior Art', field: 'background_problem' },
    { label: 'Detailed Working Description', field: 'description' },
    { label: 'Novelty & Inventive Step', field: 'novelty_features' },
    { label: 'Practical Utility & Applications', field: 'practical_applications' },
  ];

  return (
    <div className="card" style={{ marginBottom: '24px', border: '2px solid #204E96', borderRadius: '24px', overflow: 'hidden' }}>
      <div
        className="card-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#FAF7EE',
          borderBottom: '1px solid #EBE5D5',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: '#E8EEF6',
              color: '#204E96',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <GitCompare size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', margin: 0, color: '#0369a1' }}>
              Side-by-Side Version Diff &amp; Amendment Inspector
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Inspect technical disclosure modifications made across resubmission cycles
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button type="button" onClick={onClose} className="btn btn-outline btn-sm">
            <ArrowLeft size={13} /> Exit Diff Inspector
          </button>
        </div>
      </div>

      <div className="card-body">
        {/* Version Selector Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '12px 16px',
            backgroundColor: '#FAF7EE',
            borderRadius: '6px',
            marginBottom: '20px',
            border: '1px solid #EBE5D5',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
              Base Version:
            </span>
            <select
              value={baseVerNum}
              onChange={(e) => setBaseVerNum(Number(e.target.value))}
              style={{
                fontSize: '0.8125rem',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
              }}
            >
              {sortedVersions.map((v) => (
                <option key={`base-${v.version_number}`} value={v.version_number}>
                  Version {v.version_number} ({new Date(v.submitted_at).toLocaleDateString('en-IN')})
                </option>
              ))}
              {!sortedVersions.some((v) => v.version_number === application.current_version) && (
                <option value={application.current_version}>
                  Version {application.current_version} (Current)
                </option>
              )}
            </select>
          </div>

          <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>&rarr;</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0369a1' }}>
              Compare With:
            </span>
            <select
              value={compareVerNum}
              onChange={(e) => setCompareVerNum(Number(e.target.value))}
              style={{
                fontSize: '0.8125rem',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #38bdf8',
                backgroundColor: '#ffffff',
                fontWeight: 600,
                color: '#204E96',
              }}
            >
              {sortedVersions.map((v) => (
                <option key={`compare-${v.version_number}`} value={v.version_number}>
                  Version {v.version_number} ({new Date(v.submitted_at).toLocaleDateString('en-IN')})
                </option>
              ))}
              {!sortedVersions.some((v) => v.version_number === application.current_version) && (
                <option value={application.current_version}>
                  Version {application.current_version} (Current)
                </option>
              )}
            </select>
          </div>

          {compareVersionObj?.submission_notes && (
            <div
              style={{
                marginLeft: 'auto',
                fontSize: '0.75rem',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#ffffff',
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px solid #EBE5D5',
              }}
            >
              <Clock size={12} className="text-slate-500" />
              <span>
                <strong>Applicant Notes:</strong> {compareVersionObj.submission_notes}
              </span>
            </div>
          )}
        </div>

        {/* Comparison Tables / Panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {fieldsToCompare.map(({ label, field }) => {
            const baseVal = String(baseData[field] || '').trim();
            const compareVal = String(compareData[field] || '').trim();
            const hasChanged = baseVal !== compareVal;

            return (
              <div
                key={field}
                style={{
                  border: hasChanged ? '1px solid #fed7aa' : '1px solid #e2e8f0',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: hasChanged ? '#fff7ed' : '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <strong style={{ fontSize: '0.8125rem', color: hasChanged ? '#9a3412' : '#334155' }}>
                    {label}
                  </strong>
                  {hasChanged ? (
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        backgroundColor: '#ffedd5',
                        color: '#c2410c',
                        border: '1px solid #fdba74',
                      }}
                    >
                      Modified in Version {compareVerNum}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        color: '#94a3b8',
                      }}
                    >
                      Unchanged
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0',
                    fontSize: '0.8125rem',
                  }}
                >
                  {/* Base Version Panel */}
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: '#ffffff',
                      borderRight: '1px solid #e2e8f0',
                      whiteSpace: 'pre-wrap',
                      lineHeight: '1.5',
                      color: hasChanged ? '#475569' : '#64748b',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        color: '#94a3b8',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Version {baseVerNum} (Original)
                    </div>
                    {baseVal || <em style={{ color: '#cbd5e1' }}>No content provided</em>}
                  </div>

                  {/* Compare Version Panel */}
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: hasChanged ? '#f0fdf4' : '#ffffff',
                      whiteSpace: 'pre-wrap',
                      lineHeight: '1.5',
                      color: hasChanged ? '#166534' : '#64748b',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        color: hasChanged ? '#15803d' : '#94a3b8',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Version {compareVerNum} (Updated)
                    </div>
                    {compareVal || <em style={{ color: '#cbd5e1' }}>No content provided</em>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
