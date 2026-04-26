import { useState, useRef, DragEvent } from "react";
import { merchantApi, ApiError } from "../api";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

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

  function validateClientSide(file: File): string | null {
    // Client-side pre-check for UX — authoritatively validated server-side too.
    if (file.size > MAX_SIZE_BYTES) {
      return `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Max allowed is 5 MB.`;
    }
    if (
      !ACCEPTED_TYPES.includes(file.type) &&
      !file.name.match(/\.(pdf|jpg|jpeg|png)$/i)
    ) {
      return "Only PDF, JPG, and PNG files are accepted.";
    }
    return null;
  }

  async function uploadFile(file: File) {
    setError("");
    setSuccessFile("");

    const clientError = validateClientSide(file);
    if (clientError) {
      setError(clientError);
      return;
    }

    const formData = new FormData();
    formData.append("doc_type", docType);
    formData.append("file", file);

    setUploading(true);
    try {
      await merchantApi.uploadDocument(formData);
      setSuccessFile(file.name);
      onUploadSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset input so the same file can be re-uploaded if needed.
    e.target.value = "";
  }

  return (
    <div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
          transition-all duration-200 select-none
          ${dragging
            ? "border-primary bg-primary/10 scale-[1.01]"
            : uploading
            ? "border-border bg-surface/50 cursor-wait"
            : successFile
            ? "border-emerald-500/50 bg-emerald-500/5"
            : "border-border bg-surface hover:border-primary/50 hover:bg-primary/5"
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="sr-only"
          onChange={onFileChange}
          disabled={uploading}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-slate-400">Uploading…</p>
          </div>
        ) : successFile ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl">✓</div>
            <p className="text-sm text-emerald-400 font-medium truncate max-w-[200px]">{successFile}</p>
            <p className="text-xs text-slate-500">Click to replace</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl">
              {dragging ? "📂" : "⬆"}
            </div>
            <p className="text-sm text-slate-300 font-medium">
              {dragging ? "Drop to upload" : "Drag & drop or click to browse"}
            </p>
            <p className="text-xs text-slate-500">PDF, JPG, PNG · max 5 MB</p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}
