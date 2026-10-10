import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { errorMessage } from '@/api/errors';
import { playlistsApi } from '@/api/playlists';
import { queryKeys, usePlaylistInvites } from '@/api/queries';
import type { UserRef } from '@/api/users';
import { InviteSheet } from '@/ui/InviteSheet';
import { useSnackbar } from '@/ui/Snackbar';

/** Invite people to a playlist (FR-18): invitees can open a private playlist and edit an "invited only" one. Owner only. */
export default function InviteToPlaylist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useSnackbar();
  const queryClient = useQueryClient();
  const invites = usePlaylistInvites(id, true);

  const toggle = useMutation({
    mutationFn: ({ user, invite }: { user: UserRef; invite: boolean }) =>
      invite ? playlistsApi.invite(id, user.id) : playlistsApi.uninvite(id, user.id),
    onSuccess: (data, { user, invite }) => {
      queryClient.setQueryData(queryKeys.playlistInvites(id), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.playlist(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.allPlaylists });
      show(invite ? `${user.displayName} invited.` : `${user.displayName} removed.`);
    },
    onError: (error) => show(errorMessage(error)),
  });

  return (
    <InviteSheet
      invites={invites.data?.items}
      loading={invites.isLoading}
      pendingUserId={toggle.isPending ? (toggle.variables?.user.id ?? null) : null}
      onToggle={(user, invite) => toggle.mutate({ user, invite })}
    />
  );
}
