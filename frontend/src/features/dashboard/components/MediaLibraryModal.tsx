import { useState, useEffect, useRef } from "react";
import { Upload, Search, Image as ImageIcon, X, Check } from "lucide-react";
import { apiGetPaginated } from "../../../lib/fetcher";
import { useFileUpload } from "../hooks/useFileUpload";
import { useImageStore } from "../../../store/imageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface MediaItem {
  _id: string;
  name: string;
  type: string;
  path: string;
}

interface MediaLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (image: { path: string; type: string }) => void;
}

export function MediaLibraryModal({ open, onOpenChange, onSelect }: MediaLibraryModalProps) {
  const fileInputRef = useRef(null);
  const { upload, uploading } = useFileUpload();
  const getImageUrl = useImageStore((s) => s.getImageUrl);

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (open) {
      fetchMedia(searchQuery);
      setSelectedId(null);
      setUploadError(null);
    }
  }, [open]);

  const fetchMedia = async (search?: string) => {
    setLoadingMedia(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      params.append("page", "1");
      params.append("pageSize", "50");
      const { items } = await apiGetPaginated(`/media?${params.toString()}`);
      if (items) {
        setMediaList(
          items.map((item: any) => ({
            _id: item._id,
            name: item.originalName || item.name || "image",
            type: item.type || "image",
            path: item.path,
          }))
        );
      }
    } catch {
      setLoadError(true);
    }
    setLoadingMedia(false);
  };

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      fetchMedia();
      setSelectedId(null);
    }
    onOpenChange(isOpen);
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    fetchMedia(value);
  };

  const handleUploadNew = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploadError(null);
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const media = await upload(file);
        if (media?.path) {
          setMediaList((prev) => [
            {
              _id: media.key || String(Date.now()),
              name: file.name,
              type: file.type.startsWith("video/") ? "video" : "image",
              path: media.path,
            },
            ...prev,
          ]);
        } else {
          failed.push(file.name);
        }
      } catch (err) {
        failed.push(file.name);
      }
    }
    if (failed.length > 0) {
      setUploadError(
        `Upload failed for: ${failed.join(", ")}. Check the file type and size, then try again.`
      );
    }
  };

  const handleSelect = (item: MediaItem) => {
    setSelectedId(item._id);
    onSelect({ path: item.path, type: item.type });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gray-100 text-gray-700">
              <ImageIcon className="w-5 h-5" />
            </div>
            Media Library
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search images..."
              className="pl-9"
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm"
            multiple
            className="hidden"
            onChange={(e) => handleUploadNew(e.target.files)}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="w-4 h-4" />
            <span>{uploading ? "Uploading..." : "Upload New Media"}</span>
          </Button>
        </div>

        {uploadError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {uploadError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          {loadingMedia ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div role="alert" className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-gray-700">Couldn't load your media</p>
              <p className="text-xs text-gray-400 mt-1">Check your connection and try again.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchMedia(searchQuery)}>
                Retry
              </Button>
            </div>
          ) : mediaList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ImageIcon className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">No media found</p>
              <p className="text-xs mt-1">Upload an image or video, or try a different search</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 py-2">
              {mediaList.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={`relative group aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                    selectedId === item._id
                      ? "border-[#243746] ring-2 ring-gray-200"
                      : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                  }`}
                >
                  {item.type === "video" ? (
                    <video
                      src={item.path}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={item.path}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {item.type === "video" && (
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                      VIDEO
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  {selectedId === item._id && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <div className="w-7 h-7 rounded-full bg-[#243746] text-white flex items-center justify-center shadow-lg">
                        <Check className="w-4 h-4" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
