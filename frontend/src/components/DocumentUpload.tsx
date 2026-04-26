import { useState, useRef, DragEvent } from "react";
import { merchantApi, ApiError } from "../api";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface Props {
  docType: "pan" | "aadhaar" | "bank_statement";
  onUploadSuccess: () => void;
}

export default function DocumentUpload({ docType, onUploadSuccess }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [successFile, setSuccessFile] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    if (file.size > MAX_SIZE_BYTES) return `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Max 5 MB.`;
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png)$/i))
      return "Only PDF, JPG, and PNG files are accepted.";
    return null;
  }

  async function upload(file: File) {
    setError(""); setSuccessFile("");
    const err = validate(file);
    if (err) { setError(err); return; }
    const fd = new FormData();
    fd.append("doc_type", docType);
    fd.append("file", file);
    setUploading(true);
    try { await merchantApi.uploadDocument(fd); setSuccessFile(file.name); onUploadSuccess(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Upload failed."); }
    finally { setUploading(false); }
  }

  return (
    <div>
      <div
        onDragOver={(e: DragEvent) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e: DragEvent) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e: DragEvent) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative border border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 select-none ${
          dragging ? "border-primary bg-primary/[0.06] scale-[1.01]"
          : uploading ? "border-zinc-800 bg-zinc-900/50 cursor-wait"
          : successFile ? "border-emerald-500/30 bg-emerald-500/[0.03]"
          : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-900/60"
        }`}
      >
        <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} disabled={uploading} />

        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <svg className="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-[12px] text-zinc-500">Uploading…</p>
          </div>
        ) : successFile ? (
          <div className="flex items-center gap-3 py-1">
            <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 text-[12px]">✓</div>
            <div className="text-left min-w-0">
              <p className="text-[13px] text-emerald-400 font-medium truncate">{successFile}</p>
              <p className="text-[11px] text-zinc-600">Click to replace</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-1">
            <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-[12px]">
              {dragging ? "↓" : "↑"}
            </div>
            <div className="text-left">
              <p className="text-[13px] text-zinc-400">{dragging ? "Drop to upload" : "Drag & drop or click to browse"}</p>
              <p className="text-[11px] text-zinc-600">PDF, JPG, PNG · max 5 MB</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 mt-2 text-[12px] text-red-400">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
