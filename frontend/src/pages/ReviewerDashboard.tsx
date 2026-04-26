import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { reviewerApi, ApiError } from "../api";
import type { KYCSubmission, SubmissionListItem, ReviewerMetrics, SubmissionState } from "../types";

const STATE_LABELS: Record<SubmissionState, string> = {
  draft: "Draft", submitted: "Submitted", under_review: "Under Review",
  approved: "Approved", rejected: "Rejected", more_info_requested: "More Info",
};

function StateBadge({ state }: { state: SubmissionState }) {
  return <span className={`badge-${state}`}>{STATE_LABELS[state]}</span>;
}

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function ago(iso: string | null): string {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function ReviewerDashboard() {
  const navigate = useNavigate();
  const username = localStorage.getItem("username") ?? "";
  const [queue, setQueue] = useState<SubmissionListItem[]>([]);
  const [metrics, setMetrics] = useState<ReviewerMetrics | null>(null);
  const [selected, setSelected] = useState<KYCSubmission | null>(null);
  const [loadingQ, setLoadingQ] = useState(true);
  const [loadingD, setLoadingD] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [actErr, setActErr] = useState("");
  const [actNote, setActNote] = useState("");
  const [acting, setActing] = useState(false);
  const [actOk, setActOk] = useState("");

  const loadQ = useCallback(async () => {
    try {
      const [q, m] = await Promise.all([reviewerApi.getQueue(), reviewerApi.getMetrics()]);
      setQueue(q); setMetrics(m);
    } catch {} finally { setLoadingQ(false); }
  }, []);

  useEffect(() => { loadQ(); const id = setInterval(loadQ, 30000); return () => clearInterval(id); }, [loadQ]);

  async function openDetail(id: number) {
    setLoadingD(true); setPanelOpen(true); setActErr(""); setActNote(""); setActOk("");
    try { setSelected(await reviewerApi.getSubmission(id)); } catch { setPanelOpen(false); }
    finally { setLoadingD(false); }
  }

  async function doAction(newState: string) {
    if (!selected) return;
    setActing(true); setActErr("");
    try {
      const u = await reviewerApi.transition(selected.id, newState, actNote || undefined);
      setSelected(u); setActOk(`Moved to "${STATE_LABELS[newState as SubmissionState]}".`); setActNote(""); loadQ();
    } catch (e) { setActErr(e instanceof ApiError ? e.message : "Failed."); }
    finally { setActing(false); }
  }

  function logout() { localStorage.clear(); navigate("/login", { replace: true }); }

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Nav */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-semibold text-white text-[14px] tracking-[-0.01em]">Playto Pay</span>
            <span className="text-zinc-600 text-[13px] hidden sm:block">/ Reviews</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-zinc-500 text-[13px] hidden sm:block">@{username}</span>
            <button onClick={logout} className="text-zinc-600 hover:text-zinc-300 text-[13px] transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 py-10">
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold text-white tracking-[-0.02em]">Review Queue</h1>
          <p className="text-zinc-500 text-[13px] mt-1">Oldest first. Flagged submissions have been waiting &gt;24 hours.</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <Metric label="In Queue" value={metrics?.queue_size ?? "—"} accent="violet" />
          <Metric label="Avg. Wait Time" value={fmtHours(metrics?.avg_time_in_queue_hours ?? null)} accent="amber" />
          <Metric label="Approval Rate (7d)" value={metrics?.approval_rate_7d != null ? `${metrics.approval_rate_7d}%` : "—"} sub={metrics ? `${metrics.approved_7d}/${metrics.total_decided_7d} decided` : ""} accent="emerald" />
        </div>

        {/* Queue */}
        {loadingQ ? (
          <div className="text-zinc-500 text-sm animate-pulse">Loading…</div>
        ) : queue.length === 0 ? (
          <div className="card text-center py-20">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 text-emerald-400 text-lg">✓</div>
            <p className="text-zinc-300 font-medium">Queue is empty</p>
            <p className="text-zinc-600 text-[13px] mt-1">No submissions awaiting review.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-zinc-800/80">
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-[12px] uppercase tracking-wider">Merchant</th>
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-[12px] uppercase tracking-wider hidden md:table-cell">Business</th>
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-[12px] uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-[12px] uppercase tracking-wider hidden sm:table-cell">Submitted</th>
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-[12px] uppercase tracking-wider hidden lg:table-cell">Docs</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {queue.map(item => (
                  <tr key={item.id} onClick={() => openDetail(item.id)} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/30 transition-colors cursor-pointer group">
                    <td className="px-5 py-4">
                      <div className="font-medium text-zinc-200">{item.merchant_name}</div>
                      {item.at_risk && <span className="badge-at_risk mt-1.5 text-[10px]">⚠ SLA breach</span>}
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell text-zinc-500">{item.business_name}</td>
                    <td className="px-5 py-4"><StateBadge state={item.state} /></td>
                    <td className="px-5 py-4 text-zinc-500 hidden sm:table-cell">{ago(item.submitted_at)}</td>
                    <td className="px-5 py-4 text-zinc-500 hidden lg:table-cell font-mono">{item.document_count}/3</td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-primary-light opacity-0 group-hover:opacity-100 transition-opacity text-[12px]">Review →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {panelOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 animate-fade-in" onClick={() => { setPanelOpen(false); setSelected(null); }} />
          <aside className="fixed right-0 top-0 h-full w-full max-w-xl bg-[#111113] border-l border-zinc-800 z-40 overflow-y-auto animate-slide-in shadow-2xl shadow-black/40">
            <Panel sub={selected} loading={loadingD} onClose={() => { setPanelOpen(false); setSelected(null); }} onAction={doAction} acting={acting} note={actNote} setNote={setActNote} err={actErr} ok={actOk} />
          </aside>
        </>
      )}
    </div>
  );
}

