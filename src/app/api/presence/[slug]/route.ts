import { loadPublicPresence } from "@/lib/public-presence";

export async function GET(_req: Request, ctx: RouteContext<"/api/presence/[slug]">) {
  const { slug } = await ctx.params;
  const p = await loadPublicPresence(slug);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(p, { headers: { "Cache-Control": "no-store" } });
}
