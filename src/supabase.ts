import type { SupabaseClient } from '@supabase/supabase-js'
import type { Anchor, FeedbackComment, StorageAdapter } from './types'
import { hashToken } from './util'

export interface SupabaseAdapterOptions {
  /** Project URL, for example `import.meta.env.VITE_SUPABASE_URL`. */
  url: string
  /** Public anon key, for example `import.meta.env.VITE_SUPABASE_ANON_KEY`. */
  anonKey: string
  /** Table name, if you renamed it in schema.sql. Defaults to "comments". */
  table?: string
}

interface Row {
  id: string
  project: string
  parent_id: string | null
  route: string
  author: string
  body: string
  anchor: Anchor | null
  viewport_width: number | null
  created_at: string
}

/** Every column except delete_token_hash, which clients can't read. */
const COLUMNS = 'id, project, parent_id, route, author, body, anchor, viewport_width, created_at'

const fromRow = (row: Row): FeedbackComment => ({
  id: row.id,
  project: row.project,
  parentId: row.parent_id,
  route: row.route,
  author: row.author,
  body: row.body,
  anchor: row.anchor,
  viewportWidth: row.viewport_width,
  createdAt: row.created_at,
})

/**
 * Shared, live comments stored in Supabase. Set up the table with
 * supabase/schema.sql. The Supabase client is only downloaded the first time
 * the adapter is used, which only happens in feedback mode.
 */
export function supabaseAdapter({ url, anonKey, table = 'comments' }: SupabaseAdapterOptions): StorageAdapter {
  let client: Promise<SupabaseClient> | undefined
  const db = () =>
    (client ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url, anonKey, {
        // Reviewers never sign in, so skip the auth session entirely.
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    ))

  return {
    async list(project) {
      const { data, error } = await (await db())
        .from(table)
        .select(COLUMNS)
        .eq('project', project)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as Row[]).map(fromRow)
    },

    async create({ deleteToken, ...comment }) {
      const { data, error } = await (await db())
        .from(table)
        .insert({
          project: comment.project,
          parent_id: comment.parentId,
          route: comment.route,
          author: comment.author,
          body: comment.body,
          anchor: comment.anchor,
          viewport_width: comment.viewportWidth,
          delete_token_hash: await hashToken(deleteToken),
        })
        .select(COLUMNS)
        .single()
      if (error) throw error
      return fromRow(data as Row)
    },

    async remove(id, deleteToken) {
      const { data, error } = await (await db()).rpc('delete_comment', { comment_id: id, token: deleteToken })
      if (error) throw error
      if (!data) throw new Error('You can only delete your own comments.')
    },

    subscribe(project, onChange) {
      let closed = false
      let timer: ReturnType<typeof setTimeout> | undefined
      // One delete can remove a whole thread, so batch bursts of events into one reload.
      const changed = () => {
        clearTimeout(timer)
        timer = setTimeout(onChange, 100)
      }
      let unsubscribe = () => {}

      void db().then((supabase) => {
        if (closed) return
        const channel = supabase
          .channel(`corktack:${project}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `project=eq.${project}` }, changed)
          // Delete events can't be filtered by column, so any delete triggers a reload.
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, changed)
          .subscribe((status) => {
            // Catch up on anything missed while connecting or reconnecting.
            if (status === 'SUBSCRIBED') changed()
          })
        unsubscribe = () => void supabase.removeChannel(channel)
      })

      return () => {
        closed = true
        clearTimeout(timer)
        unsubscribe()
      }
    },
  }
}
