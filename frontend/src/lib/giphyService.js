const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || "";
const GIPHY_API_BASE_URL = "https://api.giphy.com/v1/gifs";
const GIPHY_RESULT_LIMIT = 12;
const GIPHY_RATING = "pg-13";

export function hasGiphyApiKey() {
  return Boolean(GIPHY_API_KEY);
}

function pickGiphyImage(gif) {
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

export async function fetchGiphyGifs(query = "") {
  if (!GIPHY_API_KEY) {
    throw new Error("Add VITE_GIPHY_API_KEY to enable GIF search.");
  }

  const trimmedQuery = String(query || "").trim().slice(0, 50);
  const endpoint = trimmedQuery ? "search" : "trending";
  const params = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    limit: String(GIPHY_RESULT_LIMIT),
    rating: GIPHY_RATING,
    bundle: "messaging_non_clips",
  });

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
    params.set("lang", "en");
  }

  const response = await fetch(`${GIPHY_API_BASE_URL}/${endpoint}?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to load GIFs.");
  }

  const payload = await response.json();
  return (payload.data || [])
    .map(pickGiphyImage)
    .filter(Boolean);
}
