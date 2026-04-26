import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { merchantApi, ApiError } from "../api";
import type { KYCSubmission, SubmissionState } from "../types";
import DocumentUpload from "../components/DocumentUpload";

const STATE_LABELS: Record<SubmissionState, string> = {
  draft: "Draft", submitted: "Awaiting Review", under_review: "Under Review",
  approved: "Approved", rejected: "Rejected", more_info_requested: "More Info Requested",
};

const STEPS = ["Personal", "Business", "Documents", "Review"];
const BUSINESS_TYPES = [
  { value: "individual", label: "Individual / Freelancer" },
  { value: "proprietorship", label: "Proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "llp", label: "LLP" },
  { value: "company", label: "Private Limited Company" },
];
const EDITABLE: SubmissionState[] = ["draft", "more_info_requested"];

export default function MerchantKYC() {
  const navigate = useNavigate();
  const username = localStorage.getItem("username") ?? "";
  const [sub, setSub] = useState<KYCSubmission | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bizName, setBizName] = useState("");
  const [bizType, setBizType] = useState("individual");
  const [volume, setVolume] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await merchantApi.getSubmission();
      setSub(d); fill(d);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        try {
          const d = await merchantApi.createSubmission({ personal_details: {}, business_details: {} });
          setSub(d);
        } catch { setError("Failed to initialise KYC."); }
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function fill(d: KYCSubmission) {
    const p = d.personal_details, b = d.business_details;
    setName(p.name ?? ""); setEmail(p.email ?? ""); setPhone(p.phone ?? "");
    setBizName(b.business_name ?? ""); setBizType(b.business_type ?? "individual");
    setVolume(b.monthly_volume !== undefined ? String(b.monthly_volume) : "");
  }

  async function save() {
    if (!sub || !EDITABLE.includes(sub.state)) return;
    setSaving(true);
    try {
      const u = await merchantApi.updateDraft({
        personal_details: { name, email, phone },
        business_details: { business_name: bizName, business_type: bizType, monthly_volume: volume ? parseFloat(volume) : undefined },
      });
      setSub(u); setSaveMsg("Saved"); setTimeout(() => setSaveMsg(""), 2000);
    } catch { setSaveMsg("Save failed"); } finally { setSaving(false); }
  }

  async function goNext() { await save(); setStep(s => Math.min(s + 1, 3)); }

  async function doSubmit() {
    setSubmitting(true); setError("");
    try { const u = await merchantApi.submitForReview(); setSub(u); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Submission failed."); }
    finally { setSubmitting(false); }
  }

  function logout() { localStorage.clear(); navigate("/login", { replace: true }); }

  if (loading) return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="text-zinc-500 text-sm animate-pulse">Loading…</div>
    </div>
  );

  const editable = sub ? EDITABLE.includes(sub.state) : false;
  const terminal = sub && ["approved","rejected","submitted","under_review"].includes(sub.state);

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Nav */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-semibold text-white text-[14px] tracking-[-0.01em]">Playto Pay</span>
          </div>
          <div className="flex items-center gap-4">
            {saveMsg && <span className="text-[12px] text-emerald-400 animate-fade-in">{saveMsg}</span>}
            <span className="text-zinc-500 text-[13px] hidden sm:block">@{username}</span>
            {sub && <span className={`badge-${sub.state}`}>{STATE_LABELS[sub.state]}</span>}
            <button onClick={logout} className="text-zinc-600 hover:text-zinc-300 text-[13px] transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold text-white tracking-[-0.02em]">KYC Application</h1>
          <p className="text-zinc-500 text-[13px] mt-1">Complete all steps to start collecting international payments.</p>
        </div>

        {sub && terminal && <StatusBanner submission={sub} onReload={load} />}

        {editable && (
          <>
            {/* Stepper */}
            <div className="flex items-center gap-1 mb-8">
              {STEPS.map((label, i) => (
                <div key={i} className="flex items-center gap-1 flex-1">
                  <button
                    onClick={() => i < step && setStep(i)}
                    className={`flex items-center gap-2 text-[13px] font-medium transition-colors ${
                      i === step ? "text-white" : i < step ? "text-primary-light cursor-pointer" : "text-zinc-600 cursor-default"
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all ${
                      i === step ? "border-primary bg-primary/20 text-primary-light"
                        : i < step ? "border-primary/40 bg-primary/10 text-primary-light" : "border-zinc-700 text-zinc-600"
                    }`}>
                      {i < step ? "✓" : i + 1}
                    </span>
                    <span className="hidden sm:block">{label}</span>
                  </button>
                  {i < 3 && <div className={`flex-1 h-px ${i < step ? "bg-primary/30" : "bg-zinc-800"}`} />}
                </div>
              ))}
            </div>

            <div className="card animate-fade-up">
              {step === 0 && <PersonalStep name={name} setName={setName} email={email} setEmail={setEmail} phone={phone} setPhone={setPhone} onNext={goNext} />}
              {step === 1 && <BusinessStep bizName={bizName} setBizName={setBizName} bizType={bizType} setBizType={setBizType} vol={volume} setVol={setVolume} onBack={() => setStep(0)} onNext={goNext} />}
              {step === 2 && sub && <DocStep sub={sub} onBack={() => setStep(1)} onNext={async () => { const u = await merchantApi.getSubmission(); setSub(u); setStep(3); }} />}
              {step === 3 && sub && <ReviewStep name={name} email={email} phone={phone} bizName={bizName} bizType={bizType} vol={volume} sub={sub} onBack={() => setStep(2)} onSubmit={doSubmit} submitting={submitting} error={error} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ── Status Banner ───────────────────────────────────────────────────────── */

function StatusBanner({ submission: s, onReload }: { submission: KYCSubmission; onReload: () => void }) {
  const cfg: Record<string, { icon: string; title: string; desc: string; cls: string }> = {
    submitted: { icon: "⏳", title: "Application Submitted", desc: "Your application is in the review queue.", cls: "border-blue-500/20 bg-blue-500/[0.06]" },
    under_review: { icon: "🔍", title: "Under Review", desc: "A reviewer is examining your application.", cls: "border-amber-500/20 bg-amber-500/[0.06]" },
    approved: { icon: "✓", title: "Approved", desc: "You're verified — start collecting international payments.", cls: "border-emerald-500/20 bg-emerald-500/[0.06]" },
    rejected: { icon: "✗", title: "Rejected", desc: s.reviewer_note ? `Reason: ${s.reviewer_note}` : "Contact support for details.", cls: "border-red-500/20 bg-red-500/[0.06]" },
    more_info_requested: { icon: "!", title: "More Information Required", desc: s.reviewer_note || "Please update your application.", cls: "border-violet-500/20 bg-violet-500/[0.06]" },
  };
  const c = cfg[s.state]; if (!c) return null;
  return (
    <div className={`p-5 rounded-xl border mb-8 animate-fade-up ${c.cls}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-sm font-bold">{c.icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-[15px] text-zinc-100">{c.title}</h2>
          <p className="text-[13px] text-zinc-400 mt-0.5">{c.desc}</p>
          {s.state === "more_info_requested" && <button onClick={onReload} className="mt-2 text-[13px] text-primary-light hover:text-primary transition-colors">Edit and resubmit →</button>}
        </div>
      </div>
    </div>
  );
}

/* ── Step 1: Personal ────────────────────────────────────────────────────── */

function PersonalStep(p: { name: string; setName: (v:string)=>void; email: string; setEmail: (v:string)=>void; phone: string; setPhone: (v:string)=>void; onNext: ()=>void }) {
  return (
    <div>
      <h2 className="text-[16px] font-semibold text-white mb-1">Personal Details</h2>
      <p className="text-zinc-500 text-[13px] mb-6">Tell us about the account owner.</p>
      <div className="space-y-5">
        <Field label="Full Name" required><input type="text" value={p.name} onChange={e => p.setName(e.target.value)} className="input-field" placeholder="Rahul Sharma" /></Field>
        <Field label="Business Email" required><input type="email" value={p.email} onChange={e => p.setEmail(e.target.value)} className="input-field" placeholder="rahul@business.com" /></Field>
        <Field label="Phone Number" required><input type="tel" value={p.phone} onChange={e => p.setPhone(e.target.value)} className="input-field" placeholder="9876543210" /></Field>
      </div>
      <div className="flex justify-end mt-8">
        <button onClick={p.onNext} disabled={!p.name||!p.email||!p.phone} className="btn-primary">Save & Continue →</button>
      </div>
    </div>
  );
}

/* ── Step 2: Business ────────────────────────────────────────────────────── */

function BusinessStep(p: { bizName: string; setBizName: (v:string)=>void; bizType: string; setBizType: (v:string)=>void; vol: string; setVol: (v:string)=>void; onBack: ()=>void; onNext: ()=>void }) {
  return (
    <div>
      <h2 className="text-[16px] font-semibold text-white mb-1">Business Details</h2>
      <p className="text-zinc-500 text-[13px] mb-6">Information about your business.</p>
      <div className="space-y-5">
        <Field label="Business Name" required><input type="text" value={p.bizName} onChange={e => p.setBizName(e.target.value)} className="input-field" placeholder="Sharma Exports Pvt Ltd" /></Field>
        <Field label="Business Type" required>
          <select value={p.bizType} onChange={e => p.setBizType(e.target.value)} className="input-field">
            {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Expected Monthly Volume (USD)" required>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
            <input type="number" min="0" step="100" value={p.vol} onChange={e => p.setVol(e.target.value)} className="input-field pl-7" placeholder="5,000" />
          </div>
        </Field>
      </div>
      <div className="flex justify-between mt-8">
        <button onClick={p.onBack} className="btn-ghost">← Back</button>
        <button onClick={p.onNext} disabled={!p.bizName||!p.vol} className="btn-primary">Save & Continue →</button>
      </div>
    </div>
  );
}

/* ── Step 3: Documents ───────────────────────────────────────────────────── */

function DocStep({ sub, onBack, onNext }: { sub: KYCSubmission; onBack: ()=>void; onNext: ()=>void }) {
  const docs = sub.documents;
  const has = (t: string) => docs.some(d => d.doc_type === t);
  const [key, setKey] = useState(0);
  return (
    <div>
      <h2 className="text-[16px] font-semibold text-white mb-1">Document Upload</h2>
      <p className="text-zinc-500 text-[13px] mb-6">Upload clear copies — PDF, JPG, or PNG · Max 5 MB each.</p>
      <div className="space-y-5">
        {(["pan","aadhaar","bank_statement"] as const).map(t => (
          <div key={`${t}-${key}`}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-medium text-zinc-300">
                {t === "pan" ? "PAN Card" : t === "aadhaar" ? "Aadhaar Card" : "Bank Statement"}
                <span className="text-red-400 ml-0.5">*</span>
              </label>
              {has(t) && <span className="text-[11px] text-emerald-400 font-medium">✓ Uploaded</span>}
            </div>
            <DocumentUpload docType={t} onUploadSuccess={() => { setKey(k => k+1); void Promise.resolve(onNext()); }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="btn-ghost">← Back</button>
        <button onClick={onNext} className="btn-primary">Continue →</button>
      </div>
    </div>
  );
}

/* ── Step 4: Review ──────────────────────────────────────────────────────── */

function ReviewStep(p: { name: string; email: string; phone: string; bizName: string; bizType: string; vol: string; sub: KYCSubmission; onBack: ()=>void; onSubmit: ()=>void; submitting: boolean; error: string }) {
  const docs = p.sub.documents;
  return (
    <div>
      <h2 className="text-[16px] font-semibold text-white mb-1">Review & Submit</h2>
      <p className="text-zinc-500 text-[13px] mb-6">Please verify your information before submitting.</p>
      <div className="space-y-4">
        <SummarySection title="Personal Details">
          <Row label="Full Name" value={p.name} /><Row label="Email" value={p.email} /><Row label="Phone" value={p.phone} />
        </SummarySection>
        <SummarySection title="Business Details">
          <Row label="Business Name" value={p.bizName} />
          <Row label="Type" value={BUSINESS_TYPES.find(t => t.value === p.bizType)?.label ?? p.bizType} />
          <Row label="Monthly Volume" value={p.vol ? `$${Number(p.vol).toLocaleString()}` : "—"} />
        </SummarySection>
        <SummarySection title="Documents">
          {(["pan","aadhaar","bank_statement"] as const).map(t => {
            const d = docs.find(x => x.doc_type === t);
            return <Row key={t} label={t === "pan" ? "PAN" : t === "aadhaar" ? "Aadhaar" : "Bank Statement"} value={d ? "✓ Uploaded" : "Missing"} valueClass={d ? "text-emerald-400" : "text-amber-400"} />;
          })}
        </SummarySection>
      </div>
      {p.error && <div className="mt-4 p-3 rounded-lg bg-red-500/8 border border-red-500/15 text-red-400 text-[13px]">{p.error}</div>}
      <div className="flex justify-between mt-8">
        <button onClick={p.onBack} className="btn-ghost">← Back</button>
        <button onClick={p.onSubmit} disabled={p.submitting || docs.length < 3} className="btn-primary">
          {p.submitting ? "Submitting…" : "Submit Application →"}
        </button>
      </div>
      {docs.length < 3 && <p className="text-amber-400/80 text-[12px] text-right mt-2">Upload all 3 documents before submitting.</p>}
    </div>
  );
}

/* ── Shared helpers ──────────────────────────────────────────────────────── */

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (<div><label className="block text-[13px] font-medium text-zinc-400 mb-2">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>{children}</div>);
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800"><h3 className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h3><div className="space-y-2.5">{children}</div></div>);
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (<div className="flex justify-between text-[13px]"><span className="text-zinc-500">{label}</span><span className={valueClass ?? "text-zinc-200"}>{value || "—"}</span></div>);
}
