import { Redirect, type Href } from "expo-router";
export default function LegacyWorkScreen() {
  return <Redirect href={"/work" as Href} />;
}
