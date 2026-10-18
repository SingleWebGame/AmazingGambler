import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COUNTRY_PATTERN = /^[A-Z]{2}$/;

// Vercel (and Cloudflare) add the visitor's country from their IP address, which is more
// reliable than guessing from browser settings. Returns { country: null } when unavailable (e.g. localhost).
export function GET(request: Request) {
  const raw = request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? "";
  const country = raw.trim().toUpperCase();
  return NextResponse.json(
    { country: COUNTRY_PATTERN.test(country) && country !== "XX" && country !== "T1" ? country : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
