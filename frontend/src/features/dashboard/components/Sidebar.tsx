import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  Layers,
  PlusSquare,
  FolderKanban,
  Calendar,
  Image,
  BarChart3,
  Palette,
  Share2,
  Settings,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { to: "/dashboard", icon: "home", label: "Dashboard" },
  { to: "/dashboard/brand-kit", icon: "brand-kit", label: "Brand Kit" },
  { to: "/dashboard/media-library", icon: "media", label: "Media Library" },
  { to: "/dashboard/analytics", icon: "analytics", label: "Analytics" },
  { to: "/dashboard/connected-accounts", icon: "accounts", label: "Connected Accounts" },
  { to: "/dashboard/settings", icon: "settings", label: "Settings" },
];

const CONTENT_SUBMENU = [
  {
    to: "/dashboard/content/create",
    icon: "create",
    label: "Create",
    matchPaths: ["/dashboard/content/create", "/dashboard/create-post"],
  },
  {
    to: "/dashboard/content/manage",
    icon: "manage",
    label: "Manage",
    matchPaths: ["/dashboard/content/manage", "/dashboard/drafts"],
  },
  {
    to: "/dashboard/content/schedule",
    icon: "schedule",
    label: "Schedule",
    matchPaths: ["/dashboard/content/schedule", "/dashboard/scheduled-posts", "/dashboard/calendar"],
  },
];

const ICONS: Record<string, React.ReactNode> = {
  home: <LayoutGrid className="w-5 h-5" />,
  content: <Layers className="w-5 h-5" />,
  create: <PlusSquare className="w-4 h-4" />,
  manage: <FolderKanban className="w-4 h-4" />,
  schedule: <Calendar className="w-4 h-4" />,
  "brand-kit": <Palette className="w-5 h-5" />,
  media: <Image className="w-5 h-5" />,
  analytics: <BarChart3 className="w-5 h-5" />,
  accounts: <Share2 className="w-5 h-5" />,
  settings: <Settings className="w-5 h-5" />,
};

const isContentChildRoute = (path: string) => {
  return (
    path.startsWith("/dashboard/content") ||
    path.startsWith("/dashboard/create-post") ||
    path.startsWith("/dashboard/scheduled-posts") ||
    path.startsWith("/dashboard/calendar") ||
    path.startsWith("/dashboard/drafts")
  );
};

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isContentActive = isContentChildRoute(location.pathname);
  const [isContentOpen, setIsContentOpen] = useState(() => isContentChildRoute(location.pathname));

  useEffect(() => {
    if (isContentChildRoute(location.pathname)) {
      setIsContentOpen(true);
    }
  }, [location.pathname]);

  const isSubItemActive = (matchPaths: string[]) => {
    return matchPaths.some((p) => location.pathname.startsWith(p));
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div
          className="flex items-center gap-3 px-3 py-2 cursor-pointer"
          onClick={() => navigate("/dashboard")}
        >
          <img src="/Icon.png" alt="AutoSocial Icon" className="w-14 h-14 object-contain rounded-lg" />
          <span className="font-bold text-[#1c2b36] text-[20px] tracking-tight">AutoSocial</span>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Dashboard - Item 1 */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<NavLink to="/dashboard" end />}
                  isActive={location.pathname === "/dashboard"}
                >
                  {ICONS.home}
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Content Menu Item with Accordion Submenu - Item 2 */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isContentActive}
                  onClick={() => setIsContentOpen(!isContentOpen)}
                >
                  {ICONS.content}
                  <span>Content</span>
                  <ChevronDown
                    className={`w-4 h-4 ml-auto transition-transform duration-200 ${
                      isContentOpen ? "rotate-180" : ""
                    }`}
                  />
                </SidebarMenuButton>

                {isContentOpen && (
                  <SidebarMenuSub>
                    {CONTENT_SUBMENU.map((item) => {
                      const active = isSubItemActive(item.matchPaths);
                      return (
                        <SidebarMenuSubItem key={item.to}>
                          <SidebarMenuSubButton
                            render={<NavLink to={item.to} />}
                            isActive={active}
                          >
                            {ICONS[item.icon]}
                            <span>{item.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              {/* Remaining Top-level Nav Items */}
              {NAV_ITEMS.filter((item) => item.to !== "/dashboard").map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    render={<NavLink to={item.to} end={item.to === "/"} />}
                    isActive={location.pathname === item.to}
                  >
                    {ICONS[item.icon]}
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<a href="/dashboard/settings" />}
              onClick={() => navigate("/dashboard/settings")}
            >
              <HelpCircle className="w-5 h-5" />
              <span>Help</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
