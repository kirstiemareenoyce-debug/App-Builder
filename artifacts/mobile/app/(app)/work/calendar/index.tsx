import { useState } from "react";
import { useRouter, type Href } from "expo-router";
import { Pressable, Switch, View, Text } from "react-native";
import { KairosButton } from "../../../../components/kairos/button";
import { KairosCard } from "../../../../components/kairos/card";
import { useColors } from "../../../../hooks/use-colors";
import { useKairosAuth } from "../../../../providers/supabase-auth-provider";
import {
  useWorkCalendar,
  useSaveWorkEvent,
  useDeleteWorkEvent,
  workEventForEditor,
} from "../../../../hooks/use-work-calendar";
import { useWorkSession } from "../../../../lib/work/session";
import {
  dateAtNoon,
  eventsOnWorkDay,
  localWorkDate,
  monthCells,
  shiftWorkDate,
  shiftWorkMonth,
  validWorkTimezone,
  zonedWorkISO,
  workWallClockISO,
} from "../../../../lib/work/calendar";
import {
  WorkPage,
  WorkText,
  WorkField,
  ConfirmWorkDelete,
  workStyles,
} from "../../../../lib/work/ui";
import { workError } from "../../../../lib/work/validation";
import type { WorkEventInput } from "../../../../types/work";
function fresh(day: string, zone: string): WorkEventInput {
  const start = new Date(workWallClockISO(day, 9, zone));
  const finalDay = day === "9999-12-31";
  return {
    title: "",
    notes: "",
    location: "",
    job_label: "",
    task_id: null,
    all_day: !finalDay,
    start_date: finalDay ? null : day,
    end_date: finalDay ? null : shiftWorkDate(day, 1),
    starts_at: zonedWorkISO(start, zone),
    ends_at: zonedWorkISO(new Date(start.getTime() + 3600000), zone),
    timezone: zone,
  };
}
export default function WorkCalendarScreen() {
  const scope = useWorkSession();
  return <Calendar key={scope.identity} />;
}
function Calendar() {
  const { profile } = useKairosAuth();
  const zone = validWorkTimezone(profile?.timezone ?? "")
    ? profile!.timezone
    : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const colors = useColors(),
    router = useRouter(),
    scope = useWorkSession();
  const [day, setDay] = useState(localWorkDate),
    [month, setMonth] = useState(() => localWorkDate().slice(0, 7));
  const query = useWorkCalendar(month, zone),
    save = useSaveWorkEvent(),
    remove = useDeleteWorkEvent();
  const [form, setForm] = useState(() => fresh(day, zone)),
    [editing, setEditing] = useState<string | undefined>(),
    [editor, setEditor] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const change = <K extends keyof WorkEventInput>(
    key: K,
    value: WorkEventInput[K],
  ) => setForm((f) => ({ ...f, [key]: value }));
  const agenda = eventsOnWorkDay(query.data ?? [], day, zone);
  const move = (delta: number) => {
    const next = shiftWorkMonth(month, delta);
    setMonth(next);
    setDay(`${next}-01`);
    setEditor(false);
  };
  const submit = async () => {
    const guard = scope.capture();
    setError("");
    try {
      const input = {
        ...form,
        start_date: form.all_day ? form.start_date : null,
        end_date: form.all_day ? form.end_date : null,
        starts_at: form.all_day ? null : form.starts_at,
        ends_at: form.all_day ? null : form.ends_at,
      };
      await save.mutateAsync({ id: editing, input });
      guard.assert();
      setEditor(false);
      setNotice(
        guard.preview
          ? "Event saved in this session only."
          : "Private Work event saved. Not synced to Google.",
      );
    } catch (e) {
      if (guard.current()) setError(workError(e));
    }
  };
  const deleteEvent = async (id: string) => {
    const guard = scope.capture();
    try {
      await remove.mutateAsync(id);
      guard.assert();
      setEditor(false);
      setNotice("Work event removed.");
    } catch (e) {
      if (guard.current()) setError(workError(e));
    }
  };
  return (
    <WorkPage
      title="Work Calendar"
      subtitle="Your month, your agenda. Independent of Life Planner."
    >
      <KairosButton
        label="Google Calendar · Not connected"
        icon="settings"
        tone="secondary"
        onPress={() => router.push("/work/calendar/setup" as Href)}
      />
      <KairosCard style={workStyles.card}>
        <View style={{ ...workStyles.row, justifyContent: "space-between" }}>
          <KairosButton
            compact
            label="Previous"
            accessibilityLabel="Previous month"
            tone="ghost"
            disabled={month === "0001-01"}
            onPress={() => move(-1)}
          />
          <WorkText title>
            {dateAtNoon(`${month}-01`).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </WorkText>
          <KairosButton
            compact
            label="Next"
            accessibilityLabel="Next month"
            tone="ghost"
            disabled={month === "9999-12"}
            onPress={() => move(1)}
          />
        </View>
        <WorkText>
          Agenda display timezone: {zone}. All-day dates stay as calendar days.
        </WorkText>
        <View style={{ flexDirection: "row" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <Text
              key={d}
              style={{
                width: "14.2857%",
                textAlign: "center",
                color: colors.muted,
                fontSize: 11,
              }}
            >
              {d}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {monthCells(month).map((cell, index) => {
            const count = cell
              ? eventsOnWorkDay(query.data ?? [], cell, zone).length
              : 0;
            return (
              <View
                key={cell ?? `blank-${index}`}
                style={{ width: "14.2857%", padding: 2 }}
              >
                <Pressable
                  disabled={!cell}
                  accessibilityRole="button"
                  accessibilityLabel={
                    cell ? `${cell}, ${count} events` : "Empty day"
                  }
                  accessibilityState={{ selected: cell === day }}
                  onPress={() => {
                    if (cell) {
                      setDay(cell);
                      setEditor(false);
                    }
                  }}
                  style={{
                    minHeight: 48,
                    borderRadius: 10,
                    backgroundColor:
                      cell === day ? colors.primary : colors.background,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color:
                        cell === day ? colors.background : colors.foreground,
                    }}
                  >
                    {cell ? Number(cell.slice(-2)) : ""}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: cell === day ? colors.background : colors.primary,
                    }}
                  >
                    {count ? `${count} •` : ""}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        <KairosButton
          label="Today"
          compact
          tone="secondary"
          onPress={() => {
            const today = localWorkDate();
            setDay(today);
            setMonth(today.slice(0, 7));
            setEditor(false);
          }}
        />
      </KairosCard>
      <WorkText title>Agenda · {day}</WorkText>
      <KairosButton
        label="Create Work event"
        icon="add"
        disabled={!scope.user || scope.loading}
        onPress={() => {
          setForm(fresh(day, zone));
          setEditing(undefined);
          setEditor(true);
          setError("");
        }}
      />
      {notice ? <WorkText>{notice}</WorkText> : null}
      {!scope.user?.isPreview && query.isLoading ? (
        <WorkText>Loading private events…</WorkText>
      ) : null}
      {!scope.user?.isPreview && query.error ? (
        <>
          <WorkText error>{workError(query.error)}</WorkText>
          <KairosButton
            label="Retry loading"
            tone="secondary"
            onPress={() => void query.refetch()}
          />
        </>
      ) : null}
      {!agenda.length ? (
        <WorkText>
          No Work events on this day. No existing events are invented in
          preview.
        </WorkText>
      ) : null}
      {agenda.map((event) => (
        <KairosCard key={event.id} style={workStyles.card}>
          <WorkText title>{event.title}</WorkText>
          <WorkText>
            {event.all_day
              ? `All day · ${event.start_date} through ${shiftWorkDate(event.end_date!, -1)}`
              : `${new Date(event.starts_at!).toLocaleString(undefined, { timeZone: zone })} → ${new Date(event.ends_at!).toLocaleString(undefined, { timeZone: zone })} (${zone})`}
          </WorkText>
          {!event.all_day ? (
            <WorkText>Event timezone: {event.timezone}</WorkText>
          ) : null}
          {event.location ? (
            <WorkText>Location: {event.location}</WorkText>
          ) : null}
          {event.job_label ? <WorkText>Job: {event.job_label}</WorkText> : null}
          {event.notes ? <WorkText>{event.notes}</WorkText> : null}
          <View style={workStyles.row}>
            <KairosButton
              compact
              tone="secondary"
              label="View / edit event"
              onPress={() => {
                const values = workEventForEditor(event);
                setForm(values);
                setEditing(event.id);
                setEditor(true);
                setError("");
              }}
            />
            <ConfirmWorkDelete
              label="Remove event"
              description="Permanently remove this private Work event? This does not delete any file or affect Google Calendar."
              disabled={remove.isPending}
              onConfirm={() => void deleteEvent(event.id)}
            />
          </View>
        </KairosCard>
      ))}
      {editor ? (
        <KairosCard style={workStyles.card}>
          <WorkText title>{editing ? "Edit event" : "New event"}</WorkText>
          <WorkField
            label="Event title"
            value={form.title}
            onChange={(v) => change("title", v)}
          />
          <View style={workStyles.row}>
            <WorkText>All-day event</WorkText>
            <Switch
              accessibilityLabel="All-day event"
              value={form.all_day}
              onValueChange={(v) => {
                if (v && day === "9999-12-31") {
                  setError(
                    "An all-day event needs an exclusive end within years 0001–9999.",
                  );
                  return;
                }
                if (!validWorkTimezone(form.timezone)) {
                  setError(
                    "Choose a valid event timezone before changing the event type.",
                  );
                  return;
                }
                setForm((f) => ({
                  ...f,
                  all_day: v,
                  start_date: f.start_date ?? day,
                  end_date:
                    f.end_date ??
                    (day === "9999-12-31" ? null : shiftWorkDate(day, 1)),
                  starts_at: f.starts_at ?? fresh(day, f.timezone).starts_at,
                  ends_at: f.ends_at ?? fresh(day, f.timezone).ends_at,
                }));
              }}
            />
          </View>
          {form.all_day ? (
            <>
              <WorkField
                label="Start day (YYYY-MM-DD)"
                value={form.start_date ?? ""}
                maxLength={10}
                onChange={(v) => change("start_date", v)}
              />
              <WorkField
                label="Exclusive end day (YYYY-MM-DD)"
                value={form.end_date ?? ""}
                maxLength={10}
                onChange={(v) => change("end_date", v)}
              />
              <WorkText>
                For a one-day event, use the following day as the exclusive end.
                Dates never shift through UTC.
              </WorkText>
            </>
          ) : (
            <>
              <WorkField
                label="Start ISO time with offset"
                value={form.starts_at ?? ""}
                maxLength={35}
                placeholder="2026-11-16T09:00+10:00"
                onChange={(v) => change("starts_at", v)}
              />
              <WorkField
                label="End ISO time with offset"
                value={form.ends_at ?? ""}
                maxLength={35}
                onChange={(v) => change("ends_at", v)}
              />
              <WorkText>
                Offsets must match the event timezone at that instant. On
                daylight-saving overlaps, choose the intended offset explicitly.
              </WorkText>
            </>
          )}
          <WorkField
            label="Event IANA timezone"
            value={form.timezone}
            maxLength={100}
            onChange={(v) => change("timezone", v)}
          />
          <WorkField
            label="Location (optional)"
            value={form.location}
            maxLength={300}
            onChange={(v) => change("location", v)}
          />
          <WorkField
            label="Job label (optional)"
            value={form.job_label}
            maxLength={120}
            onChange={(v) => change("job_label", v)}
          />
          <WorkField
            label="Notes (optional)"
            value={form.notes}
            maxLength={2000}
            multiline
            onChange={(v) => change("notes", v)}
          />
          {error ? <WorkText error>{error}</WorkText> : null}
          <KairosButton
            label="Save event"
            icon="save"
            loading={save.isPending}
            onPress={() => void submit()}
          />
          <KairosButton
            tone="ghost"
            label="Cancel"
            onPress={() => setEditor(false)}
          />
        </KairosCard>
      ) : error ? (
        <WorkText error>{error}</WorkText>
      ) : null}
      <WorkText>
        Cloud view is capped at 500 intersecting events per month. Recurrence,
        invites, device calendars and provider sync are not included.
      </WorkText>
    </WorkPage>
  );
}
