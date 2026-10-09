import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut, useSession } from "@/lib/auth-client";
import { LogOut, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useImageStore } from "@/store/imageStore";
import { NotificationBell } from "./NotificationBell";
import { Avatar, AvatarImage, AvatarFallback, AvatarBadge } from "@/components/ui/avatar";

export function Header() {
  const getImageUrl = useImageStore((state) => state.getImageUrl);
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const { data: session } = useSession();

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200/80 flex items-center justify-between px-4 sm:px-8 shrink-0 sticky top-0 z-30 select-none">
      {/* Left: Mobile sidebar trigger */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden -ml-2" />
      </div>

      {/* Far Right: Notifications, Profile Icon */}
      <div className="flex items-center gap-3">
        <NotificationBell />
        {/* Profile Avatar Icon */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-1.5 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring group"
            title="User Account"
          >
            <Avatar className="size-9 ring-2 ring-gray-200 group-hover:ring-[#243746] transition-all">
              <AvatarImage
                src={session?.user?.image ? getImageUrl(session.user.image) : undefined}
                alt={session?.user?.name || "User profile"}
              />
              <AvatarFallback className="text-xs font-semibold">
                {session?.user?.name ? session.user.name.slice(0, 2).toUpperCase() : "US"}
              </AvatarFallback>
              <AvatarBadge className="bg-emerald-500 ring-2 ring-white" />
            </Avatar>
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1.5 animate-in fade-in">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate("/dashboard/settings");
                  }}
                >
                  <User className="w-4 h-4" />
                  <span>Profile Settings</span>
                </Button>
                <div className="my-1.5 border-t border-gray-100" />
                <Button
                  variant="ghost"
                  className="w-full justify-start text-red-600 hover:text-red-600 hover:bg-red-50"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
