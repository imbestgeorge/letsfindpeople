import { useAuth } from "../context/AuthContext";
import ErrorPage from "../pages/ErrorPage";

export default function AdminRoute({ children }) {
  const { session, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
        <div className="spinner-border spinner-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!session) return <ErrorPage type="unauthorized" />;
  if (!isAdmin) return <ErrorPage type="forbidden" />;

  return children;
}
