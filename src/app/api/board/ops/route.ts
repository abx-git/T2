import { NextResponse } from "next/server";

import type { ClientBoardOp } from "@/lib/board-ops/types";
import { requireSessionUser } from "@/lib/server/api-errors";
import { appendBoardOps, listOpsAfter, readBoardOpsFile } from "@/lib/server/board-ops-storage";

export async function GET(req: Request) {
  const userOrRes = requireSessionUser(req);
  if (userOrRes instanceof NextResponse) return userOrRes;

  const url = new URL(req.url);
  const after = Number(url.searchParams.get("after") ?? "0");
  const afterSeq = Number.isFinite(after) && after >= 0 ? after : 0;

  const file = await readBoardOpsFile();
  const ops = listOpsAfter(file, afterSeq);

  return NextResponse.json(
    { headSeq: file.headSeq, ops },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const userOrRes = requireSessionUser(req);
  if (userOrRes instanceof NextResponse) return userOrRes;
  void userOrRes;

  let body: { ops?: ClientBoardOp[] };
  try {
    body = (await req.json()) as { ops?: ClientBoardOp[] };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const ops = Array.isArray(body.ops) ? body.ops : [];
  for (const op of ops) {
    if (
      !op?.opId ||
      !op?.clientId ||
      !op?.at ||
      !op?.payload ||
      typeof op.payload.type !== "string"
    ) {
      return NextResponse.json({ error: "invalid_op" }, { status: 400 });
    }
  }

  const result = await appendBoardOps(ops);
  return NextResponse.json(
    { headSeq: result.headSeq, stored: result.stored },
    { headers: { "Cache-Control": "no-store" } },
  );
}
