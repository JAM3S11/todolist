// Which version of the app is live right now. An open app compares this with the version it's
// running, and offers "A new version is ready — Update" when they differ.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ id: process.env.NEXT_PUBLIC_BUILD_ID || null }, { headers: { 'Cache-Control': 'no-store' } });
}
