/**
 * Every Kindle with an e-ink screen, what it looks like, and the device codes
 * in its serial number that give it away when it is plugged in.
 *
 * Older Kindles put a two digit hex code after the first two characters of
 * the serial (B024…), newer ones a three character code after the first
 * three (G090G1…). The codes come from the Kindle hacking community's lists;
 * a Kindle Shelfed doesn't know yet can still be picked by hand.
 */

export type KindleShape =
  /** A keyboard under the screen. */
  | "keyboard"
  /** Page buttons and a five-way pad under the screen. */
  | "buttons"
  /** A screen set back in a raised bezel. */
  | "bezel"
  /** One sheet of glass across the front. */
  | "flush"
  /** A wide grip down one side, with page buttons. */
  | "grip"
  /** A wide grip down the left, for a pen. */
  | "scribe";

export type KindleModel = {
  id: string;
  name: string;
  year: number;
  /** Width, height and depth in millimetres. */
  size: [number, number, number];
  /** The screen's diagonal in inches. */
  screen: number;
  shape: KindleShape;
  /** A colour screen. */
  colour?: boolean;
  /** The finishes it came in, the first being the usual one. */
  finishes: string[];
  codes: string[];
};

export const FINISHES: Record<string, { label: string; hex: string }> = {
  black: { label: "Black", hex: "#232325" },
  white: { label: "White", hex: "#e9e8e3" },
  graphite: { label: "Graphite", hex: "#3c3e42" },
  silver: { label: "Silver", hex: "#b9bbbe" },
  twilight: { label: "Twilight blue", hex: "#2e3f5c" },
  plum: { label: "Plum", hex: "#523146" },
  sage: { label: "Sage", hex: "#8f9d8a" },
  agave: { label: "Agave green", hex: "#3f4e46" },
  denim: { label: "Denim", hex: "#3d5170" },
  champagne: { label: "Champagne gold", hex: "#cdbb9c" },
  tungsten: { label: "Tungsten", hex: "#6c6d71" },
  jade: { label: "Jade", hex: "#46736a" },
  raspberry: { label: "Raspberry", hex: "#8c3550" },
  matcha: { label: "Matcha", hex: "#a8bd93" },
  metal: { label: "Metallic black", hex: "#2a2a2e" },
  fig: { label: "Fig", hex: "#5a3b4a" },
};

