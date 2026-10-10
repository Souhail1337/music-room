import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { errorMessage } from '@/api/errors';
import { eventsApi } from '@/api/events';
import { queryKeys, useInvites } from '@/api/queries';
import type { UserRef } from '@/api/users';
import { InviteSheet } from '@/ui/InviteSheet';
import { useSnackbar } from '@/ui/Snackbar';

/** Invite people (FR-11): search users by name or exact email and toggle their invite. Host only. */
export default function InvitePeople() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useSnackbar();
  const queryClient = useQueryClient();
  const invites = useInvites(id, true);

  const toggle = useMutation({
    mutationFn: ({ user, invite }: { user: UserRef; invite: boolean }) =>
      invite ? eventsApi.invite(id, user.id) : eventsApi.uninvite(id, user.id),
    onSuccess: (data, { user, invite }) => {
      queryClient.setQueryData(queryKeys.invites(id), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.event(id) });
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
