import { signalStore } from "@ngrx/signals";
import { withCopilotKit } from "./features/with-copilot";
import { withTrip } from "./features/with-trip";

export const TripStore = signalStore(
  { providedIn: "root" },
  withTrip(),
  withCopilotKit(),
);
