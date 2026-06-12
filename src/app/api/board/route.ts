import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/server/api-errors";
import { readBoardFile, writeBoardFile } from "@/lib/server/board-storage";

export async function GET(req: Request) {
  const userOrRes = requireSessionUser(req);
  if (userOrRes instanceof NextResponse) return userOrRes;

  const snap = await readBoardFile();
  return new NextResponse(snap.text, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ETag: snap.etag,
      "Last-Modified": new Date(snap.lastModified).toUTCString(),
      "Cache-Control": "no-store",
    },
  });
}

export async function PUT(req: Request) {
  const userOrRes = requireSessionUser(req);
  if (userOrRes instanceof NextResponse) return userOrRes;
  void userOrRes;

  const text = await req.text();
  const ifMatch = req.headers.get("if-match");

  try {
    const snap = await writeBoardFile(text, ifMatch);
    return new NextResponse(snap.text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ETag: snap.etag,
        "Last-Modified": new Date(snap.lastModified).toUTCString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 412) {
      return NextResponse.json({ error: "precondition_failed" }, { status: 412 });
    }
    throw e;
  }
}

export async function HEAD(req: Request) {
  const userOrRes = requireSessionUser(req);
  if (userOrRes instanceof NextResponse) return userOrRes;

  const snap = await readBoardFile();
  return new NextResponse(null, {
    status: 200,
    headers: {
      ETag: snap.etag,
      "Last-Modified": new Date(snap.lastModified).toUTCString(),
      "Cache-Control": "no-store",
    },
  });
}
