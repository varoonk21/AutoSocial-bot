import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  Upload,
  Sparkles,
  Monitor,
  Smartphone,
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  X,
  Calendar,
  Check,
  Eraser,
  ThumbsUp,
  MessageSquare,
  Share2,
  Repeat,
  BarChart2,
  MoreHorizontal,
  Globe,
} from "lucide-react";
import { apiGet, apiPost } from "../../../lib/fetcher";
import { useEnhanceField } from "../hooks/useEnhanceField";
import { useGenerateContentFromImage } from "../hooks/useGenerateContentFromImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MediaLibraryModal } from "../components/MediaLibraryModal";
import { AiComposer } from "../components/AiComposer";
import { Switch } from "@/components/ui/switch";

const DEFAULT_PREVIEW_IMAGE = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=800&h=600";

const PLATFORMS = [
  { id: "facebook", name: "Facebook", color: "#1877F2", icon: "f" },
  { id: "instagram", name: "Instagram", color: "#E4405F", icon: "📷" },
  { id: "linkedin", name: "LinkedIn", color: "#0A66C2", icon: "in" },
  { id: "x", name: "X / Twitter", color: "#000000", icon: "𝕏" },
];

export function CreatePost() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: draftId } = useParams();

  // AI hooks
  const generateContentFromImage = useGenerateContentFromImage();

  // Media state
  const [selectedImage, setSelectedImage] = useState<{ path: string; type: string } | null>(null);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [applyWatermark, setApplyWatermark] = useState(false);

  // Content state
  const [captionText, setCaptionText] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  // Each field gets its own self-contained hook so both buttons are completely independent
  // and each one reads/writes only its own field's content.
  const captionAI = useEnhanceField({
    enhanceType: "caption",
    getValue: () => captionText,
    setValue: setCaptionText,
    transform: (raw) => {
      // Strip trailing hashtag lines from the caption response
      const lines = raw.split("\n").filter((l) => l.trim());
      const nonHashtag = lines.filter((l) => !l.startsWith("#"));
      return nonHashtag.join("\n").trim() || raw;
    },
  });

  const hashtagsAI = useEnhanceField({
    enhanceType: "hashtags",
    getValue: () => hashtagsText || captionText, // fall back to caption for context if hashtags are empty
    setValue: setHashtagsText,
    transform: (raw) => {
      // Extract the first hashtag line from the response
      const hashtagLine = raw.split("\n").find((l) => l.includes("#"));
      return hashtagLine || raw;
    },
  });

  // Preview state
  const [activePlatform, setActivePlatform] = useState("instagram");
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");

  // Integrations state
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>([]);

  // Post Now modal
  const [postNowOpen, setPostNowOpen] = useState(false);

  // Status
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Auto-save refs
  const lastSavedContentRef = useRef("");
  const hasChangesRef = useRef(false);

  useEffect(() => {
    apiGet("/integrations/list")
      .then((d: any) => {
        const list = d.integrations || [];
        setIntegrations(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // If editing a draft, fetch it by ID
    if (draftId) {
      apiGet(`/posts/${draftId}`)
        .then((data: any) => {
          const draft = data.post;
          if (draft) {
            setEditingDraftId(draft._id);
            // Parse content: everything before \n\n# is caption, rest is hashtags
            const content = draft.content || '';
            const parts = content.split(/\n\n#/);
            setCaptionText(parts[0]?.replace(/\n#$/, '') || content);
            setHashtagsText(parts[1] ? '#' + parts[1] : '');
            // Parse media
            try {
              const media = JSON.parse(draft.image || '[]');
              if (media[0]) {
                const path = typeof media[0] === 'string' ? media[0] : media[0].path;
                if (path) setSelectedImage({ path, type: 'image' });
              }
            } catch {}
          }
        })
        .catch(() => {});
    } else {
      // Reset form when creating a new post — unless an asset was handed over
      // from the media library's "Use in Post" (navigation state).
      const incoming = (location.state as any)?.asset;
      setEditingDraftId(null);
      setCaptionText("");
      setHashtagsText("");
      if (incoming?.path) {
        setSelectedImage({ path: incoming.path, type: incoming.type || "image" });
        hasChangesRef.current = true;
        // Clear the state so a refresh doesn't re-apply it.
        window.history.replaceState(null, "", location.pathname);
      } else {
        setSelectedImage(null);
      }
    }
  }, [draftId]);

  // Track content changes for auto-save
  const currentContent = `${captionText}\n\n${hashtagsText}`.trim();
  const currentMediaPath = selectedImage?.path || "";
  const currentSignature = `${currentContent}|||${currentMediaPath}`;

  useEffect(() => {
    if (currentSignature !== lastSavedContentRef.current && currentContent) {
      hasChangesRef.current = true;
    }
  }, [currentSignature, currentContent]);

  // Auto-save function
  const autoSave = useCallback(async () => {
    if (!hasChangesRef.current || !currentContent) return;

    setIsSaving(true);
    try {
      const { apiPut, apiPost } = await import("../../../lib/fetcher");
      const postData = {
        content: currentContent,
        media: selectedImage ? [{ path: selectedImage.path }] : [],
      };

      if (editingDraftId) {
        await apiPut(`/posts/${editingDraftId}`, postData);
      } else {
        // Create new draft
        const result = await apiPost("/posts", {
          type: "draft",
          posts: [{ content: currentContent, settings: { watermark: applyWatermark }, media: selectedImage ? [{ path: selectedImage.path }] : [] }],
        });
        if (result?.posts?.[0]?._id) {
          setEditingDraftId(result.posts[0]._id);
          // Update URL without reloading
          window.history.replaceState(null, "", `/dashboard/create-post/${result.posts[0]._id}`);
        }
      }

      lastSavedContentRef.current = currentSignature;
      hasChangesRef.current = false;
      setLastSaved(new Date());
    } catch (err) {
      console.error("Auto-save failed:", err);
    } finally {
      setIsSaving(false);
    }
  }, [currentContent, currentSignature, selectedImage, editingDraftId]);

  // Auto-save every 5 seconds if there are changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasChangesRef.current) {
        autoSave();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [autoSave]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChangesRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleSelectImage = (image: { path: string; type: string }) => {
    setSelectedImage(image);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
  };

  const handleAiGenerateContent = async () => {
    if (!selectedImage?.path) return;

    generateContentFromImage.mutate(
      { imageUrl: selectedImage.path },
      {
        onSuccess: (data) => {
          if (data.description) {
            setCaptionText(data.description);
            setHashtagsText(data.hashtags || "");
          }
        },
      }
    );
  };

  // Handlers are now managed inside useEnhanceField hooks above.

  const handleClear = () => {
    setCaptionText("");
    setHashtagsText("");
    setSelectedImage(null);
  };

  const toggleIntegration = (id: string) => {
    setSelectedIntegrations((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleSubmitPost = async (publishType: string = "draft") => {
    const fullContent = `${captionText}\n\n${hashtagsText}`.trim();
    if (!fullContent && !selectedImage) return;

    setLoading(true);
    try {
      if (publishType === "draft" && editingDraftId) {
        // Update existing draft
        const { apiPut } = await import("../../../lib/fetcher");
        await apiPut(`/posts/${editingDraftId}`, {
          content: fullContent,
          media: selectedImage ? [{ path: selectedImage.path }] : [],
        });
      } else if (publishType === "draft") {
        // Create new draft
        const posts = [{ content: fullContent, settings: { watermark: applyWatermark }, media: selectedImage ? [selectedImage.path] : [] }];
        await apiPost("/posts", { type: publishType, posts });
      } else {
        const postIntegrations = publishType === "now" ? selectedIntegrations : integrations.map((i) => i.id || i._id);
        if (postIntegrations.length === 0) {
          setSuccess("Please connect at least one social account first.");
          setTimeout(() => setSuccess(""), 3000);
          setLoading(false);
          return;
        }
        const posts = postIntegrations.map((integrationId) => ({
          integrationId,
          content: fullContent,
          settings: { watermark: applyWatermark },
          media: selectedImage ? [{ path: selectedImage.path }] : [],
        }));
        await apiPost("/posts", { type: publishType, posts });
      }
      // Publishing "now" from an editing draft: remove the draft so it doesn't
      // linger as a duplicate of the just-published post.
      if (publishType === "now" && editingDraftId) {
        try {
          const { apiDelete } = await import("../../../lib/fetcher");
          await apiDelete(`/posts/${editingDraftId}`);
        } catch (err) {
          console.error("Failed to remove published draft:", err);
        }
      }
      // Reset form
      setCaptionText("");
      setHashtagsText("");
      setSelectedImage(null);
      setEditingDraftId(null);
      lastSavedContentRef.current = "";
      hasChangesRef.current = false;
      const msg = publishType === "draft" ? (editingDraftId ? "Draft updated!" : "Saved as draft!") : publishType === "now" ? "Post queued for publishing!" : "Post scheduled!";
      setSuccess(msg);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setSuccess(err?.message || "Failed to create post. Please try again.");
      setTimeout(() => setSuccess(""), 3000);
    }
    setLoading(false);
  };

  const handlePostNow = () => {
    setPostNowOpen(true);
  };

  const handleConfirmPostNow = async () => {
    setPostNowOpen(false);
    await handleSubmitPost("now");
  };

  const handleSchedulePost = () => {
    navigate("/dashboard/scheduled-posts", {
      state: {
        fromCreate: true,
        caption: captionText,
        hashtags: hashtagsText,
        image: selectedImage,
      },
    });
  };

  const previewImageUrl = selectedImage?.path || DEFAULT_PREVIEW_IMAGE;
  const hasContent = captionText.trim() || hashtagsText.trim() || selectedImage;

  return (
    <div className="max-w-[1320px] mx-auto space-y-6 text-neutral-900 pb-12 select-none">
      {/* Media Library Modal */}
      <MediaLibraryModal open={mediaLibraryOpen} onOpenChange={setMediaLibraryOpen} onSelect={handleSelectImage} />

      {/* Post Now Confirmation Modal */}
      <Dialog open={postNowOpen} onOpenChange={setPostNowOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#243746]/10 text-[#243746]">
                <Send className="w-5 h-5" />
              </div>
              Confirm Post
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-gray-500">Select the social media account(s) to post to:</p>

            <div className="max-h-56 overflow-y-auto space-y-3">
              {PLATFORMS.map((platform) => {
                const platformAccounts = integrations.filter(
                  (acc) => (acc.platform || acc.providerIdentifier || '').toLowerCase() === platform.id
                );
                const hasAccounts = platformAccounts.length > 0;

                return (
                  <div key={platform.id} className={`rounded-xl border overflow-hidden ${!hasAccounts ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200'}`}>
                    {/* Platform header */}
                    <div className={`flex items-center justify-between px-3 py-2 ${!hasAccounts ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ backgroundColor: platform.color }}
                        >
                          {platform.icon}
                        </span>
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{platform.name}</span>
                        {hasAccounts && (
                          <span className="text-[10px] text-gray-400 font-medium">{platformAccounts.length} account{platformAccounts.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      {!hasAccounts && (
                        <span className="text-[10px] text-gray-400 italic">No connected accounts</span>
                      )}
                    </div>

                    {/* Account rows */}
                    {hasAccounts ? (
                      <div className="px-2 pb-2 space-y-1">
                        {platformAccounts.map((acc) => {
                          const isSelected = selectedIntegrations.includes(acc.id || acc._id);
                          return (
                            <div
                              key={acc.id || acc._id}
                              onClick={() => toggleIntegration(acc.id || acc._id)}
                              className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                                isSelected ? 'border-[#243746] bg-[#243746]/5' : 'border-gray-100 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={acc.avatar || acc.picture || "https://ui-avatars.com/api/?name=" + acc.name}
                                  alt=""
                                  className="w-7 h-7 rounded-full"
                                />
                                <span className="text-sm font-medium text-gray-800">{acc.name}</span>
                              </div>
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                                isSelected ? 'border-[#243746] bg-[#243746]' : 'border-gray-300'
                              }`}>
                                {isSelected && (
                                  <Check className="w-3 h-3 text-white" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-3 pb-2.5">
                        <p className="text-[11px] text-gray-400">Connect a {platform.name} account in Settings to post here.</p>
                      </div>
                    )}
                  </div>
                );
              })}

              {integrations.length === 0 && (
                <p className="text-xs text-gray-400 py-4 text-center">No connected accounts found. Connect accounts in Settings first.</p>
              )}
            </div>

            {/* Post Summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Post Preview</h4>
              {selectedImage && <img src={selectedImage.path} alt="" className="w-full h-32 object-cover rounded-lg" />}
              {captionText && <p className="text-xs text-gray-700 line-clamp-2">{captionText}</p>}
              {hashtagsText && <p className="text-[11px] text-gray-600 font-medium">{hashtagsText}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPostNowOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmPostNow} disabled={loading || selectedIntegrations.length === 0}>
              <Send className="w-4 h-4" />
              <span>Post Now</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Toast */}
      {success && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#243746] text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Page Title */}
      <div className="pb-2 border-b border-gray-200/80 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1c2b36] tracking-tight">
            {editingDraftId ? "Edit Draft" : "Create Post"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Design and publish content across your social platforms.</p>
        </div>
        {isSaving && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3 h-3 border-2 border-gray-300 border-t-[#243746] rounded-full animate-spin" />
            <span>Saving...</span>
          </div>
        )}
        {!isSaving && lastSaved && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Check className="w-3 h-3 text-emerald-500" />
            <span>Saved {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN — Creation Controls */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* AI Composer */}
          <AiComposer onUseVariation={(text) => setCaptionText(text)} />
          {/* Upload Image Card */}
          <Card className="py-0">
            <CardContent className="p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1c2b36]">Media Asset</label>
                {hasContent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 h-6 px-2 text-[11px]"
                    onClick={handleClear}
                  >
                    <Eraser className="w-3 h-3 text-red-600" />
                    <span className="font-semibold">Clear</span>
                  </Button>
                )}
              </div>

              {selectedImage ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center p-2 min-h-[160px] max-h-[300px]">
                  <img src={selectedImage.path} alt="Selected" className="max-h-[280px] w-auto max-w-full object-contain rounded-lg shadow-2xs" />
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="xs"
                      className="bg-white/90 hover:bg-white text-gray-800 shadow-sm text-[11px] h-6 px-2"
                      onClick={() => setMediaLibraryOpen(true)}
                    >
                      <Upload className="w-3 h-3" />
                      <span>Change</span>
                    </Button>
                    <Button variant="destructive" size="icon-xs" className="shadow-sm" onClick={handleRemoveImage} aria-label="Remove image">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full border-dashed border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50/80 h-auto py-3.5"
                  onClick={() => setMediaLibraryOpen(true)}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="p-2 rounded-xl bg-gray-100 text-gray-700">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-800 block">Upload Image</span>
                      <span className="text-[10px] text-gray-400">Choose from your media library</span>
                    </div>
                  </div>
                </Button>
              )}
              {selectedImage && selectedImage.type !== "video" && (
                <label className="flex items-center justify-between pt-1 cursor-pointer">
                  <span className="text-xs font-medium text-gray-700">
                    Brand watermark
                    <span className="block text-[10px] font-normal text-gray-400">
                      Overlay your brand kit logo at publish time
                    </span>
                  </span>
                  <Switch checked={applyWatermark} onCheckedChange={setApplyWatermark} aria-label="Apply brand watermark" />
                </label>
              )}
            </CardContent>
          </Card>

          {/* AI Generate Content Button — Only shown when an image is uploaded */}
          {selectedImage && (
            <Button
              className="w-full bg-[#243746] hover:bg-[#1c2b36] text-white shadow-md shadow-gray-200 h-8 text-xs font-medium"
              onClick={handleAiGenerateContent}
              disabled={generateContentFromImage.isPending}
            >
              {generateContentFromImage.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating...</span>
                </div>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Content with AI</span>
                </>
              )}
            </Button>
          )}

          {/* Caption / Description Field */}
          <Card className="py-0">
            <CardContent className="p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1c2b36]">Caption / Description</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-700 hover:text-gray-900 hover:bg-gray-100 h-6 px-2 text-[11px]"
                  onClick={captionAI.improve}
                  disabled={captionAI.isPending || !captionText.trim()}
                >
                  {captionAI.isPending ? (
                    <div className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>Improve with AI</span>
                </Button>
              </div>
              <Textarea
                rows={3}
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                placeholder="Write your caption or let AI generate one for you..."
                className="resize-none border-gray-200 focus:border-gray-400 focus:ring-gray-200 text-xs leading-relaxed p-2.5"
              />
            </CardContent>
          </Card>

          {/* Hashtags Field */}
          <Card className="py-0">
            <CardContent className="p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1c2b36]">Hashtags</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-700 hover:text-gray-900 hover:bg-gray-100 h-6 px-2 text-[11px]"
                  onClick={hashtagsAI.improve}
                  disabled={hashtagsAI.isPending || (!captionText.trim() && !hashtagsText.trim())}
                >
                  {hashtagsAI.isPending ? (
                    <div className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>Improve with AI</span>
                </Button>
              </div>
              <Textarea
                rows={2}
                value={hashtagsText}
                onChange={(e) => setHashtagsText(e.target.value)}
                placeholder="#hashtag1 #hashtag2 #hashtag3"
                className="resize-none border-gray-200 focus:border-gray-400 focus:ring-gray-200 text-xs leading-relaxed p-2.5"
              />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN — Live Device Preview & Action Bar */}
        <div className="lg:col-span-5">
          <Card className="sticky top-20 py-0">
            <CardContent className="p-4 space-y-3.5">
              {/* Preview Card Header & Platform Tabs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#1c2b36]">Post Preview</h3>
                  <ToggleGroup
                    type="single"
                    value={viewMode}
                    onValueChange={(value) => value && setViewMode(value as "desktop" | "mobile")}
                    variant="outline"
                    size="sm"
                  >
                    <ToggleGroupItem value="desktop" title="Desktop View">
                      <Monitor className="w-3.5 h-3.5" />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="mobile" title="Mobile View">
                      <Smartphone className="w-3.5 h-3.5" />
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {/* Platform Tabs Bar (Matching Reference) */}
                <div className="flex items-center gap-6 border-b border-gray-100 px-1 pb-0">
                  {PLATFORMS.map((p) => {
                    const isActive = activePlatform === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setActivePlatform(p.id)}
                        className={`flex items-center gap-1.5 pb-2 text-xs font-semibold transition-all cursor-pointer relative ${
                          isActive ? "text-[#1c2b36]" : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        {p.id === "instagram" && <span className="text-sm leading-none">📷</span>}
                        {p.id === "facebook" && <span className="font-bold text-[#1877F2] text-sm leading-none">f</span>}
                        {p.id === "linkedin" && <span className="font-bold text-[#0A66C2] text-xs leading-none">in</span>}
                        {p.id === "x" && <span className="font-bold text-black text-xs leading-none">𝕏</span>}
                        <span>{p.name}</span>
                        {isActive && (
                          <div
                            className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${
                              p.id === "instagram"
                                ? "bg-gradient-to-r from-purple-500 via-pink-500 to-amber-500"
                                : p.id === "facebook"
                                  ? "bg-[#1877F2]"
                                  : p.id === "linkedin"
                                    ? "bg-[#0A66C2]"
                                    : "bg-black"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Platform Specific Realistic Mockup Container */}
              <div className={`mx-auto transition-all ${viewMode === "mobile" ? "max-w-[310px]" : "w-full"}`}>
                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  {activePlatform === "instagram" && (
                    /* INSTAGRAM PREVIEW — Matching Screenshot 1 */
                    <div>
                      {/* Instagram Header */}
                      <div className="flex items-center justify-between px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
                            <div className="w-full h-full rounded-full bg-white flex items-center justify-center p-[1px]">
                              <div className="w-full h-full rounded-full bg-[#243746] flex items-center justify-center text-white text-[10px] font-bold">
                                A
                              </div>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-gray-900">AutoSocial</span>
                        </div>
                        <MoreHorizontal className="w-4 h-4 text-gray-500 cursor-pointer" />
                      </div>

                      {/* Instagram Image */}
                      <div className="bg-gray-50 relative overflow-hidden flex items-center justify-center min-h-[220px]">
                        <img src={previewImageUrl} alt="Post Preview" className="w-full h-64 object-contain" />
                        {!selectedImage && (
                          <div className="absolute inset-0 bg-black/5 flex items-center justify-center">
                            <div className="bg-white/80 backdrop-blur-sm rounded-xl px-3 py-1.5 text-[10px] text-gray-500 font-medium">
                              Default preview image
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Instagram Actions & Caption */}
                      <div className="p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between text-gray-800">
                          <div className="flex items-center gap-3.5">
                            <Heart className="w-5 h-5 hover:text-red-500 cursor-pointer transition-colors" />
                            <MessageCircle className="w-5 h-5 hover:text-gray-600 cursor-pointer transition-colors" />
                            <Send className="w-5 h-5 hover:text-gray-600 cursor-pointer transition-colors" />
                          </div>
                          <Bookmark className="w-5 h-5 hover:text-gray-600 cursor-pointer transition-colors" />
                        </div>

                        <div className="text-xs leading-relaxed text-gray-900">
                          <span className="font-bold mr-1.5">autosocial_app</span>
                          {captionText ? (
                            <span className="whitespace-pre-wrap">{captionText}</span>
                          ) : (
                            <span className="text-gray-300 italic">Your caption will appear here...</span>
                          )}
                          {hashtagsText && (
                            <p className="text-[11px] text-indigo-600 font-medium mt-1">{hashtagsText}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activePlatform === "facebook" && (
                    /* FACEBOOK PREVIEW — Matching Screenshot 2 */
                    <div>
                      {/* Facebook Header */}
                      <div className="flex items-center justify-between px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-gray-300 flex items-center justify-center text-gray-700 font-bold text-xs">
                            AS
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#1877F2] leading-tight">AutoSocial</p>
                            <div className="flex items-center gap-1 text-[10px] text-gray-400">
                              <span>Today at 19:33</span>
                              <span>•</span>
                              <Globe className="w-2.5 h-2.5 text-gray-400" />
                            </div>
                          </div>
                        </div>
                        <MoreHorizontal className="w-4 h-4 text-gray-500 cursor-pointer" />
                      </div>

                      {/* Facebook Text (ABOVE Image!) */}
                      <div className="px-3.5 pb-3 space-y-1">
                        {captionText ? (
                          <p className="text-xs text-gray-900 leading-relaxed whitespace-pre-wrap">{captionText}</p>
                        ) : (
                          <p className="text-xs text-gray-300 italic">Write your post caption...</p>
                        )}
                        {hashtagsText && (
                          <p className="text-[11px] text-[#1877F2] font-medium">{hashtagsText}</p>
                        )}
                        <span className="text-[10px] text-[#1877F2] hover:underline cursor-pointer block pt-0.5 font-medium">See translation</span>
                      </div>

                      {/* Facebook Image */}
                      <div className="bg-gray-50 relative overflow-hidden flex items-center justify-center min-h-[200px]">
                        <img src={previewImageUrl} alt="Post Preview" className="w-full h-64 object-contain" />
                        {!selectedImage && (
                          <div className="absolute inset-0 bg-black/5 flex items-center justify-center">
                            <div className="bg-white/80 backdrop-blur-sm rounded-xl px-3 py-1.5 text-[10px] text-gray-500 font-medium">
                              Default preview image
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Facebook Action Bar */}
                      <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-around text-xs text-gray-600 font-medium">
                        <button type="button" className="flex items-center gap-1.5 hover:bg-gray-50 px-3 py-1 rounded-md transition-colors cursor-pointer">
                          <ThumbsUp className="w-4 h-4 text-gray-500" />
                          <span>Like</span>
                        </button>
                        <button type="button" className="flex items-center gap-1.5 hover:bg-gray-50 px-3 py-1 rounded-md transition-colors cursor-pointer">
                          <MessageSquare className="w-4 h-4 text-gray-500" />
                          <span>Comment</span>
                        </button>
                        <button type="button" className="flex items-center gap-1.5 hover:bg-gray-50 px-3 py-1 rounded-md transition-colors cursor-pointer">
                          <Share2 className="w-4 h-4 text-gray-500" />
                          <span>Share</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {activePlatform === "linkedin" && (
                    /* LINKEDIN PREVIEW */
                    <div>
                      {/* LinkedIn Header */}
                      <div className="flex items-center justify-between px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-[#0A66C2] text-white flex items-center justify-center font-bold text-xs">
                            in
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-900 leading-tight">AutoSocial</p>
                            <div className="flex items-center gap-1 text-[10px] text-gray-400">
                              <span>12,480 followers</span>
                              <span>•</span>
                              <span>1h</span>
                              <span>•</span>
                              <Globe className="w-2.5 h-2.5" />
                            </div>
                          </div>
                        </div>
                        <MoreHorizontal className="w-4 h-4 text-gray-500 cursor-pointer" />
                      </div>

                      {/* LinkedIn Text (ABOVE Image!) */}
                      <div className="px-3.5 pb-3 space-y-1">
                        {captionText ? (
                          <p className="text-xs text-gray-900 leading-relaxed whitespace-pre-wrap">{captionText}</p>
                        ) : (
                          <p className="text-xs text-gray-300 italic">Write your professional post...</p>
                        )}
                        {hashtagsText && (
                          <p className="text-[11px] text-[#0A66C2] font-semibold">{hashtagsText}</p>
                        )}
                      </div>

                      {/* LinkedIn Image */}
                      <div className="bg-gray-50 relative overflow-hidden flex items-center justify-center min-h-[200px]">
                        <img src={previewImageUrl} alt="Post Preview" className="w-full h-64 object-contain" />
                        {!selectedImage && (
                          <div className="absolute inset-0 bg-black/5 flex items-center justify-center">
                            <div className="bg-white/80 backdrop-blur-sm rounded-xl px-3 py-1.5 text-[10px] text-gray-500 font-medium">
                              Default preview image
                            </div>
                          </div>
                        )}
                      </div>

                      {/* LinkedIn Action Bar */}
                      <div className="px-2 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 font-medium">
                        <button type="button" className="flex items-center gap-1 hover:bg-gray-50 px-2 py-1 rounded transition-colors cursor-pointer">
                          <ThumbsUp className="w-3.5 h-3.5 text-gray-500" />
                          <span>Like</span>
                        </button>
                        <button type="button" className="flex items-center gap-1 hover:bg-gray-50 px-2 py-1 rounded transition-colors cursor-pointer">
                          <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                          <span>Comment</span>
                        </button>
                        <button type="button" className="flex items-center gap-1 hover:bg-gray-50 px-2 py-1 rounded transition-colors cursor-pointer">
                          <Repeat className="w-3.5 h-3.5 text-gray-500" />
                          <span>Repost</span>
                        </button>
                        <button type="button" className="flex items-center gap-1 hover:bg-gray-50 px-2 py-1 rounded transition-colors cursor-pointer">
                          <Send className="w-3.5 h-3.5 text-gray-500" />
                          <span>Send</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {activePlatform === "x" && (
                    /* X / TWITTER PREVIEW */
                    <div>
                      {/* X Header */}
                      <div className="flex items-center justify-between px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs">
                            𝕏
                          </div>
                          <div>
                            <div className="flex items-center gap-1 text-xs">
                              <span className="font-bold text-gray-900">AutoSocial</span>
                              <span className="text-gray-400">@autosocial</span>
                              <span className="text-gray-400">• 1h</span>
                            </div>
                          </div>
                        </div>
                        <span className="font-bold text-black text-xs">𝕏</span>
                      </div>

                      {/* X Tweet Text (ABOVE Image!) */}
                      <div className="px-3.5 pb-3 space-y-1">
                        {captionText ? (
                          <p className="text-xs text-gray-900 leading-relaxed whitespace-pre-wrap">{captionText}</p>
                        ) : (
                          <p className="text-xs text-gray-300 italic">What's happening?</p>
                        )}
                        {hashtagsText && (
                          <p className="text-[11px] text-blue-500 font-medium">{hashtagsText}</p>
                        )}
                      </div>

                      {/* X Media (Rounded container) */}
                      <div className="px-3.5 pb-3">
                        <div className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 relative min-h-[180px] flex items-center justify-center">
                          <img src={previewImageUrl} alt="Tweet Media" className="w-full h-56 object-contain" />
                          {!selectedImage && (
                            <div className="absolute inset-0 bg-black/5 flex items-center justify-center">
                              <div className="bg-white/80 backdrop-blur-sm rounded-xl px-3 py-1.5 text-[10px] text-gray-500 font-medium">
                                Default preview image
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* X Engagement Bar */}
                      <div className="px-3.5 py-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                        <span className="flex items-center gap-1 hover:text-blue-500 cursor-pointer">
                          <MessageSquare className="w-3.5 h-3.5" /> 12
                        </span>
                        <span className="flex items-center gap-1 hover:text-emerald-500 cursor-pointer">
                          <Repeat className="w-3.5 h-3.5" /> 5
                        </span>
                        <span className="flex items-center gap-1 hover:text-pink-500 cursor-pointer">
                          <Heart className="w-3.5 h-3.5" /> 48
                        </span>
                        <span className="flex items-center gap-1 hover:text-blue-500 cursor-pointer">
                          <BarChart2 className="w-3.5 h-3.5" /> 1.2K
                        </span>
                        <Bookmark className="w-3.5 h-3.5 hover:text-gray-700 cursor-pointer" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons Below Preview Card */}
              <div className="flex items-center gap-3 pt-3 border-t border-gray-200/80">
                <Button variant="outline" className="flex-1" onClick={() => handleSubmitPost("draft")} disabled={!hasContent}>
                  {isSaving ? "Saving..." : editingDraftId ? "Update Draft" : "Save Draft"}
                </Button>
                <Button className="flex-1 bg-[#243746] hover:bg-[#1c2b36]" onClick={handlePostNow} disabled={!hasContent || loading}>
                  <Send className="w-4 h-4" />
                  <span>Post Now</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                  onClick={handleSchedulePost}
                  disabled={!hasContent}
                >
                  <Calendar className="w-4 h-4" />
                  <span>Schedule</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
