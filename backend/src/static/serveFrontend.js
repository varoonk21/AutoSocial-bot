import express from "express";
import path from "path";

export function serveFrontend(app, clientDistPath) {
  app.use(
    express.static(clientDistPath, {
      etag: false,

      setHeaders(res, filePath) {
        const name = path.basename(filePath);

        if (name === "index.html") {
          res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
          return;
        }
        if (name === "sw.js" || name === "registerSW.js" || name === "manifest.webmanifest") {
          res.setHeader("Cache-Control", "no-cache");
          return;
        }

        const isHashed = /[-.][a-zA-Z0-9]{8,}(?=\.)/.test(name);

        if (isHashed) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "public, max-age=86400");
        }
      },
    }),
  );

  app.get("/*splat", (_req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");

    res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
      if (err) {
        next(err);
      }
    });
  });
}
