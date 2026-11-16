import { Stack } from "expo-router";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { IndividualIntakeProvider } from "@/hooks/use-individual-intake";
import {
  bindIndividualIntakeIdentity,
  intakeIdentityKey,
} from "@/lib/individual-intake/client-state";
export default function IndividualLayout() {
  const { user } = useKairosAuth();
  bindIndividualIntakeIdentity(user?.id ?? null, Boolean(user?.isPreview));
  return (
    <IndividualIntakeProvider
      key={intakeIdentityKey(user?.id ?? "", Boolean(user?.isPreview))}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#07130D" },
        }}
      />
    </IndividualIntakeProvider>
  );
}
