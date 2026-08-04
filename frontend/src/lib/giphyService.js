import { supabase } from "./supabaseClient";

async function getFunctionErrorMessage(error, fallback) {
  try {
    if (error?.context?.headers?.get("content-type")?.includes("application/json")) {
      const body = await error.context.json();
      if (body?.error) return body.error;
    }
  } catch {
    // Fall through to the generic error message.
  }

  return error?.message || fallback;
}

export async function fetchGiphyGifs(query = "") {
  const { data, error } = await supabase.functions.invoke("giphy-search", {
    body: {
      query: String(query || "").trim().slice(0, 50),
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, "Failed to load GIFs."));
  }
  if (data?.error) {
    throw new Error(data.error);
  }

  return Array.isArray(data?.gifs) ? data.gifs : [];
}
