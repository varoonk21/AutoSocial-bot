import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { ModuleLoader } from "./ModuleLoader";
import { ScrollToTop } from "@/components/ScrollToTop";

const AuthRoutes = lazy(() => import("@/features/auth/routes"));
const DashboardRoutes = lazy(() => import("@/features/dashboard/routes"));

export const router = createBrowserRouter([
  {
    path: "/*",
    element: (
      <>
        <ScrollToTop />
        <ModuleLoader>
          <AuthRoutes />
        </ModuleLoader>
      </>
    ),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "dashboard/*",
        element: (
          <>
            <ScrollToTop />
            <ModuleLoader>
              <DashboardRoutes />
            </ModuleLoader>
          </>
        ),
      },
    ],
  },
]);
