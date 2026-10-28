import { describe, expect, it } from "vitest";
import { personName, personNames } from "../src/shared/names";

describe("names on spines", () => {
  it("turns a catalogue name round", () => {
    expect(personName("Flanagan, John")).toBe("John Flanagan");
    expect(personName(" Austen ,  Jane ")).toBe("Jane Austen");
    expect(personName("Le Guin, Ursula K.")).toBe("Ursula K. Le Guin");
  });

  it("drops life dates catalogues add", () => {
    expect(personName("Doyle, Arthur Conan, 1859-1930")).toBe("Arthur Conan Doyle");
    expect(personName("Austen, Jane (1775-1817)")).toBe("Jane Austen");
    expect(personName("Flanagan, John, 1944-")).toBe("John Flanagan");
  });

  it("keeps a suffix at the end", () => {
    expect(personName("King, Martin Luther, Jr.")).toBe("Martin Luther King Jr.");
  });

  it("leaves names that are already right, and ones it can't be sure of", () => {
    expect(personName("Jane Austen")).toBe("Jane Austen");
    expect(personName("Smith, Jr.")).toBe("Smith, Jr.");
    expect(personName("Penguin, Inc.")).toBe("Penguin, Inc.");
    expect(personName("One, Two, Three")).toBe("One, Two, Three");
    expect(personName("Plato")).toBe("Plato");
  });

  it("counts a writer once when two spellings meet", () => {
    expect(personNames(["Flanagan, John", "John Flanagan", ""])).toEqual(["John Flanagan"]);
  });
});
