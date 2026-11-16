import ReceiptsScreen from "../../receipts";
import { useKairosAuth } from "../../../../providers/supabase-auth-provider";
export default function WorkReceiptsScreen() {
  const { user } = useKairosAuth();
  return (
    <ReceiptsScreen
      key={`${user?.id ?? "anonymous"}:${Boolean(user?.isPreview)}`}
    />
  );
}
