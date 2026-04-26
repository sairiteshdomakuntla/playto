import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { merchantApi, ApiError } from "../api";
import type { KYCSubmission, SubmissionState } from "../types";
import DocumentUpload from "../components/DocumentUpload";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE_LABELS: Record<SubmissionState, string> = {
  draft: "Draft",
  submitted: "Submitted — Awaiting Review",
  under_review: "Under Review",
  approved: "Approved ✓",
  rejected: "Rejected",
  more_info_requested: "More Info Requested",
};

const STATE_COLORS: Record<SubmissionState, string> = {
  draft: "badge-draft",
  submitted: "badge-submitted",
  under_review: "badge-under_review",
  approved: "badge-approved",
  rejected: "badge-rejected",
  more_info_requested: "badge-more_info_requested",
};

const STEPS = ["Personal Details", "Business Details", "Documents", "Review & Submit"];

const BUSINESS_TYPES = [
  { value: "individual", label: "Individual / Freelancer" },
  { value: "proprietorship", label: "Proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "llp", label: "LLP" },
  { value: "company", label: "Private Limited Company" },
];

const EDITABLE_STATES: SubmissionState[] = ["draft", "more_info_requested"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MerchantKYC() {
  const navigate = useNavigate();
  const username = localStorage.getItem("username") ?? "";

  const [submission, setSubmission] = useState<KYCSubmission | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bizName, setBizName] = useState("");
  const [bizType, setBizType] = useState("individual");
  const [monthlyVolume, setMonthlyVolume] = useState("");

  // ---------------------------------------------------------------------------
  // Load submission on mount
  // ---------------------------------------------------------------------------

  const loadSubmission = useCallback(async () => {
    try {
      const data = await merchantApi.getSubmission();
      setSubmission(data);
      populateForm(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // No submission yet — create a blank draft
        try {
          const data = await merchantApi.createSubmission({
            personal_details: {},
            business_details: {},
          });
          setSubmission(data);
        } catch (createErr) {
          setError("Failed to initialise your KYC application.");
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubmission();
  }, [loadSubmission]);

  function populateForm(data: KYCSubmission) {
    const p = data.personal_details;
    const b = data.business_details;
    setName(p.name ?? "");
    setEmail(p.email ?? "");
    setPhone(p.phone ?? "");
    setBizName(b.business_name ?? "");
    setBizType(b.business_type ?? "individual");
    setMonthlyVolume(b.monthly_volume !== undefined ? String(b.monthly_volume) : "");
  }

  // ---------------------------------------------------------------------------
  // Auto-save draft
  // ---------------------------------------------------------------------------

  async function saveDraft() {
    if (!submission) return;
    if (!EDITABLE_STATES.includes(submission.state)) return;
    setSaving(true);
    try {
      const updated = await merchantApi.updateDraft({
        personal_details: { name, email, phone },
        business_details: {
          business_name: bizName,
          business_type: bizType,
          monthly_volume: monthlyVolume ? parseFloat(monthlyVolume) : undefined,
        },
      });
      setSubmission(updated);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch {
      setSaveMsg("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    await saveDraft();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const updated = await merchantApi.submitForReview();
      setSubmission(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    localStorage.clear();
    navigate("/login", { replace: true });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c14] flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading your application…</div>
      </div>
    );
  }

  const isEditable = submission ? EDITABLE_STATES.includes(submission.state) : false;
  const isTerminal =
    submission?.state === "approved" ||
    submission?.state === "rejected" ||
    submission?.state === "submitted" ||
    submission?.state === "under_review";

  return (
    <div className="min-h-screen bg-[#0c0c14]">
      {/* Navbar */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-indigo-700 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white fill-current">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>
            <span className="font-bold text-white text-sm">Playto Pay</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-sm hidden sm:block">@{username}</span>
            {submission && (
              <span className={STATE_COLORS[submission.state]}>
                {STATE_LABELS[submission.state]}
              </span>
            )}
            <button onClick={logout} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Title + save indicator */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">KYC Application</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Complete all steps to start collecting international payments.
            </p>
          </div>
          {saveMsg && (
            <span className="text-xs text-emerald-400 animate-fade-in">{saveMsg}</span>
          )}
        </div>

        {/* Show status banner for non-editable submissions */}
        {submission && isTerminal && (
          <StatusBanner submission={submission} onReloadRequest={loadSubmission} />
        )}

        {/* Steps + content */}
        {isEditable && (
          <>
            {/* Progress steps */}
            <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
              {STEPS.map((label, i) => (
                <div key={i} className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => i < step && setStep(i)}
                    className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                      i === step
                        ? "text-primary"
                        : i < step
                        ? "text-emerald-400 cursor-pointer hover:text-emerald-300"
                        : "text-slate-600 cursor-default"
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                        i === step
                          ? "border-primary bg-primary/20 text-primary"
                          : i < step
                          ? "border-emerald-400 bg-emerald-400/20 text-emerald-400"
                          : "border-slate-700 text-slate-600"
                      }`}
                    >
                      {i < step ? "✓" : i + 1}
                    </span>
                    <span className="hidden sm:block">{label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`w-8 h-px transition-colors ${i < step ? "bg-emerald-400/40" : "bg-slate-700"}`}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Step content */}
            <div className="card animate-fade-in">
              {step === 0 && (
                <PersonalStep
                  name={name} setName={setName}
                  email={email} setEmail={setEmail}
                  phone={phone} setPhone={setPhone}
                  onNext={goNext}
                />
              )}
              {step === 1 && (
                <BusinessStep
                  bizName={bizName} setBizName={setBizName}
                  bizType={bizType} setBizType={setBizType}
                  monthlyVolume={monthlyVolume} setMonthlyVolume={setMonthlyVolume}
                  onBack={() => setStep(0)}
                  onNext={goNext}
                />
              )}
              {step === 2 && submission && (
                <DocumentStep
                  submission={submission}
                  onBack={() => setStep(1)}
                  onNext={async () => {
                    const updated = await merchantApi.getSubmission();
                    setSubmission(updated);
                    setStep(3);
                  }}
                />
              )}
              {step === 3 && submission && (
                <ReviewStep
                  name={name} email={email} phone={phone}
                  bizName={bizName} bizType={bizType} monthlyVolume={monthlyVolume}
                  submission={submission}
                  onBack={() => setStep(2)}
                  onSubmit={handleSubmit}
                  submitting={submitting}
                  error={error}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBanner({
  submission,
  onReloadRequest,
}: {
  submission: KYCSubmission;
  onReloadRequest: () => void;
}) {
  const configs: Record<string, { icon: string; title: string; desc: string; cls: string }> = {
    submitted: {
      icon: "⏳",
      title: "Application Submitted",
      desc: "Your KYC application is in the review queue. We'll notify you once reviewed.",
      cls: "bg-blue-500/10 border-blue-500/20 text-blue-300",
    },
    under_review: {
      icon: "🔍",
      title: "Under Review",
      desc: "A reviewer is currently examining your application.",
      cls: "bg-amber-500/10 border-amber-500/20 text-amber-300",
    },
    approved: {
      icon: "🎉",
      title: "Application Approved!",
      desc: "Congratulations! You are now verified and can start collecting international payments.",
      cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
    },
    rejected: {
      icon: "❌",
      title: "Application Rejected",
      desc: submission.reviewer_note
        ? `Reason: ${submission.reviewer_note}`
        : "Your application was rejected. Please contact support.",
      cls: "bg-red-500/10 border-red-500/20 text-red-300",
    },
    more_info_requested: {
      icon: "📋",
      title: "Additional Information Required",
      desc: submission.reviewer_note || "Please update your application with the requested information.",
      cls: "bg-purple-500/10 border-purple-500/20 text-purple-300",
    },
  };

  const config = configs[submission.state];
  if (!config) return null;

  return (
    <div className={`p-5 rounded-xl border mb-6 animate-fade-in ${config.cls}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{config.icon}</span>
        <div className="flex-1">
          <h2 className="font-semibold text-base">{config.title}</h2>
          <p className="text-sm opacity-80 mt-1">{config.desc}</p>
          {submission.state === "more_info_requested" && (
            <button
              onClick={onReloadRequest}
              className="mt-3 text-sm underline opacity-70 hover:opacity-100"
            >
              Edit and resubmit →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Step 1
function PersonalStep({
  name, setName, email, setEmail, phone, setPhone, onNext,
}: {
  name: string; setName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Personal Details</h2>
      <p className="text-slate-400 text-sm mb-6">Tell us about yourself — the account owner.</p>
      <div className="space-y-4">
        <Field label="Full Name" required>
          <input id="fullName" type="text" value={name} onChange={e => setName(e.target.value)}
            className="input-field" placeholder="Rahul Sharma" />
        </Field>
        <Field label="Business Email" required>
          <input id="bizEmail" type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="input-field" placeholder="rahul@business.com" />
        </Field>
        <Field label="Phone Number" required>
          <input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            className="input-field" placeholder="9876543210" />
        </Field>
      </div>
      <div className="flex justify-end mt-8">
        <button onClick={onNext} disabled={!name || !email || !phone}
          className="btn-primary">
          Save & Continue →
        </button>
      </div>
    </div>
  );
}

// Step 2
function BusinessStep({
  bizName, setBizName, bizType, setBizType, monthlyVolume, setMonthlyVolume,
  onBack, onNext,
}: {
  bizName: string; setBizName: (v: string) => void;
  bizType: string; setBizType: (v: string) => void;
  monthlyVolume: string; setMonthlyVolume: (v: string) => void;
  onBack: () => void; onNext: () => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Business Details</h2>
      <p className="text-slate-400 text-sm mb-6">Information about your business.</p>
      <div className="space-y-4">
        <Field label="Business Name" required>
          <input id="businessName" type="text" value={bizName} onChange={e => setBizName(e.target.value)}
            className="input-field" placeholder="Sharma Exports Pvt Ltd" />
        </Field>
        <Field label="Business Type" required>
          <select id="businessType" value={bizType} onChange={e => setBizType(e.target.value)}
            className="input-field">
            {BUSINESS_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Expected Monthly Volume (USD)" required>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input id="monthlyVolume" type="number" min="0" step="100" value={monthlyVolume}
              onChange={e => setMonthlyVolume(e.target.value)}
              className="input-field pl-7" placeholder="5000" />
          </div>
        </Field>
      </div>
      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="btn-secondary">← Back</button>
        <button onClick={onNext} disabled={!bizName || !monthlyVolume}
          className="btn-primary">
          Save & Continue →
        </button>
      </div>
    </div>
  );
}

// Step 3
function DocumentStep({
  submission, onBack, onNext,
}: {
  submission: KYCSubmission;
  onBack: () => void;
  onNext: () => void;
}) {
  const docs = submission.documents;
  const uploaded = (type: string) => docs.some(d => d.doc_type === type);

  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Document Upload</h2>
      <p className="text-slate-400 text-sm mb-6">
        Upload clear copies. Accepted formats: PDF, JPG, PNG · Max 5 MB each.
      </p>
      <div className="space-y-4">
        {(["pan", "aadhaar", "bank_statement"] as const).map((docType) => (
          <div key={`${docType}-${refreshKey}`} className="space-y-1">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-300">
                {docType === "pan" ? "PAN Card" : docType === "aadhaar" ? "Aadhaar Card" : "Bank Statement"}
                <span className="text-red-400 ml-1">*</span>
              </label>
              {uploaded(docType) && (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <span>✓</span> Uploaded
                </span>
              )}
            </div>
            <DocumentUpload
              docType={docType}
              onUploadSuccess={() => {
                setRefreshKey(k => k + 1);
                onNext().catch(() => {});
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="btn-secondary">← Back</button>
        <button onClick={onNext} className="btn-primary">
          Continue →
        </button>
      </div>
    </div>
  );
}

// Step 4
function ReviewStep({
  name, email, phone, bizName, bizType, monthlyVolume,
  submission, onBack, onSubmit, submitting, error,
}: {
  name: string; email: string; phone: string;
  bizName: string; bizType: string; monthlyVolume: string;
  submission: KYCSubmission;
  onBack: () => void; onSubmit: () => void;
  submitting: boolean; error: string;
}) {
  const docs = submission.documents;

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Review & Submit</h2>
      <p className="text-slate-400 text-sm mb-6">
        Please review your information before submitting.
      </p>

      <div className="space-y-4">
        <Section title="Personal Details">
          <Row label="Full Name" value={name} />
          <Row label="Email" value={email} />
          <Row label="Phone" value={phone} />
        </Section>
        <Section title="Business Details">
          <Row label="Business Name" value={bizName} />
          <Row label="Business Type" value={BUSINESS_TYPES.find(t => t.value === bizType)?.label ?? bizType} />
          <Row label="Monthly Volume" value={monthlyVolume ? `$${Number(monthlyVolume).toLocaleString()}` : "—"} />
        </Section>
        <Section title="Documents">
          {(["pan", "aadhaar", "bank_statement"] as const).map(type => {
            const doc = docs.find(d => d.doc_type === type);
            return (
              <Row
                key={type}
                label={type === "pan" ? "PAN Card" : type === "aadhaar" ? "Aadhaar" : "Bank Statement"}
                value={doc ? "✓ Uploaded" : "⚠ Missing"}
                valueClass={doc ? "text-emerald-400" : "text-amber-400"}
              />
            );
          })}
        </Section>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="btn-secondary">← Back</button>
        <button
          onClick={onSubmit}
          disabled={submitting || docs.length < 3}
          className="btn-primary flex items-center gap-2"
        >
          {submitting ? (
            <><Spinner /> Submitting…</>
          ) : (
            "Submit Application →"
          )}
        </button>
      </div>
      {docs.length < 3 && (
        <p className="text-amber-400 text-xs text-right mt-2">
          Upload all 3 documents before submitting.
        </p>
      )}
    </div>
  );
}

// Tiny layout helpers
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-lg p-4 border border-border">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={valueClass ?? "text-slate-100"}>{value || "—"}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
