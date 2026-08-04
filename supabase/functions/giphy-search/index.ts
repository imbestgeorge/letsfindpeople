// supabase/functions/giphy-search/index.ts
// @ts-nocheck

import { corsHeaders, json } from "../_shared/cors.ts";

const GIPHY_API_BASE_URL = "https://api.giphy.com/v1/gifs";
const GIPHY_RESULT_LIMIT = 12;
const GIPHY_RATING = "pg-13";

function cleanSearchTerm(value: unknown) {
  return String(value || "").trim().slice(0, 50);
}

function pickGiphyImage(gif: unknown) {
  const images = gif?.images || {};
  const sendImage =
    images.fixed_width?.webp ||
    images.fixed_width?.url ||
    images.downsized?.url ||
    images.original?.webp ||
    images.original?.url;
  const previewImage =
    images.fixed_width_small?.webp ||
    images.fixed_width_small?.url ||
    images.fixed_width_downsampled?.webp ||
    sendImage;

  if (!sendImage || !previewImage) return null;

  return {
    id: gif.id,
    title: gif.title || "GIPHY GIF",
    url: sendImage,
    previewUrl: previewImage,
    width: Number(images.fixed_width?.width || images.downsized?.width || images.original?.width) || null,
    height: Number(images.fixed_width?.height || images.downsized?.height || images.original?.height) || null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("GIPHY_API_KEY") || Deno.env.get("VITE_GIPHY_API_KEY");
  if (!apiKey) return json(req, { error: "GIPHY API key is not configured." }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const query = cleanSearchTerm(body.query);
  const endpoint = query ? "search" : "trending";
  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(GIPHY_RESULT_LIMIT),
    rating: GIPHY_RATING,
    bundle: "messaging_non_clips",
  });

  if (query) {
    params.set("q", query);
    params.set("lang", "en");
  }

  try {
    const response = await fetch(`${GIPHY_API_BASE_URL}/${endpoint}?${params.toString()}`);
    if (!response.ok) {
      return json(req, { error: "Failed to load GIFs." }, response.status);
    }

    const payload = await response.json();
    const gifs = (payload.data || [])
      .map(pickGiphyImage)
      .filter(Boolean);

    return json(req, { gifs });
  } catch (err) {
    return json(req, { error: (err as Error).message || "Failed to load GIFs." }, 500);
  }
});
