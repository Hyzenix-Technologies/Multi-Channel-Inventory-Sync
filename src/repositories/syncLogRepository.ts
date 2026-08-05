import type { Pool } from "pg";
import type { Channel } from "../domain/types.js";

export class SyncLogRepository {
  constructor(private readonly pool: Pool) {}

  async startAttempt(input: {
    inventoryId: string;
    channel: Channel;
    jobId: string;
    attemptNumber: number;
  }): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO sync_logs
         (inventory_id, channel, job_id, status, attempt_number)
       VALUES ($1, $2, $3, 'in_progress', $4)
       ON CONFLICT (job_id, attempt_number) DO UPDATE
       SET status = 'in_progress', error_message = NULL, updated_at = NOW()
       RETURNING id`,
      [input.inventoryId, input.channel, input.jobId, input.attemptNumber],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Failed to create sync attempt log");
    return row.id;
  }

  async finishAttempt(
    id: string,
    status: "succeeded" | "failed",
    errorMessage?: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE sync_logs
       SET status = $2, error_message = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, status, errorMessage ?? null],
    );
  }
}
