import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "@/lib/auth-client";

export function ProtectedRoute() {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
