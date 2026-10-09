import { Route, Routes } from "react-router-dom";
import { PublicRoute } from "@/routes/PublicRoute";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { NotFoundPage } from "@/features/dashboard/pages/NotFoundPage";

export default function AuthRoutes() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
