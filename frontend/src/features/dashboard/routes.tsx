import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardOverview } from "./pages/DashboardOverview";
import { CreatePost } from "./pages/CreatePost";
import { ScheduledPostsPage } from "./pages/ScheduledPostsPage";
import { ManagePostsPage } from "./pages/ManagePostsPage";
import { MediaLibraryPage } from "./pages/MediaLibraryPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { BrandKitPage } from "./pages/BrandKitPage";
import { ConnectedAccountsPage } from "./pages/ConnectedAccountsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export default function DashboardRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardOverview />} />
        
        {/* Content workflow sub-routes */}
        <Route path="content/create" element={<CreatePost />} />
        <Route path="content/create/:id" element={<CreatePost />} />
        <Route path="content/manage" element={<ManagePostsPage />} />
        <Route path="content/schedule" element={<ScheduledPostsPage />} />

        {/* Legacy route compatibility aliases */}
        <Route path="create-post" element={<CreatePost />} />
        <Route path="create-post/:id" element={<CreatePost />} />
        <Route path="scheduled-posts" element={<ScheduledPostsPage />} />
        <Route path="calendar" element={<ScheduledPostsPage />} />
        <Route path="drafts" element={<ManagePostsPage initialTab="DRAFT" />} />

        <Route path="media-library" element={<MediaLibraryPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="brand-kit" element={<BrandKitPage />} />
        <Route path="connected-accounts" element={<ConnectedAccountsPage />} />
        <Route path="integrations/social/:provider" element={<OAuthCallbackPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
