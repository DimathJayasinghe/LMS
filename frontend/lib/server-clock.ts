import { api } from "@/lib/api";

/** How the device clock differs from the server's, measured from the public health endpoint. */
export async function measureServerOffset(
  getTimestamp: () => Promise<string> = async () =>
    (await api.get<{ data: { timestamp: string } }>("/health")).data.timestamp,
  now: () => number = Date.now,
): Promise<number | null> {
  try {
    const asked = now();
    const serverMs = Date.parse(await getTimestamp());
    const answered = now();
    if (Number.isNaN(serverMs)) return null;
    // The server stamped the reply somewhere in the round trip; take the middle of it.
    return serverMs - (asked + answered) / 2;
  } catch {
    return null;
  }
}
