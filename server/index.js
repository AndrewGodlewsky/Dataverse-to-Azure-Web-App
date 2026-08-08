import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provider } from "./provider.js";

const app = express();
const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "dist");

const api = express.Router();
api.get("/meta", (req, res) => res.json({ mode: provider.mode }));
api.get("/categories", wrap(() => provider.categories()));
api.get("/summary", wrap((req) => provider.summary(req.query.category || null)));
api.get("/revenue-by-month", wrap((req) => provider.revenue(req.query.category || null)));
api.get("/category-totals", wrap(() => provider.categoryTotals()));
api.get("/org-tree", wrap(() => provider.orgTree()));

function wrap(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      console.error(err);
      res.status(502).json({ error: "upstream query failed" });
    }
  };
}

app.use("/api", api);
app.use(express.static(clientDist));
// SPA fallback: any non-API GET serves the app shell.
app.get("*path", (req, res) => res.sendFile(path.join(clientDist, "index.html")));

const port = Number(process.env.PORT) || 8080; // App Service sets WEBSITES_PORT→PORT for containers
app.listen(port, () => console.log(`dashboard up on :${port} (${provider.mode} mode)`));
