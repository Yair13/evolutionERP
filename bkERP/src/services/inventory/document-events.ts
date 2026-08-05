import type pg from "pg";

export type DocumentStatusEventView = {
  id: string;
  status: string;
  comment: string | null;
  createdAt: string;
  actorName: string | null;
};

export async function listDocumentEvents(
  pool: pg.Pool,
  documentId: string
): Promise<DocumentStatusEventView[]> {
  const { rows } = await pool.query<{
    id: string;
    status: string;
    comment: string | null;
    created_at: string;
    actor_name: string | null;
  }>(
    `
    SELECT
      e.id::text,
      e.status,
      e.comment,
      e.created_at::text,
      u.full_name AS actor_name
    FROM document_status_events e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.document_id = $1::uuid
    ORDER BY e.created_at ASC
    `,
    [documentId]
  );
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    comment: r.comment,
    createdAt: r.created_at,
    actorName: r.actor_name,
  }));
}
