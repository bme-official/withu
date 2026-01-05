export const runtime = "nodejs";

import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const filePath = path.join(process.cwd(), "widget-dist", "widget.js");
  const js = await readFile(filePath, "utf8");

  return new Response(js, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // short caching to allow fast updates while still being cache-friendly
      "cache-control": "public, max-age=60",
    },
  });
}


