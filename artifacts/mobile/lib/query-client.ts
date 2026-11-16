import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";

export const KAIROS_QUERY_CACHE_MAX_AGE = 1000 * 60 * 60 * 24;

export function shouldPersistKairosQuery(query: {
  queryKey: readonly unknown[];
  meta?: Record<string, unknown>;
  state: { status: string };
}) {
  const key = String(query.queryKey[0] ?? "");
  return (
    query.state.status === "success" &&
    !query.meta?.sensitive &&
    !key.startsWith("aevum") &&
    !key.startsWith("relationship-media-") &&
    !key.startsWith("work-") &&
    !key.startsWith("kairos-") &&
    !key.startsWith("individual-intake") &&
    key !== "partner"
  );
}

export function createKairosQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30,
        gcTime: KAIROS_QUERY_CACHE_MAX_AGE,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export const kairosQueryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "kairos-react-query-v2",
  throttleTime: 1000,
});
