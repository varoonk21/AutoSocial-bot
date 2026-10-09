import { Compass, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="p-4 rounded-2xl bg-gray-100 text-gray-500 mb-4">
        <Compass className="w-8 h-8" />
      </div>
      <h1 className="text-4xl font-extrabold text-[#1c2b36]">404</h1>
      <h2 className="text-lg font-bold text-[#1c2b36] mt-2">Page not found</h2>
      <p className="text-sm text-gray-500 mt-2 max-w-md">
        The page you're looking for doesn't exist or was moved.
      </p>
      <div className="flex items-center gap-3 mt-6">
        <Button
          onClick={() => navigate("/dashboard")}
          className="bg-[#243746] hover:bg-[#1c2b36] text-white gap-2"
        >
          <Home className="w-4 h-4" />
          <span>Back to dashboard</span>
        </Button>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    </div>
  );
}
