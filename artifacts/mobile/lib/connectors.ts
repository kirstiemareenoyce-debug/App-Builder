import type MaterialIcons from "@expo/vector-icons/MaterialIcons";

export type ConnectorStatus = "connected" | "connect";

export type KairosConnector = {
  id: string;
  title: string;
  shortTitle?: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  status: ConnectorStatus;
  beta?: boolean;
  connectedLabel?: string;
  description: string;
  setupNote: string;
};

export const KAIROS_CONNECTORS: readonly KairosConnector[] = [
  {
    id: "google-workspace",
    title: "Google Workspace",
    icon: "cloud-queue",
    status: "connect",
    description: "Files, calendar and work context in one place.",
    setupNote: "Requires a Google Cloud OAuth client, consent screen and redirect URI.",
  },
  {
    id: "shopify",
    title: "Shopify",
    icon: "storefront",
    status: "connect",
    beta: true,
    description: "Storefront and order context for your work space.",
    setupNote: "Requires a Shopify app, shop domain and approved Admin API scopes.",
  },
  {
    id: "outlook-calendar",
    title: "Outlook Calendar",
    icon: "event",
    status: "connect",
    description: "Bring your schedule into a calmer daily view.",
    setupNote: "Requires a Microsoft Entra app and delegated calendar permissions.",
  },
  {
    id: "instagram-creator-marketplace",
    title: "Instagram Creator Marketplace",
    shortTitle: "Instagram Creator Marketplace",
    icon: "photo-camera",
    status: "connect",
    beta: true,
    description: "Keep creator opportunities close to your planning space.",
    setupNote: "Requires Meta app review, creator eligibility and approved permissions.",
  },
  {
    id: "github",
    title: "GitHub",
    icon: "code",
    status: "connect",
    description: "Projects, issues and delivery context when you need it.",
    setupNote: "Requires a GitHub OAuth app and repository scopes selected by the user.",
  },
  {
    id: "meta-ads",
    title: "Meta Ads Manager",
    icon: "campaign",
    status: "connect",
    beta: true,
    description: "Campaign context for planning and review.",
    setupNote: "Requires Meta Business verification, app review and ad-account access.",
  },
  {
    id: "outlook-mail",
    title: "Outlook Mail",
    icon: "mail-outline",
    status: "connect",
    description: "A deliberate view of the messages you choose to bring in.",
    setupNote: "Requires a Microsoft Entra app and delegated Mail.Read permission.",
  },
  {
    id: "instagram",
    title: "Instagram",
    icon: "camera-alt",
    status: "connect",
    description: "Keep selected social context separate from private journaling.",
    setupNote: "Requires a Meta app, professional account and approved Instagram scopes.",
  },
  {
    id: "google-calendar",
    title: "Google Calendar",
    icon: "calendar-today",
    status: "connect",
    description: "See the shape of your day without losing your private space.",
    setupNote: "Requires a Google Cloud OAuth client and Calendar API consent.",
  },
  {
    id: "spotify",
    title: "Spotify",
    icon: "music-note",
    status: "connect",
    description: "Bring selected listening context into songs and memories.",
    setupNote: "Requires a Spotify app, OAuth redirect URI and allowlisted test users in development mode.",
  },
  {
    id: "youtube-music",
    title: "YouTube Music",
    icon: "play-arrow",
    status: "connect",
    description: "Save links and listening memories without claiming unsupported playback APIs.",
    setupNote: "The demo supports links; a dedicated official YouTube Music playback API is not assumed.",
  },
  {
    id: "soundcloud",
    title: "SoundCloud",
    icon: "cloud",
    status: "connect",
    description: "Keep the tracks and moments you choose to remember.",
    setupNote: "Requires a SoundCloud app and OAuth 2.1 PKCE configuration.",
  },
] as const;
