# Looking after your server: update, back up, restore

Plain steps for the owner of a Linux server that runs Conker. Commands are for the source-built
Ubuntu layout (`conker`, deployment folder `~/conker-deploy`); in a repository checkout type
`./conker` from the checkout instead. The details behind each step are in
[recovery](recovery.md) and [the Ubuntu layout](../../deploy/ubuntu/README.md).

## Every week: is it healthy?

```sh
conker status                   # every service and what is wrong, if anything
conker backup schedule status   # both backup timers and how their last runs went
conker backup drill --last      # did the last restore drill pass
```

## Set up backups once

1. Mount a disk that is not the server's own (a USB disk or a network share).
2. Tell Conker where it is and how many backups to keep (7 if you leave it out):

   ```sh
   conker setup configure protection --destination /mnt/backup-disk/conker --retention 7
   ```

3. Make the first backup now. It stops Conker's writers for a moment, captures everything,
   checks every file and keeps the newest 7:

   ```sh
   conker setup run protection
   ```

4. Turn on the nightly backup (about 03:30) and a restore drill every Sunday:

   ```sh
   conker backup schedule on --drill weekly
   ```

A backup holds your password data, keys and credentials. Keep the disk private, and keep a second
copy somewhere encrypted. The agents' workspaces folder is not part of a backup.

## Update to a new release

**From the Inbox** (once the server runs a release that has self-update). The server looks for a
new release once a day. When there is one, the Inbox shows **Update available** with what changed.
Tap **Update** and give your password. The update runs on the server and its result arrives in the
Inbox. **Skip** hides that release.

**From a shell:**

```sh
conker update --check          # is there a newer release
conker update --to 1.2.3       # update to that release
```

Either way, an update first takes a verified snapshot of everything (in `~/conker-snapshots`),
then swaps in the new code, starts it and checks that every service answers. Older snapshots that
earlier updates made are then removed down to the newest 3 (`CONKER_UPDATE_SNAPSHOTS_KEEP`); the
newest one that verifies always stays, and snapshots you or the nightly timer made are never
touched. One update at a time, never to an older release.

## What the result means, and what to do

| Result | What happened | What you do |
|---|---|---|
| Applied | The new release runs and answered its check. | Nothing. |
| Rolled back | The new release failed its check, so the old code was put back and proven healthy. | Read the reason. Data is as the new release left it, except Pi's database, which goes back to the snapshot when the new release had changed its layout. |
| Held | The old code was put back but could not be proven healthy. | See "When an update is held". |
| Cut off | The server restarted during an update. | Nothing: the host helper rolls it back when it starts again. From a shell: `conker update --recover`. |

## When an update is held

No other update or rollback runs while it is held.

1. `conker status`: which services answer.
2. Read why: `cat ~/conker-deploy/state/update/HOLD.json`. The update's receipt in
   `~/conker-deploy/state/update/receipts/` names its snapshot (`protection.snapshot`).
3. That snapshot is the way back: restore it (below). The hold stays until you remove
   `HOLD.json` yourself, once you have decided the server is as you want it.

## Restore a backup

Conker never restores over the running server. A restore makes a separate, isolated copy and
holds it:

```sh
ls /mnt/backup-disk/conker ~/conker-snapshots                # your backups; names sort by time
conker restore /mnt/backup-disk/conker/snapshot-... --into /srv/conker-recovery-DATE
conker recovery-status /srv/conker-recovery-DATE             # what it restored, what is held
```

Nothing in the copy runs, ToolGate's agent keys in it are revoked and paid actions are off. Before
restored data goes back into use you confirm four things it cannot know by itself: what was
deleted since the backup, which actions happened since, which credentials to replace, and that the
copy works. That review and `--prove-ready` are in [recovery](recovery.md#operator-review-receipt).
Known limit: no command yet puts a proven restore in place of the running server; that last step
is done by hand. To throw a restore away:

```sh
conker recovery-status /srv/conker-recovery-DATE --abort "why"
```

## Try a restore without risk

```sh
conker backup drill            # restores the newest backup into a throwaway copy, checks, removes it
```

A passing drill is the best sign that a backup can bring Conker back.