export const KINDLES: KindleModel[] = [
  { id: "k2", name: "Kindle 2", year: 2009, size: [135, 203, 9.1], screen: 6, shape: "keyboard", finishes: ["white"], codes: ["02", "03"] },
  { id: "dx", name: "Kindle DX", year: 2009, size: [183, 264, 9.7], screen: 9.7, shape: "keyboard", finishes: ["white", "graphite"], codes: ["04", "05", "09"] },
  { id: "k3", name: "Kindle Keyboard", year: 2010, size: [123, 190, 8.5], screen: 6, shape: "keyboard", finishes: ["graphite", "white"], codes: ["06", "08", "0A"] },
  { id: "k4", name: "Kindle (4th gen)", year: 2011, size: [114, 166, 8.7], screen: 6, shape: "buttons", finishes: ["silver", "black"], codes: ["0E", "23"] },
  { id: "touch", name: "Kindle Touch", year: 2011, size: [120, 172, 10.1], screen: 6, shape: "bezel", finishes: ["graphite"], codes: ["0F", "10", "11", "12"] },
  { id: "pw1", name: "Kindle Paperwhite (1st gen)", year: 2012, size: [117, 169, 9.1], screen: 6, shape: "bezel", finishes: ["black"], codes: ["24", "1B", "1C", "1D", "1F", "20"] },
  { id: "pw2", name: "Kindle Paperwhite (2nd gen)", year: 2013, size: [117, 169, 9.1], screen: 6, shape: "bezel", finishes: ["black"], codes: ["D4", "5A", "D5", "D6", "D7", "D8", "F2", "17", "60", "F4", "F9", "62", "61", "5F"] },
  { id: "k7", name: "Kindle (7th gen)", year: 2014, size: [119, 169, 10.2], screen: 6, shape: "bezel", finishes: ["black", "white"], codes: ["C6", "DD"] },
  { id: "voyage", name: "Kindle Voyage", year: 2014, size: [115, 162, 7.6], screen: 6, shape: "flush", finishes: ["black"], codes: ["13", "54", "2A", "4F", "52", "53"] },
  { id: "pw3", name: "Kindle Paperwhite (3rd gen)", year: 2015, size: [117, 169, 9.1], screen: 6, shape: "bezel", finishes: ["black", "white"], codes: ["0G1", "0G2", "0G4", "0G5", "0G6", "0G7", "0KB", "0KC", "0KD", "0KE", "0KF", "0KG", "0LK", "0LL"] },
  { id: "oasis1", name: "Kindle Oasis (1st gen)", year: 2016, size: [122, 143, 8.5], screen: 6, shape: "grip", finishes: ["black"], codes: ["0GC", "0GD", "0GR", "0GS", "0GT", "0GU"] },
  { id: "k8", name: "Kindle (8th gen)", year: 2016, size: [115, 160, 9.1], screen: 6, shape: "bezel", finishes: ["black", "white"], codes: ["0DT", "0K9", "0KA"] },
  { id: "oasis2", name: "Kindle Oasis (2nd gen)", year: 2017, size: [141, 159, 8.3], screen: 7, shape: "grip", finishes: ["graphite", "champagne"], codes: ["0LM", "0LN", "0LP", "0LQ", "0P1", "0P2", "0P6", "0P7", "0P8", "0S1", "0S2", "0S3", "0S4", "0S7", "0SA"] },
  { id: "pw4", name: "Kindle Paperwhite (10th gen)", year: 2018, size: [116, 167, 8.2], screen: 6, shape: "flush", finishes: ["black", "twilight", "plum", "sage"], codes: ["0PP", "0T1", "0T2", "0T3", "0T4", "0T5", "0T6", "0T7", "0TJ", "0TK", "0TL", "0TM", "0TN", "102", "103", "16Q", "16R", "16S", "16T", "16U", "16V"] },
  { id: "k10", name: "Kindle (10th gen)", year: 2019, size: [113, 160, 8.7], screen: 6, shape: "bezel", finishes: ["black", "white"], codes: ["10L", "0WF", "0WG", "0WH", "0WJ", "0VB"] },
  { id: "oasis3", name: "Kindle Oasis (3rd gen)", year: 2019, size: [141, 159, 8.4], screen: 7, shape: "grip", finishes: ["graphite", "champagne"], codes: ["11L", "0WQ", "0WP", "0WN", "0WM", "0WL"] },
  { id: "pw5", name: "Kindle Paperwhite (11th gen)", year: 2021, size: [125, 174, 8.1], screen: 6.8, shape: "flush", finishes: ["black", "agave", "denim"], codes: ["1LG", "1Q0", "1PX", "1VD", "219", "21A", "2BH", "2BJ", "2DK"] },
  { id: "k11", name: "Kindle (11th gen)", year: 2022, size: [108, 158, 8], screen: 6, shape: "bezel", finishes: ["black", "denim"], codes: ["22D", "25T", "23A", "2AQ", "2AP", "1XH", "22C"] },
  { id: "scribe1", name: "Kindle Scribe", year: 2022, size: [196, 230, 5.8], screen: 10.2, shape: "scribe", finishes: ["tungsten"], codes: ["27J", "2BL", "263", "227", "2BM", "23L", "23M", "270"] },
  { id: "k12", name: "Kindle (12th gen)", year: 2024, size: [109, 158, 8], screen: 6, shape: "bezel", finishes: ["black", "matcha"], codes: ["3L5", "3L6", "3L4", "3L3", "3L2", "3KM"] },
  { id: "pw6", name: "Kindle Paperwhite (12th gen)", year: 2024, size: [128, 177, 7.8], screen: 7, shape: "flush", finishes: ["black", "jade", "raspberry"], codes: ["3H5", "3H3", "3H8", "3J5", "3JS"] },
  { id: "colorsoft", name: "Kindle Colorsoft", year: 2024, size: [128, 177, 7.8], screen: 7, shape: "flush", colour: true, finishes: ["metal", "jade", "fig"], codes: ["3H9", "3H4", "3HA", "3H6", "3H7"] },
  { id: "scribe2", name: "Kindle Scribe (2nd gen)", year: 2024, size: [196, 230, 5.4], screen: 10.2, shape: "scribe", finishes: ["tungsten", "jade"], codes: ["3V0", "3V1", "3X5", "3UV", "3X4", "3X3", "41E", "41D"] },
  { id: "scribecolor", name: "Kindle Scribe Colorsoft", year: 2025, size: [196, 230, 5.4], screen: 11, shape: "scribe", colour: true, finishes: ["tungsten", "fig"], codes: [] },
];

export const kindleById = (id?: string) => KINDLES.find((k) => k.id === id);

/**
 * Kindles from 2024 on connect the way phones do (MTP), not as a drive, so
 * nothing can copy files to them like a USB stick.
 */
export const connectsLikeAPhone = (model?: KindleModel) => Boolean(model && model.year >= 2024);

/** The model a serial number belongs to, when Shelfed knows it. */
export function kindleFromSerial(serial: string): KindleModel | undefined {
  const s = serial.toUpperCase().replace(/\s/g, "");
  const newer = s.slice(3, 6);
  const older = s.slice(2, 4);
  const find = (code: string) => KINDLES.find((k) => k.codes.includes(code));
  // Newer serials start with G; older ones with B or 9.
  return s.startsWith("G") ? (find(newer) ?? find(older)) : (find(older) ?? find(newer));
}
