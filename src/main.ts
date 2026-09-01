import "./styles.css";
import "@angular/localize/init";
import { initI18n } from "./app/i18n";

// Translations must be loaded BEFORE the app modules are evaluated —
// $localize strings at module scope (e.g. suggestions in app.config) resolve
// at import time. Hence the dynamic import after initI18n().
initI18n();

Promise.all([
  import("@angular/platform-browser"),
  import("./app/app"),
  import("./app/app.config"),
])
  .then(([{ bootstrapApplication }, { App }, { appConfig }]) =>
    bootstrapApplication(App, appConfig),
  )
  .catch((err) => console.error(err));
