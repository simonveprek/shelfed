import { describe, expect, it } from "vitest";
import { seriesFix, seriesInTitle } from "../src/shared/series";

describe("a series kept in the title", () => {
  it("is read from the ways ebooks write it", () => {
    expect(seriesInTitle("The King of the West: (Path of the Ranger Book 7)")).toEqual({ title: "The King of the West", series: "Path of the Ranger", index: 7 });
    expect(seriesInTitle("The Great Council (Path of the Ranger, Book 10)")).toEqual({ title: "The Great Council", series: "Path of the Ranger", index: 10 });
    expect(seriesInTitle("The Ruins of Gorlan (Ranger's Apprentice #1)")).toEqual({ title: "The Ruins of Gorlan", series: "Ranger's Apprentice", index: 1 });
    expect(seriesInTitle("Mistborn [Mistborn, #1]")).toBeNull();
    expect(seriesInTitle("The Final Empire [Mistborn, #1]")).toEqual({ title: "The Final Empire", series: "Mistborn", index: 1 });
    expect(seriesInTitle("Power Conspiracy: Path of the Ranger, Book 9")).toEqual({ title: "Power Conspiracy", series: "Path of the Ranger", index: 9 });
    expect(seriesInTitle("Dune Messiah - Dune Chronicles Vol. 2")).toBeNull();
    expect(seriesInTitle("Dune Messiah: Dune Chronicles Vol. 2")).toEqual({ title: "Dune Messiah", series: "Dune Chronicles", index: 2 });
    expect(seriesInTitle("The Secret Refuge (Path of the Ranger Series Book Five)")).toEqual({ title: "The Secret Refuge", series: "Path of the Ranger", index: 5 });
    expect(seriesInTitle("Half a Book (Saga, #2.5)")).toEqual({ title: "Half a Book", series: "Saga", index: 2.5 });
  });

  it("isn't found where there's no series with a number", () => {
    for (const title of ["1984", "Catch-22", "Stories: Part Two", "Emma", "Collected Poems (1950)", "Book 7", "(Path of the Ranger Book 7)", "Fahrenheit 451", "The Hobbit (Illustrated)", "Harry Potter: Book 1"])
      expect(seriesInTitle(title), title).toBeNull();
  });

  it("gives the fix, unless the book already has a different series", () => {
    expect(seriesFix({ title: "The King of the West: (Path of the Ranger Book 7)" })).toEqual({ title: "The King of the West", series: "Path of the Ranger", seriesIndex: 7 });
    expect(seriesFix({ title: "The King of the West: (Path of the Ranger Book 7)", series: "path of the ranger", seriesIndex: 7 })).toEqual({ title: "The King of the West", series: "path of the ranger", seriesIndex: 7 });
    expect(seriesFix({ title: "The King of the West: (Path of the Ranger Book 7)", series: "Ranger Omnibus", seriesIndex: 2 })).toBeNull();
    expect(seriesFix({ title: "Emma" })).toBeNull();
  });
});
