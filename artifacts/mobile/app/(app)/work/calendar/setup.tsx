import { WorkPage, WorkText } from "../../../../lib/work/ui";
import { KairosCard } from "../../../../components/kairos/card";
export default function WorkCalendarSetup() {
  return (
    <WorkPage
      title="Google Calendar setup"
      subtitle="Not connected · live provider stage is gated."
    >
      <KairosCard>
        <WorkText title>Not connected</WorkText>
        <WorkText>
          Kairos Work events are independent private records. Signing into
          Kairos with Google does not authorize Calendar access. This SOURCE
          version neither reads nor writes Google Calendar, and it has no
          synchronization or OAuth flow.
        </WorkText>
      </KairosCard>
      <WorkText title>Separate user-approved live stage</WorkText>
      <WorkText>
        Before enabling Google Calendar, review the exact target backend and
        register a dedicated Google OAuth application, Calendar API, consent
        screen and allowlisted callbacks. Owner-bound single-use OAuth state,
        encrypted server-only refresh tokens, scope validation, writable
        calendar selection and authenticated read/create/edit/delete tests are
        required.
      </WorkText>
      <WorkText>
        Provider pagination, sync cursors, revocation/disconnect and
        permission/conflict handling must be verified. Only show Connected after
        actual authorization and a successful calendar fetch. No provider
        secrets or tokens belong in EXPO_PUBLIC variables or a source ZIP.
      </WorkText>
      <WorkText>
        Setup reviewer: see docs/work-module-setup.md and
        docs/setup-review/05-work-module.sql in the source package. SQL is
        review-only and does not install any Google integration.
      </WorkText>
    </WorkPage>
  );
}
