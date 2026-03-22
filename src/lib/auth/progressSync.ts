import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgressState } from '../../types/progress';

interface UserProgressRow {
  user_id: string;
  progress_json: ProgressState;
  updated_at?: string;
}

export async function loadRemoteProgress(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProgressState | null> {
  const { data, error } = await supabase
    .from('user_progress')
    .select('progress_json')
    .eq('user_id', userId)
    .maybeSingle<UserProgressRow>();

  if (error) {
    throw error;
  }

  return data?.progress_json ?? null;
}

export async function saveRemoteProgress(
  supabase: SupabaseClient,
  userId: string,
  progress: ProgressState,
): Promise<void> {
  const { error } = await supabase
    .from('user_progress')
    .upsert({
      user_id: userId,
      progress_json: progress,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (error) {
    throw error;
  }
}
