import { useEffect, useState } from "react";
import { Sparkles, AlertTriangle, History, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost } from "@/lib/fetcher";
import { PLATFORM_LABELS } from "@/constants/platforms";

interface Variation {
  text: string;
  toneCheck: { tones: string[]; score: number; drift: boolean; warning?: string };
}

interface VariationsResult {
  variations: Variation[];
  aiGenerated: boolean;
  brandContext: string;
  platform?: string;
}

interface HistoryItem {
  _id: string;
  prompt: string;
  platform?: string;
  createdAt: string;
}

const PLATFORMS = ["x", "instagram", "facebook", "linkedin"];

export function AiComposer({ onUseVariation }: { onUseVariation: (text: string) => void }) {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("x");
  const [result, setResult] = useState<VariationsResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<{ aiEnabled: boolean } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [usedIndex, setUsedIndex] = useState<number | null>(null);

  useEffect(() => {
    apiGet("/ai/status").then(setAiStatus).catch(() => {});
    apiGet("/ai/history?limit=8")
      .then((r) => setHistory(r.prompts || []))
      .catch(() => {});
  }, []);

  const generate = async (promptText?: string) => {
    const prompt = (promptText ?? topic).trim();
    if (!prompt || generating) return;
    setGenerating(true);
    setError(null);
    setUsedIndex(null);
    try {
      const res: VariationsResult = await apiPost("/ai/variations", {
        topic: prompt,
        platform,
        count: 3,
      });
      setResult(res);
      if (!promptText) {
        // refresh history after a new generation
        apiGet("/ai/history?limit=8")
          .then((r) => setHistory(r.prompts || []))
          .catch(() => {});
      }
    } catch {
      setError("Couldn't generate variations. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const useVariation = (text: string, index: number) => {
    onUseVariation(text);
    setUsedIndex(index);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-purple-600" />
            AI Composer
          </CardTitle>
          {aiStatus && (
            <span
              className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                aiStatus.aiEnabled
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
              title={
                aiStatus.aiEnabled
                  ? "Real AI generation with your configured provider"
                  : "No AI key configured — using built-in templates"
              }
            >
              {aiStatus.aiEnabled ? "AI" : "Template mode"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What should the post be about? e.g. Our new media library feature is live"
            className="min-h-[80px] resize-none"
            aria-label="Post topic for AI generation"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="w-40" aria-label="Target platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORMS.map((p) => (
                <SelectItem key={p} value={p}>
                  {PLATFORM_LABELS[p] || p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => generate()}
            disabled={!topic.trim() || generating}
            className="bg-[#243746] hover:bg-[#1c2b36] text-white gap-2 flex-1"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate 3 variations
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowHistory((s) => !s)}
            aria-label="Prompt history"
            aria-expanded={showHistory}
            title="Recent prompts"
          >
            <History className="w-4 h-4 text-gray-500" />
          </Button>
        </div>

        {showHistory && (
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-40 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-xs text-gray-400 p-3">No prompts yet. Your recent topics will appear here.</p>
            ) : (
              history.map((h) => (
                <button
                  key={h._id}
                  onClick={() => {
                    setTopic(h.prompt);
                    if (h.platform) setPlatform(h.platform);
                    setShowHistory(false);
                  }}
                  className="w-full text-left p-3 hover:bg-gray-50 text-xs"
                >
                  <p className="font-medium text-gray-800 truncate">{h.prompt}</p>
                  <p className="text-gray-400 mt-0.5">
                    {h.platform ? `${PLATFORM_LABELS[h.platform] || h.platform} · ` : ""}
                    {new Date(h.createdAt).toLocaleDateString()}
                  </p>
                </button>
              ))
            )}
          </div>
        )}

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
              <p className="text-[11px] font-semibold text-purple-700 mb-1">Brand context used</p>
              <p className="text-xs text-purple-900/80 line-clamp-2">{result.brandContext}</p>
            </div>

            {result.variations.map((v, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{v.text}</p>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    {v.toneCheck.drift && v.toneCheck.warning && (
                      <p role="alert" className="text-[11px] text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {v.toneCheck.warning}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={usedIndex === i ? "default" : "outline"}
                    onClick={() => useVariation(v.text, i)}
                    className="gap-1 shrink-0"
                  >
                    {usedIndex === i ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Used
                      </>
                    ) : (
                      "Use this"
                    )}
                  </Button>
                </div>
              </div>
            ))}

            {!result.aiGenerated && (
              <p className="text-[11px] text-gray-400">
                Generated from built-in templates. Add an OpenAI API key to enable full AI generation.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
