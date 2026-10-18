import { GUARANTEED_ROUNDS } from "./game";

export type PlayTip = { icon: string; text: string; tone: "bless" | "calm" | "warn" | "bold" };

const generalTips = [
  "Only your coin balance counts on the leaderboard, so protect your coins to protect your rank.",
  "Never put everything on one turn. Spread small bets and let the odds work for you.",
  "Backing two paths covers more ground, but it splits your stake between them.",
  "A risky path pays 3× when you are right, but a trap can cost coins and Luck.",
  "Chests can hide coins or brand new explorers. Every turn is a chance to find one.",
];

export function getPlayTip({ run, luck, money }: { run: number; luck: number; money: number }): PlayTip {
  if (run < GUARANTEED_ROUNDS) {
    const left = GUARANTEED_ROUNDS - run;
    return {
      icon: "🍀",
      tone: "bless",
      text: `Beginner's blessing: your first ${GUARANTEED_ROUNDS} predictions always win. ${left} left, so experiment freely!`,
    };
  }
  if (run === GUARANTEED_ROUNDS) {
    return {
      icon: "🎲",
      tone: "warn",
      text: "The beginner's blessing is over. From now on the path is truly random, so start with small bets.",
    };
  }
  if (money > 0 && money < 30) {
    return { icon: "🪙", tone: "warn", text: "Your pouch is low. Tiny bets stretch your coins until the daily +100 arrives." };
  }
  if (run % 2 === 0) {
    if (luck < 25) return { icon: "💡", tone: "calm", text: "Luck is low. Place small bets to keep your losses small until it climbs back up." };
    if (luck < 60) return { icon: "💡", tone: "calm", text: "Luck is growing. Right predictions raise it, so steady, moderate bets are a solid plan." };
    return { icon: "✨", tone: "bold", text: "Luck is high. Chests are more likely and traps rarer, so this is a good time for a bolder bet." };
  }
  return { icon: "💡", tone: "calm", text: generalTips[Math.floor(run / 2) % generalTips.length] };
}
