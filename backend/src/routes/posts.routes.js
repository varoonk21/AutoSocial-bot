import express from "express";
import { listPosts, getPost, createPost, updatePost, deletePost, getStats, getAnalytics, refreshPostInsights } from "../controllers/posts.controller.js";
import { validateBody, validateParams } from "../middleware/validate.middleware.js";
import { createPostSchema, updatePostSchema, postIdParamSchema } from "./posts.validation.js";

const router = express.Router();

router.get("/stats", getStats);
router.get("/analytics", getAnalytics);
router.post("/refresh-insights", refreshPostInsights);
router.get("/", listPosts);
router.get("/:id", validateParams(postIdParamSchema), getPost);
router.post("/", validateBody(createPostSchema), createPost);
router.put("/:id", validateParams(postIdParamSchema), validateBody(updatePostSchema), updatePost);
router.delete("/:id", validateParams(postIdParamSchema), deletePost);

export default router;
