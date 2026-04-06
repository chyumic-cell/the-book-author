import { NextResponse } from "next/server";

import type { ApiResult } from "@/types/storyforge";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResult<T>>({ ok: true, data }, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json<ApiResult<never>>(
    { ok: false, error: message },
    { status },
  );
}
