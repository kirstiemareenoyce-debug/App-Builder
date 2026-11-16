import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, type Href } from "expo-router";
import { View } from "react-native";
import { KairosCard } from "../../components/kairos/card";
import { PressableScale } from "../../components/kairos/pressable-scale";
import { useColors } from "../../hooks/use-colors";
import { useWorkSession } from "../../lib/work/session";
import { WorkPage, WorkText, workStyles } from "../../lib/work/ui";
const ITEMS = [
  {
    title: "Tasks",
    subtitle: "Work-only next steps and job labels",
    icon: "check-circle-outline",
    href: "/work/tasks",
  },
  {
    title: "Receipt copies",
    subtitle: "Your existing private receipts & expenses",
    icon: "receipt-long",
    href: "/work/receipts",
  },
  {
    title: "Photos & drafts",
    subtitle: "Job photos and PDF drawings, kept separate",
    icon: "photo-library",
    href: "/work/photos",
  },
  {
    title: "Calendar",
    subtitle: "Month view and your private Work agenda",
    icon: "event-note",
    href: "/work/calendar",
  },
] as const;
export default function WorkHub() {
  const router = useRouter(),
    colors = useColors();
  useWorkSession();
  return (
    <WorkPage
      title="My Work"
      subtitle="A clear place for your working day."
      back={false}
    >
      {ITEMS.map((item) => (
        <PressableScale
          key={item.href}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.subtitle}`}
          onPress={() => router.push(item.href as Href)}
        >
          <KairosCard style={workStyles.row}>
            <MaterialIcons name={item.icon} size={30} color={colors.primary} />
            <View style={{ flex: 1, gap: 5 }}>
              <WorkText title>{item.title}</WorkText>
              <WorkText>{item.subtitle}</WorkText>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={colors.primary}
            />
          </KairosCard>
        </PressableScale>
      ))}
    </WorkPage>
  );
}
