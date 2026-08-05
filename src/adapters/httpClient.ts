export class ChannelApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChannelApiError";
  }
}

export async function sendJson(
  url: string,
  init: Omit<RequestInit, "body"> & { body: unknown },
): Promise<void> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
    body: JSON.stringify(init.body),
    signal: AbortSignal.timeout(2_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ChannelApiError(
      response.status,
      `Channel API returned ${response.status}: ${body.slice(0, 500)}`,
    );
  }
}
