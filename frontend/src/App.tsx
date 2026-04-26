import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import MerchantKYC from "./pages/MerchantKYC";
import ReviewerDashboard from "./pages/ReviewerDashboard";

function getRole(): string | null {
  return localStorage.getItem("role");
}

function ProtectedRoute({
  role,
  children,
}: {
  role: "merchant" | "reviewer";
  children: React.ReactNode;
}) {
  const token = localStorage.getItem("token");
  const userRole = getRole();
  if (!token) return <Navigate to="/login" replace />;
  if (userRole !== role) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/kyc"
          element={
            <ProtectedRoute role="merchant">
              <MerchantKYC />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reviewer"
          element={
            <ProtectedRoute role="reviewer">
              <ReviewerDashboard />
            </ProtectedRoute>
          }
        />
        {/* Default redirect based on role */}
        <Route
          path="/"
          element={
            getRole() === "reviewer" ? (
              <Navigate to="/reviewer" replace />
            ) : getRole() === "merchant" ? (
              <Navigate to="/kyc" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
