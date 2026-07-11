import { supabase } from "./supabaseClient";

function mapDiceStatus(row) {
  return {
    canPlay: !!row?.can_play,
    alreadyPlayed: !!row?.already_played,
    canPlayAgain: !!row?.can_play_again,
    playDate: row?.play_date || null,
    diceValues: Array.isArray(row?.dice_values) ? row.dice_values.map(Number) : [],
    sixCount: Number(row?.six_count || 0),
    rewardType: row?.reward_type || "",
    rewardAmount: Number(row?.reward_amount || 0),
    rewardLabel: row?.reward_label || "",
    freeSearchesRemaining: Number(row?.free_searches_remaining || 0),
    diceProExpiresAt: row?.dice_pro_expires_at || null,
    hasCrunchyrollLifetime: !!row?.has_crunchyroll_lifetime,
  };
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function getMyDiceGameStatus() {
  const { data, error } = await supabase.rpc("get_my_dice_game_status");
  if (error) throw new Error(error.message);
  return mapDiceStatus(firstRow(data));
}

export async function playDailyDiceGame() {
  const { data, error } = await supabase.rpc("play_daily_dice_game");
  if (error) throw new Error(error.message);
  return mapDiceStatus(firstRow(data));
}
