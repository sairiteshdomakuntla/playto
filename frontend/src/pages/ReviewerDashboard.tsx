import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { reviewerApi, ApiError } from "../api";
import type { KYCSubmission, SubmissionListItem, ReviewerMetrics, SubmissionState } from "../types";

// ---------------------------------------------------------------------------
// Badge helpers (shared with merchant side via CSS classes)
// ---------------------------------------------------------------------------

const STATE_LABELS: Record<SubmissionState, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  more_info_requested: "More Info Needed",
};

function StateBadge({ state }: { state: SubmissionState }) {
  return <span className={`badge-${state}`}>{STATE_LABELS[state]}</span>;
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReviewerDashboard() {
  const navigate = useNavigate();
  const username = localStorage.getItem("username") ?? "";

  const [queue, setQueue] = useState<SubmissionListItem[]>([]);
  const [metrics, setMetrics] = useState<ReviewerMetrics | null>(null);
  const [selected, setSelected] = useState<KYCSubmission | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [actioning, setActioning] = useState(false);
  const [actionSuccess, setActionSuccess] = useState("");

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const loadQueue = useCallback(async () => {
    try {
      const [q, m] = await Promise.all([reviewerApi.getQueue(), reviewerApi.getMetrics()]);
      setQueue(q);
      setMetrics(m);
    } catch {
      // non-critical
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    // Refresh every 30 s to keep SLA flags current.
    const id = setInterval(loadQueue, 30_000);
    return () => clearInterval(id);
  }, [loadQueue]);

  async function openDetail(id: number) {
    setLoadingDetail(true);
    setPanelOpen(true);
    setActionError("");
    setActionNote("");
    setActionSuccess("");
    try {
      const data = await reviewerApi.getSubmission(id);
      setSelected(data);
    } catch {
      setPanelOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  }

  function closePanel() {
    setPanelOpen(false);
    setSelected(null);
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------

  async function performAction(newState: string) {
    if (!selected) return;
    setActioning(true);
    setActionError("");
    try {
      const updated = await reviewerApi.transition(selected.id, newState, actionNote || undefined);
      setSelected(updated);
      setActionSuccess(`Submission moved to "${STATE_LABELS[newState as SubmissionState]}".`);
      setActionNote("");
      loadQueue(); // refresh the queue
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setActioning(false);
    }
  }

  function logout() {
    localStorage.clear();
    navigate("/login", { replace: true });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#0c0c14]">
      {/* Navbar */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-indigo-700 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white fill-current">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>
            <span className="font-bold text-white text-sm">Playto Pay</span>
            <span className="text-slate-600 text-sm hidden sm:block">/ Reviewer Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-sm hidden sm:block">@{username}</span>
            <button onClick={logout} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Review Queue</h1>
          <p className="text-slate-400 text-sm mt-1">
            Submissions are ordered oldest-first. Flagged submissions have been waiting &gt;24 hours.
          </p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <MetricCard
            label="In Queue"
            value={metrics?.queue_size ?? "—"}
            icon="📥"
            color="blue"
          />
          <MetricCard
            label="Avg. Time in Queue"
            value={formatHours(metrics?.avg_time_in_queue_hours ?? null)}
            icon="⏱"
            color="amber"
          />
          <MetricCard
            label="Approval Rate (7d)"
            value={metrics?.approval_rate_7d !== null && metrics?.approval_rate_7d !== undefined
              ? `${metrics.approval_rate_7d}%`
              : "—"}
            sub={metrics ? `${metrics.approved_7d} of ${metrics.total_decided_7d} decided` : ""}
            icon="✅"
            color="green"
          />
        </div>

        {/* Queue table */}
        {loadingQueue ? (
          <div className="text-slate-400 animate-pulse text-sm">Loading queue…</div>
        ) : queue.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-4xl mb-3">🎉</div>
            <p className="text-slate-300 font-medium">Queue is empty</p>
            <p className="text-slate-500 text-sm mt-1">No submissions currently awaiting review.</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Merchant</th>
                  <th className="text-left px-5 py-3.5 text-slate-400 font-medium hidden md:table-cell">Business</th>
                  <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Status</th>
                  <th className="text-left px-5 py-3.5 text-slate-400 font-medium hidden sm:table-cell">Submitted</th>
                  <th className="text-left px-5 py-3.5 text-slate-400 font-medium hidden lg:table-cell">Docs</th>
                  <th className="px-5 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queue.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-white/3 transition-colors cursor-pointer group"
                    onClick={() => openDetail(item.id)}
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-100">{item.merchant_name}</div>
                      {item.at_risk && (
                        <span className="badge-at_risk mt-1 text-xs">⚠ SLA at risk</span>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell text-slate-400">
                      {item.business_name}
                    </td>
                    <td className="px-5 py-4">
                      <StateBadge state={item.state} />
                    </td>
                    <td className="px-5 py-4 text-slate-500 hidden sm:table-cell">
                      {timeAgo(item.submitted_at)}
                    </td>
                    <td className="px-5 py-4 text-slate-500 hidden lg:table-cell">
                      {item.document_count}/3
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                        Review →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail panel overlay */}
      {panelOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
            onClick={closePanel}
          />
          <aside className="fixed right-0 top-0 h-full w-full max-w-2xl bg-card border-l border-border z-40 overflow-y-auto animate-slide-in">
            <DetailPanel
              submission={selected}
              loading={loadingDetail}
              onClose={closePanel}
              onAction={performAction}
              actioning={actioning}
              actionNote={actionNote}
              setActionNote={setActionNote}
              actionError={actionError}
              actionSuccess={actionSuccess}
            />
          </aside>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  label, value, sub, icon, color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  color: "blue" | "amber" | "green";
}) {
  const colorMap = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/20 text-blue-400",
    amber: "from-amber-500/20 to-amber-600/10 border-amber-500/20 text-amber-400",
    green: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20 text-emerald-400",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-5 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400 text-sm font-medium">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submission detail panel
// ---------------------------------------------------------------------------

function DetailPanel({
  submission, loading, onClose, onAction, actioning, actionNote, setActionNote,
  actionError, actionSuccess,
}: {
  submission: KYCSubmission | null;
  loading: boolean;
  onClose: () => void;
  onAction: (state: string) => void;
  actioning: boolean;
  actionNote: string;
  setActionNote: (v: string) => void;
  actionError: string;
  actionSuccess: string;
}) {
  if (loading) {
    return (
      <div className="p-8 text-slate-400 animate-pulse">Loading submission…</div>
    );
  }
  if (!submission) return null;

  const p = submission.personal_details;
  const b = submission.business_details;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
        <div>
          <h2 className="text-lg font-bold text-white">
            {p.name ?? submission.merchant_username}
          </h2>
          <p className="text-slate-400 text-sm">{b.business_name ?? "—"}</p>
        </div>
        <div className="flex items-center gap-3">
          <StateBadge state={submission.state} />
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Action success banner */}
        {actionSuccess && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm animate-fade-in">
            {actionSuccess}
          </div>
        )}

        {/* Timeline info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoItem label="Submitted" value={submission.submitted_at ? timeAgo(submission.submitted_at) : "Not submitted"} />
          <InfoItem label="Last Update" value={timeAgo(submission.last_state_change_at)} />
          <InfoItem label="Reviewer" value={submission.reviewer_username ?? "Unassigned"} />
          <InfoItem label="Submission ID" value={`#${submission.id}`} />
        </div>

        {submission.reviewer_note && (
          <div className="p-4 bg-surface rounded-lg border border-border">
            <p className="text-xs text-slate-400 font-medium mb-1">Reviewer Note</p>
            <p className="text-slate-200 text-sm">{submission.reviewer_note}</p>
          </div>
        )}

        {/* Personal details */}
        <Section title="Personal Details">
          <InfoItem label="Full Name" value={p.name ?? "—"} />
          <InfoItem label="Email" value={p.email ?? "—"} />
          <InfoItem label="Phone" value={p.phone ?? "—"} />
        </Section>

        {/* Business details */}
        <Section title="Business Details">
          <InfoItem label="Business Name" value={b.business_name ?? "—"} />
          <InfoItem label="Business Type" value={b.business_type ?? "—"} />
          <InfoItem label="Monthly Volume" value={b.monthly_volume !== undefined ? `$${Number(b.monthly_volume).toLocaleString()}` : "—"} />
        </Section>

        {/* Documents */}
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Documents</h3>
          <div className="space-y-2">
            {(["pan", "aadhaar", "bank_statement"] as const).map((type) => {
              const doc = submission.documents.find((d) => d.doc_type === type);
              return (
                <div key={type} className="flex items-center justify-between p-3 bg-surface rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${doc ? "text-emerald-400" : "text-slate-600"}`}>
                      {doc ? "✓" : "○"}
                    </span>
                    <span className="text-sm text-slate-300">
                      {type === "pan" ? "PAN Card" : type === "aadhaar" ? "Aadhaar Card" : "Bank Statement"}
                    </span>
                  </div>
                  {doc?.file_url ? (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:text-primary-light transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View ↗
                    </a>
                  ) : (
                    <span className="text-xs text-slate-600">Not uploaded</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        {(submission.state === "submitted" || submission.state === "under_review") && (
          <ActionPanel
            submission={submission}
            onAction={onAction}
            actioning={actioning}
            actionNote={actionNote}
            setActionNote={setActionNote}
            actionError={actionError}
          />
        )}
      </div>
    </div>
  );
}

function ActionPanel({
  submission, onAction, actioning, actionNote, setActionNote, actionError,
}: {
  submission: KYCSubmission;
  onAction: (state: string) => void;
  actioning: boolean;
  actionNote: string;
  setActionNote: (v: string) => void;
  actionError: string;
}) {
  const isSubmitted = submission.state === "submitted";
  const isUnderReview = submission.state === "under_review";

  return (
    <div className="border border-border rounded-xl p-5 bg-surface space-y-4">
      <h3 className="text-sm font-semibold text-slate-300">Actions</h3>

      {actionError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {actionError}
        </div>
      )}

      {isSubmitted && (
        <button
          onClick={() => onAction("under_review")}
          disabled={actioning}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 transition-all disabled:opacity-50"
        >
          {actioning ? "Processing…" : "▷ Start Review"}
        </button>
      )}

      {isUnderReview && (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Note / Reason <span className="text-slate-600">(required for Reject / More Info)</span>
            </label>
            <textarea
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              rows={3}
              className="input-field resize-none text-sm"
              placeholder="Optional note visible to the merchant…"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => onAction("approved")}
              disabled={actioning}
              className="btn-success text-sm"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => {
                if (!actionNote.trim()) {
                  alert("Please add a reason before rejecting.");
                  return;
                }
                onAction("rejected");
              }}
              disabled={actioning}
              className="btn-danger text-sm"
            >
              ✗ Reject
            </button>
            <button
              onClick={() => {
                if (!actionNote.trim()) {
                  alert("Please specify what additional information is needed.");
                  return;
                }
                onAction("more_info_requested");
              }}
              disabled={actioning}
              className="py-2.5 rounded-lg text-sm font-semibold bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 transition-all disabled:opacity-50"
            >
              📋 More Info
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
      <div className="bg-surface rounded-lg border border-border p-4 space-y-3">
        {children}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm text-slate-200">{value}</p>
    </div>
  );
}
