import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../config/auth.js";
import { User } from "../models/index.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const user = await User.findById(session.user.id);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    (req as any).user = user;
    (req as any).session = session.session;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
