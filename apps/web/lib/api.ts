import { NextResponse } from "next/server";
import { toPublicError } from "@pr-guard/shared";

function serializeForResponse<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value))
  ) as T;
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return NextResponse.json({ data: serializeForResponse(data) }, init);
}

export function fail(error: unknown): Response {
  const publicError = toPublicError(error);
  return NextResponse.json(publicError.body, { status: publicError.statusCode });
}
