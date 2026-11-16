import { Redirect, type Href } from "expo-router";

/** Legacy entry point: Aevum reflections now live within Connection. */
export default function AevumRoute() {
  return <Redirect href={"/connection" as Href} />;
}
