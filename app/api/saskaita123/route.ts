import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.SASKAITA123_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API key" },
        { status: 500 }
      );
    }

    const res = await fetch("https://app.invoice123.com/api/v1.0/invoices", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await res.json();

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}