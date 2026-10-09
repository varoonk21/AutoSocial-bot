import { useState, useEffect } from "react";
import { apiGet, apiPut } from "../../../lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Camera } from "lucide-react";
import { useFileUpload } from "../hooks/useFileUpload";
import { authClient, useSession } from "@/lib/auth-client";
import { useImageStore } from "@/store/imageStore";

export function SettingsPage() {
  const getImageUrl = useImageStore((state) => state.getImageUrl);
  const { data: session } = useSession();
  const { upload, inputRef, uploading, openPicker } = useFileUpload({
    onUpload: async (media) => {
      await authClient.updateUser({ image: media.key });
      setToast("Profile picture updated!");
      setTimeout(() => setToast(""), 3000);
    },
    onError: () => {
      setToast("Failed to upload picture");
      setTimeout(() => setToast(""), 3000);
    },
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notifications, setNotifications] = useState({
    postPublished: true,
    postFailed: true,
    tokenExpiring: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const data = await apiGet("/settings");
      setName(data.name || "");
      setEmail(data.email || "");
      setNotifications(
        data.notifications || {
          postPublished: true,
          postFailed: true,
          tokenExpiring: true,
        },
      );
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setToast("");
    try {
      await apiPut("/settings", { name, notifications });
      setToast("Settings saved successfully!");
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      setToast("Failed to save settings");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Manage your account preferences.</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <p className="text-gray-400">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Profile Picture</label>
            <div className="flex items-center gap-5">
              <div className="relative">
                <Avatar className="w-16 h-16">
                  <AvatarImage
                    src={session?.user?.image ? getImageUrl(session.user.image) : undefined}
                    alt="Profile Picture"
                  />
                  <AvatarFallback>
                    {name?.slice(0, 2).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                {uploading && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded-full">
                    <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <input
                  type="file"
                  ref={inputRef}
                  className="hidden"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file);
                  }}
                />
                <Button variant="outline" size="sm" onClick={openPicker} disabled={uploading}>
                  <Camera className="w-4 h-4 mr-2" />
                  Change Picture
                </Button>
                <p className="text-xs text-gray-500">JPG, GIF or PNG. Max size of 10MB.</p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <Input type="email" value={email} readOnly className="cursor-default" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <p className="text-sm text-gray-500">Choose which events show up in your notification bell.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: "postPublished", label: "Post published", desc: "Get notified when a scheduled post goes live" },
            { key: "postFailed", label: "Post failed", desc: "Get notified when a post fails to publish" },
            { key: "tokenExpiring", label: "Token expiring", desc: "Get notified when a social account token needs renewal" },
          ].map((item) => (
            <label key={item.key} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
              <Switch
                checked={notifications[item.key]}
                onCheckedChange={(checked) => setNotifications((prev) => ({ ...prev, [item.key]: checked }))}
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        {toast && <p className={`text-sm ${toast.includes("success") ? "text-green-600" : "text-red-600"}`}>{toast}</p>}
      </div>
    </div>
  );
}
