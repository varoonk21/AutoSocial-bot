import { type Router, Router as createRouter } from "express";
import integrationsRoutes from "./routes/integrations.routes.js";
import postsRoutes from "./routes/posts.routes.js";
import mediaRoutes from "./modules/media/media.routes.js";
import brandKitRoutes from "./modules/brandkit/brandkit.routes.js";
import serverRoutes from "./modules/server/server.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import aiRoutes from "./modules/ai/ai.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import { requireAuth } from "./middleware/auth.middleware.js";

const router: Router = createRouter();

router.use("/", serverRoutes);

const protectedRouter = createRouter();

protectedRouter.use("/integrations", integrationsRoutes);
protectedRouter.use("/posts", postsRoutes);
protectedRouter.use("/media", mediaRoutes);
protectedRouter.use("/brand-kit", brandKitRoutes);
protectedRouter.use("/settings", settingsRoutes);
protectedRouter.use("/ai", aiRoutes);
protectedRouter.use("/notifications", notificationsRoutes);

router.use(requireAuth, protectedRouter);

export default router;
