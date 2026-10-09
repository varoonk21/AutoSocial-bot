import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../../lib/fetcher";
import { STATUS_CONFIG, PLATFORM_LABELS } from "../../../constants/platforms";
import { PlatformIcon } from "../components/PlatformIcon";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface Stats {
  postsThisMonth: number;
  postsChange: number;
  upcomingPosts: number;
  postsByPlatform: Record<string, number>;
}

interface MappedPost {
  id: string;
  content: string;
  campaign: string;
  platform: string;
  platformLabel: string;
  status: string;
  date: string;
  image: string | null;
  releaseURL: string | null;
}

export function DashboardOverview() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<MappedPost[]>([]);
  const [stats, setStats] = useState<Stats>({
    postsThisMonth: 0,
    postsChange: 0,
    upcomingPosts: 0,
    postsByPlatform: {},
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);

  useEffect(() => {
    loadStats();
    loadPosts();
  }, []);

  async function loadStats() {
    try {
      setStatsLoading(true);
      const data = await apiGet("/posts/stats");
      setStats(data);
    } catch {
      // Stats will remain at defaults
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadPosts() {
    try {
      setPostsLoading(true);
      const data = await apiGet("/posts");
      if (data.posts && data.posts.length > 0) {
        const sorted = data.posts
          .filter((p: any) => p.state !== "DRAFT")
          .sort((a: any, b: any) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());
        const mapped = sorted.slice(0, 10).map((p: any) => {
          let imageUrl: string | null = null;
          try {
            const mediaItems = JSON.parse(p.image || "[]");
            const first = mediaItems[0];
            if (first) imageUrl = typeof first === "string" ? first : first?.path || null;
          } catch { /* ignore */ }
          return {
            id: p._id,
            content: p.content?.slice(0, 60) + (p.content?.length > 60 ? "..." : ""),
            campaign: "",
            platform: p.integrationId?.providerIdentifier || "x",
            platformLabel: PLATFORM_LABELS[p.integrationId?.providerIdentifier] || "Twitter",
            status: p.state,
            date: new Date(p.publishDate).toLocaleString(),
            image: imageUrl,
            releaseURL: p.releaseURL || null,
          };
        });
        setPosts(mapped);
      } else {
        setPosts([]);
      }
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-500 mt-1">Welcome back. Here's a snapshot of your content engine.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-500">Posts This Month</span>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a56db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-gray-900">
              {statsLoading ? "—" : stats.postsThisMonth}
            </span>
            {!statsLoading && stats.postsChange !== 0 && (
              <span className={`text-sm font-medium mb-1 ${stats.postsChange > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {stats.postsChange > 0 ? '↑' : '↓'} {Math.abs(stats.postsChange)}%
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-500">Posts by Platform</span>
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
              </svg>
            </div>
          </div>
          <div className="flex items-end gap-2">
            {statsLoading ? (
              <span className="text-3xl font-bold text-gray-900">—</span>
            ) : Object.keys(stats.postsByPlatform).length > 0 ? (
              <div className="flex gap-3">
                {Object.entries(stats.postsByPlatform).map(([platform, count]) => (
                  <div key={platform} className="flex items-center gap-1.5">
                    <PlatformIcon platform={platform} size={14} />
                    <span className="text-sm font-semibold text-gray-700">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-sm text-gray-400">No posts yet</span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-500">Upcoming Posts</span>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a56db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">
              {statsLoading ? "—" : stats.upcomingPosts}
            </span>
            <span className="text-sm text-gray-500">Scheduled for next 7 days</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Recent Activity Feed</h2>
          <Button variant="link" size="sm" onClick={() => navigate("/calendar")}>
            View All
          </Button>
        </div>

        <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          <div className="col-span-5">Post Content</div>
          <div className="col-span-2">Platform</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Date/Time</div>
          <div className="col-span-1 text-right">Link</div>
        </div>

        <div className="divide-y divide-gray-50">
          {postsLoading ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-gray-500 mb-2">No posts yet. Published and scheduled posts will appear here.</p>
              <Button size="sm" onClick={() => navigate("/dashboard/create-post")}>Create your first post</Button>
            </div>
          ) : (
            posts.map((post) => {
              const statusConf = STATUS_CONFIG[post.status] || STATUS_CONFIG.DRAFT;
              return (
                <div key={post.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-50/50 transition-colors">
                  <div className="col-span-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {post.image ? (
                        <img src={post.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{post.content}</p>
                      {post.campaign && <p className="text-xs mt-0.5 text-gray-400">{post.campaign}</p>}
                    </div>
                  </div>

                  <div className="col-span-2 flex items-center gap-2">
                    <div className="w-5 h-5 flex items-center justify-center">
                      <PlatformIcon platform={post.platform} size={16} />
                    </div>
                    <span className="text-sm text-gray-700">{post.platformLabel}</span>
                  </div>

                  <div className="col-span-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusConf.bg} ${statusConf.text} border ${statusConf.border}`}>
                      {statusConf.label}
                    </span>
                  </div>

                  <div className="col-span-2 flex items-center">
                    <span className="text-sm text-gray-500">{post.date}</span>
                  </div>

                  <div className="col-span-1 flex items-center justify-end">
                    {post.releaseURL && (
                      <a
                        href={post.releaseURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
