import { NextResponse } from "next/server";
import { getRuntimeBuildInfo } from "@/app/runtime/env";

export const dynamic = "force-dynamic";

export function GET() {
  const build = getRuntimeBuildInfo();

  return NextResponse.json(
    {
      appVersion: build.appVersion,
      buildDateIso: build.buildDateIso,
      deploymentCreatedAt: build.deploymentCreatedAt,
    },
    {
      headers: {
        // This is safe to be public, but we still don't want stale values.
        "Cache-Control": "no-store",
      },
    }
  );
}

