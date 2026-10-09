import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/fetcher";
import { PlatformIcon } from "../components/PlatformIcon";
import { PLATFORM_LABELS } from "@/constants/platforms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Clock, Eye, Heart, MessageCircle, Share2, MousePointerClick } from "lucide-react";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Engagement {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
}

interface AnalyticsData {
  totalPosts: number;
  postsGrowth: number;
  postsByPlatform: Record<string, number>;
  bestPlatform: string | null;
  monthlyPosts: { _id: { year: number; month: number }; count: number }[];
  postsByStatus: Record<string, number>;
  totalDrafts: number;
  totalScheduled: number;
  totalErrors: number;
  totalEngagement: Engagement;
  engagementByPlatform: Record<string, Engagement & { posts: number }>;
  bestTimes: { hour: number; label: string; posts: number }[];
}

interface PostItem {
  _id: string;
  content: string;
  publishDate: string;
  releaseURL?: string;
  engagement?: Engagement;
}

function monthLabel(entry: { _id: { year: number; month: number } }): string {
  const m = MONTH_NAMES[entry._id.month - 1];
  const y = String(entry._id.year).slice(2);
  return `${m} '${y}`;
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-500">{label}</h3>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setLoadError(false);
    try {
      const [analytics, postList] = await Promise.all([
        apiGet(`/posts/analytics?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`),
        apiGet("/posts?state=PUBLISHED"),
      ]);
      setData(analytics);
      setPosts(postList.posts || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const summary = await apiPost("/posts/refresh-insights", {});
      setRefreshMsg(
        `Checked ${summary.checked} posts — ${summary.updated} updated from platforms.`
      );
      const analytics = await apiGet(`/posts/analytics?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
      setData(analytics);
    } catch {
      setRefreshMsg("Couldn't reach the platforms right now. Stored metrics are shown.");
    } finally {
      setRefreshing(false);
    }
  }

  const totalAcrossAll = data
    ? data.totalPosts + data.totalDrafts + data.totalScheduled + data.totalErrors
    : 0;

  const maxMonthly = data ? Math.max(...data.monthlyPosts.map((m) => m.count), 1) : 1;

  const maxPlatformEngagement = data
    ? Math.max(...Object.values(data.engagementByPlatform).map((e) => e.impressions), 1)
    : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1">Track your content performance across platforms.</p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh insights"}
        </Button>
      </div>

      {refreshMsg && (
        <div role="status" className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          {refreshMsg}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
              <div className="h-8 bg-gray-200 rounded w-1/2 mb-2" />
            </div>
          ))}
        </div>
      ) : loadError || !data ? (
        <div role="alert" className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">Unable to load analytics data.</p>
          <Button variant="outline" onClick={loadAll}>Retry</Button>
        </div>
      ) : (
        <>
          {/* Engagement stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <StatCard icon={Eye} label="Impressions" value={data.totalEngagement.impressions} />
            <StatCard icon={Heart} label="Likes" value={data.totalEngagement.likes} />
            <StatCard icon={MessageCircle} label="Comments" value={data.totalEngagement.comments} />
            <StatCard icon={Share2} label="Shares" value={data.totalEngagement.shares} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Engagement by platform */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-500 mb-4">Engagement by Platform</h3>
              {Object.keys(data.engagementByPlatform).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(data.engagementByPlatform)
                    .sort((a, b) => b[1].impressions - a[1].impressions)
                    .map(([platform, eng]) => {
                      const pct = Math.round((eng.impressions / maxPlatformEngagement) * 100);
                      return (
                        <div key={platform} className="flex items-center gap-3">
                          <div className="w-5 h-5 flex items-center justify-center">
                            <PlatformIcon platform={platform} size={16} />
                          </div>
                          <span className="text-sm font-medium text-gray-700 w-20">
                            {PLATFORM_LABELS[platform] || platform}
                          </span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gray-800 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-gray-600 w-16 text-right">
                            {eng.impressions.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No engagement data yet. Publish posts to see metrics.</p>
              )}
            </div>

            {/* Best time to post */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-500">Best Time to Post</h3>
              </div>
              {data.bestTimes.length > 0 ? (
                <div className="space-y-3">
                  {data.bestTimes.map((t, i) => (
                    <div key={t.hour} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                      <span className="text-xs text-gray-400">based on {t.posts} post{t.posts === 1 ? "" : "s"}</span>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 pt-2">
                    Ranked by average engagement (impressions + weighted likes, comments, shares) per publish hour.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  Not enough published posts with engagement data yet. Keep publishing and check back.
                </p>
              )}
            </div>
          </div>

          {/* Per-post engagement */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Top Posts</h3>
            <p className="text-sm text-gray-500 mb-4">Click a post to see its full engagement breakdown.</p>
            {posts.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {[...posts]
                  .sort((a, b) => (b.engagement?.impressions || 0) - (a.engagement?.impressions || 0))
                  .slice(0, 10)
                  .map((post) => (
                    <button
                      key={post._id}
                      onClick={() => setSelectedPost(post)}
                      className="w-full text-left py-3 flex items-center gap-4 hover:bg-gray-50 rounded-lg px-2 -mx-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{post.content}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(post.publishDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
                        <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{(post.engagement?.impressions || 0).toLocaleString()}</span>
                        <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />{(post.engagement?.likes || 0).toLocaleString()}</span>
                        <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{(post.engagement?.comments || 0).toLocaleString()}</span>
                      </div>
                    </button>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No published posts yet.</p>
            )}
          </div>

          {/* Posts over time (with year labels) */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Posts Over Time</h3>
            {data.monthlyPosts.length > 0 ? (
              <div className="flex items-end gap-3 h-48">
                {data.monthlyPosts.map((entry) => {
                  const height = (entry.count / maxMonthly) * 100;
                  return (
                    <div key={`${entry._id.year}-${entry._id.month}`} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-xs font-semibold text-gray-700">{entry.count}</span>
                      <div
                        className="w-full bg-gray-800 rounded-t-md transition-all"
                        style={{ height: `${height}%`, minHeight: entry.count > 0 ? "8px" : "2px" }}
                      />
                      <span className="text-xs text-gray-500 whitespace-nowrap">{monthLabel(entry)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                Start publishing posts to see trends over time.
              </div>
            )}
          </div>

          {/* Status breakdown + quick stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-500 mb-4">Post Status Breakdown</h3>
              <div className="space-y-3">
                {[
                  { key: "PUBLISHED", label: "Published", color: "bg-emerald-500" },
                  { key: "QUEUE", label: "Scheduled", color: "bg-blue-500" },
                  { key: "DRAFT", label: "Drafts", color: "bg-yellow-500" },
                  { key: "ERROR", label: "Failed", color: "bg-red-500" },
                ].map(({ key, label, color }) => {
                  const count = data.postsByStatus[key] || 0;
                  const pct = totalAcrossAll > 0 ? Math.round((count / totalAcrossAll) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      <span className="text-sm font-medium text-gray-700 w-20">{label}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-gray-600 w-12 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-500 mb-4">Quick Stats</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total posts</span>
                  <span className="text-sm font-bold text-gray-900">
                    {data.totalPosts.toLocaleString()}
                    {data.postsGrowth !== 0 && (
                      <span className={`ml-2 text-xs font-semibold ${data.postsGrowth > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {data.postsGrowth > 0 ? "↑" : "↓"} {Math.abs(data.postsGrowth)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Reach</span>
                  <span className="text-sm font-bold text-gray-900">{data.totalEngagement.reach.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Link clicks</span>
                  <span className="text-sm font-bold text-gray-900 flex items-center gap-1">
                    <MousePointerClick className="w-3.5 h-3.5 text-gray-400" />
                    {data.totalEngagement.clicks.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Best platform</span>
                  {data.bestPlatform ? (
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={data.bestPlatform} size={14} />
                      <span className="text-sm font-bold text-gray-900">
                        {PLATFORM_LABELS[data.bestPlatform] || data.bestPlatform}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Per-post detail dialog */}
      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Post engagement</DialogTitle>
          </DialogHeader>
          {selectedPost && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 line-clamp-4">
                {selectedPost.content}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Eye, label: "Impressions", value: selectedPost.engagement?.impressions || 0 },
                  { icon: Eye, label: "Reach", value: selectedPost.engagement?.reach || 0 },
                  { icon: Heart, label: "Likes", value: selectedPost.engagement?.likes || 0 },
                  { icon: MessageCircle, label: "Comments", value: selectedPost.engagement?.comments || 0 },
                  { icon: Share2, label: "Shares", value: selectedPost.engagement?.shares || 0 },
                  { icon: MousePointerClick, label: "Clicks", value: selectedPost.engagement?.clicks || 0 },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                    <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-sm font-bold text-gray-900">{value.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
              {selectedPost.releaseURL && (
                <a
                  href={selectedPost.releaseURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  View on platform →
                </a>
              )}
              <p className="text-[11px] text-gray-400">
                Metrics are pulled from each platform when you hit "Refresh insights". Numbers update within 24h of publishing on the native platform.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
