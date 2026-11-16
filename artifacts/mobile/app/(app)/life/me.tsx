import { LifeSectionScreen, type LifeSectionItem } from "@/components/kairos/life-section-screen";

const ITEMS: LifeSectionItem[] = [
  { key: "mood", title: "Mood & energy", subtitle: "Check in with yourself", icon: "mood", href: "/mood/log" },
  { key: "sleep", title: "Sleep", subtitle: "Record rest and recovery", icon: "bedtime", href: "/sleep/log" },
  { key: "tasks", title: "Tasks", subtitle: "Choose a personal next step", icon: "check-circle-outline", href: "/tasks" },
  { key: "notes", title: "Notes", subtitle: "Keep a private record", icon: "sticky-note-2", href: "/notes" },
  { key: "settings", title: "Profile & settings", subtitle: "Manage your account and preferences", icon: "manage-accounts", href: "/settings" },
];

export default function MeSectionScreen() {
  return (
    <LifeSectionScreen
      title="Me"
      subtitle="Your wellbeing and personal routines, together in one place."
      privacyNote="Mood, sleep, and personal notes stay private to you. They are not included in partner sharing."
      items={ITEMS}
    />
  );
}
