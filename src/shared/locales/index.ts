import { addWords } from "../i18n";
import agreed from "./cs-agreed";
import common from "./cs-common";
import details from "./cs-details";
import dialogs from "./cs-dialogs";
import kit from "./cs-kit";
import library from "./cs-library";
import main from "./cs-main";
import reader from "./cs-reader";
import settings from "./cs-settings";

/** Every translation, loaded once by whichever side of the app starts first. */
addWords("cs", { ...kit, ...common, ...library, ...settings, ...dialogs, ...details, ...reader, ...main, ...agreed });
