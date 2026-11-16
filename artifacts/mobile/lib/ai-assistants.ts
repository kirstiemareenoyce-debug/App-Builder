import type MaterialIcons from "@expo/vector-icons/MaterialIcons";

export type AIAssistantId = "aevum" | "kairos" | "evergreen";
export type AIAssistant = {
  id: AIAssistantId;
  name: string;
  tagline: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  href: `/assistants/${AIAssistantId}`;
};

/** Configured experiences, not three foundation models or clinical specialists. */
export const AI_ASSISTANTS = [
  {
    id: "aevum", name: "Aevum AI", tagline: "Understand each other, with care.",
    description: "Relationship education and communication support. Existing coaching stays separate from private Kairos learning; sharing is always a deliberate choice.",
    icon: "favorite-outline", href: "/assistants/aevum",
  },
  {
    id: "kairos", name: "Kairos AI", tagline: "Learn about your own inner world.",
    description: "Individual learning, self-understanding and optional reflection. Educational support, not diagnosis, therapy or a clinical questionnaire.",
    icon: "psychology", href: "/assistants/kairos",
  },
  {
    id: "evergreen", name: "Evergreen AI", tagline: "Practical help for everyday life.",
    description: "Everyday questions, ideas and planning in your existing Evergreen conversation. Kairos learning and Aevum coaching have their own spaces.",
    icon: "auto-awesome", href: "/assistants/evergreen",
  },
] as const satisfies readonly AIAssistant[];
