export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "arven-beslenme-diyet",
      version: "0.1.0",
      now: new Date().toISOString(),
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}
