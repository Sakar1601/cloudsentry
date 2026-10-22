import AppView from "@/components/AppView";
import Landing from "@/components/landing/Landing";
import { STATIC_DEMO } from "@/lib/api";

// The static demo opens on an explainer; the real product opens straight on
// the live graph. The full-screen app is always reachable at /demo.
export default function Home() {
  return STATIC_DEMO ? <Landing /> : <AppView />;
}
