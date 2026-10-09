import { useState } from "react";
import { apiGet } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";

const PLATFORMS = [
  { id: "facebook", name: "Facebook", color: "#1877F2" },
  { id: "instagram", name: "Instagram", color: "#E1306C" },
  { id: "x", name: "X (Twitter)", color: "#000000" },
  { id: "linkedin", name: "LinkedIn", color: "#0A66C2" },
] as const;

interface SocialConnectProps {
  connectedProviders?: string[];
  onConnect?: () => void;
}

export function SocialConnect({ connectedProviders = [], onConnect }: SocialConnectProps) {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleConnect = async (providerId: string) => {
    setError("");
    setConnecting(providerId);
    try {
      const data = await apiGet(`/integrations/social/${providerId}`);
      if (!data.url) throw new Error(data.error || "Failed to get OAuth URL");
      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setConnecting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-1">
        <h3 className="text-lg font-medium text-gray-900">Connect a Social Account</h3>
        <p className="text-sm text-gray-500">Select a platform to integrate with AutoSocial.</p>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLATFORMS.map((platform) => {
          const isConnected = connectedProviders.includes(platform.id);
          return (
            <Button
              key={platform.id}
              variant="outline"
              className={`justify-start gap-4 h-auto py-4 px-5 transition-all duration-200 rounded-2xl ${
                isConnected 
                  ? "bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50" 
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 bg-white"
              }`}
              onClick={() => handleConnect(platform.id)}
              disabled={connecting === platform.id}
            >
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" 
                style={{ backgroundColor: isConnected ? "#10b98110" : platform.color + "10" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill={isConnected ? "#10b981" : platform.color}>
                  {platform.id === "facebook" && <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />}
                  {platform.id === "instagram" && (
                    <>
                      <rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke={isConnected ? "#10b981" : platform.color} strokeWidth="2.5" />
                      <circle cx="12" cy="12" r="5" fill="none" stroke={isConnected ? "#10b981" : platform.color} strokeWidth="2.5" />
                    </>
                  )}
                  {platform.id === "x" && (
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  )}
                  {platform.id === "linkedin" && (
                    <>
                      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" />
                      <circle cx="4" cy="4" r="2" />
                    </>
                  )}
                </svg>
              </div>
              <div className="flex flex-col items-start text-left flex-1 space-y-0.5">
                <span className="text-[15px] font-semibold text-slate-800">{platform.name}</span>
                <span className="text-[13px] text-slate-500 font-medium">
                  {isConnected ? "Connected" : "Connect account"}
                </span>
              </div>
              {connecting === platform.id && (
                <div className="shrink-0 w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
