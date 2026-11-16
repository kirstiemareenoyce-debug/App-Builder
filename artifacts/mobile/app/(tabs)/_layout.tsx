import { Tabs, Redirect } from "expo-router";
import { MAIN_DESTINATIONS } from "@/components/navigation/floating-main-navigation";
import { useKairosAuth } from "@/providers/supabase-auth-provider";

export default function TabLayout() {
  const { loading, user } = useKairosAuth();
  if (!loading && !user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="you" options={{ href: null }} />
      {MAIN_DESTINATIONS.map((item) => (
        <Tabs.Screen key={item.href} name={item.href.slice(1)} options={{ title: item.label }} />
      ))}
    </Tabs>
  );
}
