import { useState, useEffect } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/fetcher";
import { SocialConnect } from "../components/SocialConnect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function ConnectedAccountsPage() {
  const [integrations, setIntegrations] = useState([]);
  const [showConnect, setShowConnect] = useState(false);
  const [loading, setLoading] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState(null);

  useEffect(() => {
    loadIntegrations();
  }, []);

  async function loadIntegrations() {
    setLoadError(false);
    try {
      const data = await apiGet("/integrations/list");
      setIntegrations(data.integrations || []);
    } catch {
      setLoadError(true);
    }
  }

  const connectedProviders = integrations.map((i) => i.platform || i.providerIdentifier);

  const handleDisable = async (id, disabled) => {
    setLoading(id);
    try {
      await apiPut(`/integrations/${id}/disable`, { disabled });
      loadIntegrations();
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!disconnectTarget) return;
    const id = disconnectTarget;
    setDisconnectTarget(null);
    setLoading(id);
    try {
      await apiDelete(`/integrations/${id}`);
      loadIntegrations();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connected Accounts</h1>
          <p className="text-gray-500 mt-1">Manage your social media integrations.</p>
        </div>
        <Button onClick={() => setShowConnect(!showConnect)}>{showConnect ? "Close" : "+ Add Account"}</Button>
      </div>

      {showConnect && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <SocialConnect connectedProviders={connectedProviders} onConnect={loadIntegrations} />
        </div>
      )}

      {loadError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700">Couldn't load your connected accounts. Check your connection and try again.</p>
          <Button variant="outline" size="sm" onClick={loadIntegrations}>
            Retry
          </Button>
        </div>
      )}

      {/* Disconnect confirmation */}
      <Dialog open={!!disconnectTarget} onOpenChange={() => setDisconnectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect this account?</DialogTitle>
            <DialogDescription>
              Future scheduled posts to this account will fail. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!!loading}>
              {loading ? "Disconnecting..." : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {integrations.length === 0 && !showConnect ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 mb-4">No accounts connected yet.</p>
          <Button onClick={() => setShowConnect(true)}>Connect your first account</Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {integrations.map((integration) => (
            <div key={integration.id || integration._id} className="flex items-center gap-4 px-6 py-4">
              <img
                src={integration.avatar || integration.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(integration.name)}&background=e5e7eb&color=6b7280`}
                alt={integration.name}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{integration.name}</p>
                <p className="text-xs text-gray-400 capitalize">{integration.platform || integration.providerIdentifier}</p>
              </div>
              {integration.status === "reauth_required" && (
                <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200">Needs re-auth</span>
              )}
              <span
                className={`px-2.5 py-1 text-xs font-medium rounded-full ${integration.status === "disabled" ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}
              >
                {integration.status === "disabled" ? "Disabled" : "Active"}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loading === (integration.id || integration._id)}
                  onClick={() => handleDisable(integration.id || integration._id, integration.status !== "disabled")}
                >
                  {integration.status === "disabled" ? "Enable" : "Disable"}
                </Button>
                <Button variant="destructive" size="sm" disabled={loading === (integration.id || integration._id)} onClick={() => setDisconnectTarget(integration.id || integration._id)}>
                  Disconnect
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
