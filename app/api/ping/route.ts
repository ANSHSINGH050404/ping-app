import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const startTime = Date.now();
  let status: "ok" | "error" = "ok";
  let statusCode: number | null = null;
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "PingKeepAlive/1.0",
      },
    });

    clearTimeout(timeout);
    statusCode = response.status;

    if (!response.ok) {
      status = "error";
      errorMessage = `HTTP ${response.status}`;
    }
  } catch (err: unknown) {
    status = "error";
    errorMessage =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Request timed out (10s)"
          : err.message
        : "Unknown error";
  }

  const responseTime = Date.now() - startTime;

  return NextResponse.json({
    url,
    status,
    statusCode,
    responseTime,
    errorMessage,
    timestamp: new Date().toISOString(),
  });
}
