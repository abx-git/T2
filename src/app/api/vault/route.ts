import { NextResponse } from "next/server";

import { requireVaultLoxId } from "@/lib/server/api-errors";
import { readVaultBlob, writeVaultBlob } from "@/lib/server/vault-storage";
import { vaultOptionsResponse, withVaultCors } from "@/lib/server/vault-cors";

function vaultHeaders(snap: { etag: string; lastModified: number }): HeadersInit {
  return {
    ETag: snap.etag,
    "Last-Modified": new Date(snap.lastModified).toUTCString(),
    "Cache-Control": "no-store",
  };
}

export async function OPTIONS(req: Request) {
  return vaultOptionsResponse(req);
}

export async function GET(req: Request) {
  const keyOrRes = requireVaultLoxId(req);
  if (keyOrRes instanceof NextResponse) return withVaultCors(req, keyOrRes);

  const snap = await readVaultBlob(keyOrRes);
  if (!snap) {
    return withVaultCors(req, NextResponse.json({ error: "not_found" }, { status: 404 }));
  }

  return withVaultCors(
    req,
    new NextResponse(new Uint8Array(snap.data), {
      status: 200,
      headers: {
        ...vaultHeaders(snap),
        "Content-Type": "application/octet-stream",
      },
    }),
  );
}

export async function PUT(req: Request) {
  const keyOrRes = requireVaultLoxId(req);
  if (keyOrRes instanceof NextResponse) return withVaultCors(req, keyOrRes);

  const body = Buffer.from(await req.arrayBuffer());
  const ifMatch = req.headers.get("if-match");

  try {
    const snap = await writeVaultBlob(keyOrRes, body, ifMatch);
    return withVaultCors(
      req,
      new NextResponse(new Uint8Array(snap.data), {
        status: 200,
        headers: {
          ...vaultHeaders(snap),
          "Content-Type": "application/octet-stream",
        },
      }),
    );
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 412) {
      return withVaultCors(req, NextResponse.json({ error: "precondition_failed" }, { status: 412 }));
    }
    if (err.status === 413) {
      return withVaultCors(req, NextResponse.json({ error: "payload_too_large" }, { status: 413 }));
    }
    throw e;
  }
}

export async function HEAD(req: Request) {
  const keyOrRes = requireVaultLoxId(req);
  if (keyOrRes instanceof NextResponse) return withVaultCors(req, keyOrRes);

  const snap = await readVaultBlob(keyOrRes);
  if (!snap) return withVaultCors(req, new NextResponse(null, { status: 404 }));

  return withVaultCors(
    req,
    new NextResponse(null, {
      status: 200,
      headers: vaultHeaders(snap),
    }),
  );
}
