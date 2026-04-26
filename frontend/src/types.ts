/** All TypeScript interfaces mirroring the Django API response shapes. */

export interface AuthUser {
  token: string;
  user_id: number;
  username: string;
  role: "merchant" | "reviewer";
}

export interface KYCDocument {
  id: number;
  doc_type: "pan" | "aadhaar" | "bank_statement";
  file_url: string | null;
  uploaded_at: string;
}

export type SubmissionState =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "more_info_requested";

export interface KYCSubmission {
  id: number;
  state: SubmissionState;
  merchant_username: string;
  reviewer_username: string | null;
  personal_details: {
    name?: string;
    email?: string;
    phone?: string;
  };
  business_details: {
    business_name?: string;
    business_type?: string;
    monthly_volume?: number;
  };
  reviewer_note: string;
  submitted_at: string | null;
  created_at: string;
  last_state_change_at: string;
  at_risk: boolean;
  documents: KYCDocument[];
}

export interface SubmissionListItem {
  id: number;
  state: SubmissionState;
  merchant_name: string;
  business_name: string;
  submitted_at: string | null;
  last_state_change_at: string;
  at_risk: boolean;
  document_count: number;
}

export interface ReviewerMetrics {
  queue_size: number;
  avg_time_in_queue_hours: number | null;
  approval_rate_7d: number | null;
  total_decided_7d: number;
  approved_7d: number;
}