/* ── Metric Card ─────────────────────────────────────────────────────────── */

function Metric({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: "violet" | "amber" | "emerald" }) {
  const colors = {
    violet: "border-violet-500/15 bg-violet-500/[0.04]",
    amber: "border-amber-500/15 bg-amber-500/[0.04]",
    emerald: "border-emerald-500/15 bg-emerald-500/[0.04]",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[accent]}`}>
      <p className="text-zinc-500 text-[12px] font-medium uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-zinc-600 mt-1">{sub}</p>}
    </div>
  );
}

/* ── Detail Panel ────────────────────────────────────────────────────────── */

function Panel({ sub, loading, onClose, onAction, acting, note, setNote, err, ok }: {
  sub: KYCSubmission | null; loading: boolean; onClose: () => void; onAction: (s: string) => void;
  acting: boolean; note: string; setNote: (v: string) => void; err: string; ok: string;
}) {
  if (loading) return <div className="p-8 text-zinc-500 text-sm animate-pulse">Loading…</div>;
  if (!sub) return null;
  const p = sub.personal_details, b = sub.business_details;
  const canAct = sub.state === "submitted" || sub.state === "under_review";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-[#111113] sticky top-0 z-10">
        <div>
          <h2 className="text-[16px] font-semibold text-white">{p.name ?? sub.merchant_username}</h2>
          <p className="text-zinc-500 text-[13px]">{b.business_name ?? "—"}</p>
        </div>
        <div className="flex items-center gap-3">
          <StateBadge state={sub.state} />
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors" aria-label="Close">✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {ok && <div className="p-3 rounded-lg bg-emerald-500/8 border border-emerald-500/15 text-emerald-400 text-[13px] animate-fade-in">{ok}</div>}

        {/* Meta */}
        <div className="grid grid-cols-2 gap-3">
          <Info label="Submitted" value={sub.submitted_at ? ago(sub.submitted_at) : "—"} />
          <Info label="Last Update" value={ago(sub.last_state_change_at)} />
          <Info label="Reviewer" value={sub.reviewer_username ?? "Unassigned"} />
          <Info label="ID" value={`#${sub.id}`} mono />
        </div>

        {sub.reviewer_note && (
          <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
            <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1.5">Previous Note</p>
            <p className="text-zinc-300 text-[13px]">{sub.reviewer_note}</p>
          </div>
        )}

        {/* Sections */}
        <Section title="Personal Details">
          <Info label="Full Name" value={p.name ?? "—"} /><Info label="Email" value={p.email ?? "—"} /><Info label="Phone" value={p.phone ?? "—"} />
        </Section>
        <Section title="Business Details">
          <Info label="Business" value={b.business_name ?? "—"} /><Info label="Type" value={b.business_type ?? "—"} /><Info label="Volume" value={b.monthly_volume != null ? `$${Number(b.monthly_volume).toLocaleString()}` : "—"} />
        </Section>

        {/* Documents */}
        <div>
          <h3 className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Documents</h3>
          <div className="space-y-2">
            {(["pan","aadhaar","bank_statement"] as const).map(t => {
              const d = sub.documents.find(x => x.doc_type === t);
              return (
                <div key={t} className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${d ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-600"}`}>{d ? "✓" : "○"}</div>
                    <span className="text-[13px] text-zinc-300">{t === "pan" ? "PAN Card" : t === "aadhaar" ? "Aadhaar Card" : "Bank Statement"}</span>
                  </div>
                  {d?.file_url ? <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-primary-light hover:text-white transition-colors" onClick={e => e.stopPropagation()}>View ↗</a> : <span className="text-[12px] text-zinc-700">Missing</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        {canAct && (
          <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/50 space-y-4">
            <h3 className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wider">Actions</h3>
            {err && <div className="p-3 rounded-lg bg-red-500/8 border border-red-500/15 text-red-400 text-[13px]">{err}</div>}
            {sub.state === "submitted" && (
              <button onClick={() => onAction("under_review")} disabled={acting} className="btn-outline w-full">{acting ? "Processing…" : "▷ Start Review"}</button>
            )}
            {sub.state === "under_review" && (
              <>
                <div>
                  <label className="block text-[12px] font-medium text-zinc-500 mb-2">Note <span className="text-zinc-700">(required for reject/more info)</span></label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="input-field resize-none text-[13px]" placeholder="Visible to the merchant…" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => onAction("approved")} disabled={acting} className="btn-success text-[13px]">✓ Approve</button>
                  <button onClick={() => { if (!note.trim()) { alert("Add a reason."); return; } onAction("rejected"); }} disabled={acting} className="btn-danger text-[13px]">✗ Reject</button>
                  <button onClick={() => { if (!note.trim()) { alert("Specify what's needed."); return; } onAction("more_info_requested"); }} disabled={acting} className="btn-outline text-[13px] text-violet-400 border-violet-500/20 hover:bg-violet-500/10">? More Info</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div><h3 className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h3><div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3">{children}</div></div>);
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (<div><p className="text-[11px] text-zinc-600 mb-0.5">{label}</p><p className={`text-[13px] text-zinc-200 ${mono ? "font-mono" : ""}`}>{value}</p></div>);
}
