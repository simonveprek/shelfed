import { APP_ICONS, appIcon, appIconSvg } from "../../../shared/icons";
import { api, isMac } from "./api";
import { setSetting } from "./store";

/** An icon as a picture the page can show, in this system's shape. */
export const iconSrc = (id: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(appIconSvg(appIcon(id), isMac))}`;

/** Draws the icon to a PNG, for the Dock or taskbar. */
async function draw(id: string) {
  const image = new Image();
  image.src = iconSrc(id);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  canvas.getContext("2d")!.drawImage(image, 0, 0, 1024, 1024);
  return canvas.toDataURL("image/png");
}

/** Makes an icon Shelf's, now and from the next start. */
export async function chooseIcon(id: string) {
  if (!APP_ICONS.some((icon) => icon.id === id)) return;
  setSetting({ icon: id });
  await api.setAppIcon(await draw(id));
}
