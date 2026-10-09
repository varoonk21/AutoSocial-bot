import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiGet, apiDelete } from "@/lib/fetcher";
import { STATUS_CONFIG } from "@/constants/platforms";
import { PlatformIcon } from "../components/PlatformIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Calendar, FileText, CheckCircle2, Clock, AlertCircle, Layers } from "lucide-react";

interface ManagePostsPageProps {
  initialTab?: string;
}

type TabType = "ALL" | "DRAFT" | "QUEUE" | "PUBLISHED" | "ERROR";

const TABS: { id: TabType; label: string; icon: any }[] = [
  { id: "ALL", label: "All Posts", icon: Layers },
  { id: "DRAFT", label: "Drafts", icon: FileText },
  { id: "QUEUE", label: "Scheduled", icon: Clock },
  { id: "PUBLISHED", label: "Published", icon: CheckCircle2 },
  { id: "ERROR", label: "Failed", icon: AlertCircle },
];

export function ManagePostsPage({ initialTab }: ManagePostsPageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTabFromQuery = (searchParams.get("tab")?.toUpperCase() as TabType) || undefined;
  const [activeTab, setActiveTab] = useState<TabType>(
    activeTabFromQuery || (initialTab?.toUpperCase() as TabType) || "ALL"
  );

  const [posts, setPosts] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId);
    if (tabId === "ALL") {
      searchParams.delete("tab");
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ tab: tabId.toLowerCase() }, { replace: true });
    }
  };

  async function loadData() {
    setLoading(true);
    try {
      const [intRes, postsRes] = await Promise.all([
        apiGet("/integrations/list"),
        apiGet(activeTab === "ALL" ? "/posts" : `/posts?state=${activeTab}`),
      ]);
      setIntegrations(intRes.integrations || []);
      setPosts(postsRes.posts || []);
    } catch (err) {
      console.error("Failed to load posts:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteClick = (postId: string) => {
    setDeleteTarget(postId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget);
    try {
      await apiDelete(`/posts/${deleteTarget}`);
      setPosts((prev) => prev.filter((p) => p._id !== deleteTarget));
    } catch (err) {
      console.error("Failed to delete post:", err);
    } finally {
      setDeleting(null);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleEdit = (post: any) => {
    navigate(`/dashboard/content/create/${post._id}`);
  };

  // Corrupt media payloads must never crash the whole list.
  const parseMedia = (raw: string | undefined) => {
    try {
      const items = JSON.parse(raw || "[]");
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1c2b36] tracking-tight">Manage Content</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            View, edit, and filter all your social media posts in one place.
          </p>
        </div>
        <Button
          onClick={() => navigate("/dashboard/content/create")}
          className="bg-[#243746] hover:bg-[#1c2b36] text-white gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Create Post</span>
        </Button>
      </div>

      {/* Tabs Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
                isActive
                  ? "bg-[#243746] text-white shadow-xs"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Posts List */}
      {loading ? (
        <Card className="border border-gray-200">
          <CardContent className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/4" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : posts.length === 0 ? (
        <Card className="border border-gray-200 shadow-sm rounded-2xl bg-white">
          <CardContent className="p-12 text-center">
            <p className="text-gray-400 text-sm">No posts found in this category.</p>
            <Button
              className="mt-4 bg-[#243746] hover:bg-[#1c2b36]"
              onClick={() => navigate("/dashboard/create-post")}
            >
              Create New Post
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-gray-200 shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardContent className="p-0 divide-y divide-gray-100">
            {posts.map((post) => {
              const integration =
                typeof post.integrationId === "object" && post.integrationId !== null
                  ? post.integrationId
                  : integrations.find((i) => i.id === post.integrationId || i._id === post.integrationId);

              const publishDate = post.publishDate ? new Date(post.publishDate) : null;
              const statusConf = STATUS_CONFIG[post.state] || STATUS_CONFIG.DRAFT;
              const mediaItems = parseMedia(post.image);
              const firstMedia = mediaItems[0];
              const mediaUrl = typeof firstMedia === "string" ? firstMedia : firstMedia?.path;
              const platform = integration?.providerIdentifier || null;

              const isEditable = post.state === "DRAFT" || post.state === "QUEUE";

              return (
                <div key={post._id} className="p-5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Media Thumbnail */}
                    <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden border border-gray-200/80">
                      {mediaUrl ? (
                        <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      )}
                    </div>

                    {/* Content Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1c2b36] line-clamp-2">
                        {post.content || <span className="italic text-gray-400">Untitled Post</span>}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        {platform && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-4 flex items-center justify-center">
                              <PlatformIcon platform={platform} size={12} />
                            </div>
                            <span className="text-xs text-gray-500 capitalize">{platform}</span>
                          </div>
                        )}
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusConf.bg} ${statusConf.text} border ${statusConf.border}`}
                        >
                          {statusConf.label}
                        </span>
                      </div>
                    </div>

                    {/* Actions & Timestamp */}
                    <div className="flex items-center gap-4 shrink-0">
                      {publishDate && (
                        <div className="text-xs text-gray-400 flex items-center gap-1 whitespace-nowrap">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {publishDate.toLocaleDateString()} {publishDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}
                      {isEditable && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(post)}
                          className="gap-1 text-xs font-medium"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </Button>
                      )}
                      {post.releaseURL && (
                        <a
                          href={post.releaseURL}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                        >
                          View ↗
                        </a>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleting === post._id}
                        onClick={() => handleDeleteClick(post._id)}
                        className="gap-1 text-xs font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Post</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Are you sure you want to delete this post? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteConfirm} disabled={!!deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
