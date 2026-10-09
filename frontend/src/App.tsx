import { RouterProvider } from "react-router-dom";
import { router } from "@/routes/routes";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary label="the app">
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
