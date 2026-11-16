import { Redirect, type Href } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";

export default function RelationshipRedirectScreen() {
  return (
    <ScreenContainer>
      <Redirect href={"/aevum/life" as Href} />
    </ScreenContainer>
  );
}
