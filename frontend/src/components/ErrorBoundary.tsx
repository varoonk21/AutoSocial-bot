import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown above the message to identify which section failed. */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render crashes in the subtree and shows a retryable fallback
 * instead of a blank white screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  private handleGoHome = () => {
    this.setState({ error: null });
    window.location.href = "/dashboard";
  };

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center"
        >
          <div className="p-4 rounded-2xl bg-red-50 text-red-600 mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-[#1c2b36]">
            Something went wrong{this.props.label ? ` in ${this.props.label}` : ""}
          </h2>
          <p className="text-sm text-gray-500 mt-2 max-w-md">
            This section crashed instead of loading. Your data is safe — try again,
            or head back to the dashboard.
          </p>
          <div className="flex items-center gap-3 mt-6">
            <Button onClick={this.handleRetry} className="bg-[#243746] hover:bg-[#1c2b36] text-white gap-2">
              <RefreshCw className="w-4 h-4" />
              <span>Try again</span>
            </Button>
            <Button variant="outline" onClick={this.handleGoHome} className="gap-2">
              <Home className="w-4 h-4" />
              <span>Dashboard</span>
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
