import { useAuth } from "../context/AuthContext";
import ErrorPage from "../pages/ErrorPage";

export default function ProtectedRoute({ children }) {
  const { session } = useAuth();

  // Redirect immediately once session is known — no need to wait for role loading
  if (session === null) return <ErrorPage type="unauthorized" />;

  if (session === undefined) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
        <div className="spinner-border spinner-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return children;
}
