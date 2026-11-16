import { Redirect, type Href } from "expo-router";

/** Legacy entry point: relationship features now live within Connection. */
export default function UsRoute() {
  return <Redirect href={"/connection" as Href} />;
}
