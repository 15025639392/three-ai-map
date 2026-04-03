import { describe, expect, it, vi } from "vitest";
import { RequestScheduler } from "../../../src/core/RequestScheduler";

describe("RequestScheduler", () => {
  it("should deduplicate identical tile requests", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Blob()));
    const scheduler = new RequestScheduler({ concurrency: 2, fetcher });

    await Promise.all([
      scheduler.schedule({ id: "0/0/0", url: "/0/0/0.png" }),
      scheduler.schedule({ id: "0/0/0", url: "/0/0/0.png" })
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
