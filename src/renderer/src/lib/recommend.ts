import type { Book } from "../../../shared/types";
import { norm } from "./util";

/*
 * What to read next, worked out on this computer. Two parts: a hand-made
 * map of classics that belong together, each pairing with its reason, and a
 * score for the books already in the library by shared subjects, author and
 * series. Nothing about your reading leaves Shelf.
 */

type Classic = { title: string; author: string };

const C: Record<string, Classic> = {
  jane: { title: "Jane Eyre", author: "Charlotte Brontë" },
  villette: { title: "Villette", author: "Charlotte Brontë" },
  wuthering: { title: "Wuthering Heights", author: "Emily Brontë" },
  tenant: { title: "The Tenant of Wildfell Hall", author: "Anne Brontë" },
  pride: { title: "Pride and Prejudice", author: "Jane Austen" },
  emma: { title: "Emma", author: "Jane Austen" },
  persuasion: { title: "Persuasion", author: "Jane Austen" },
  sense: { title: "Sense and Sensibility", author: "Jane Austen" },
  northanger: { title: "Northanger Abbey", author: "Jane Austen" },
  northsouth: { title: "North and South", author: "Elizabeth Gaskell" },
  cranford: { title: "Cranford", author: "Elizabeth Gaskell" },
  middlemarch: { title: "Middlemarch", author: "George Eliot" },
  floss: { title: "The Mill on the Floss", author: "George Eliot" },
  littlewomen: { title: "Little Women", author: "Louisa May Alcott" },
  anne: { title: "Anne of Green Gables", author: "L. M. Montgomery" },
  innocence: { title: "The Age of Innocence", author: "Edith Wharton" },
  mirth: { title: "The House of Mirth", author: "Edith Wharton" },
  portrait: { title: "The Portrait of a Lady", author: "Henry James" },
  screw: { title: "The Turn of the Screw", author: "Henry James" },
  gatsby: { title: "The Great Gatsby", author: "F. Scott Fitzgerald" },
  paradise: { title: "This Side of Paradise", author: "F. Scott Fitzgerald" },
  sunrises: { title: "The Sun Also Rises", author: "Ernest Hemingway" },
  dalloway: { title: "Mrs. Dalloway", author: "Virginia Woolf" },
  lighthouse: { title: "To the Lighthouse", author: "Virginia Woolf" },
  dracula: { title: "Dracula", author: "Bram Stoker" },
  carmilla: { title: "Carmilla", author: "J. Sheridan Le Fanu" },
  frankenstein: { title: "Frankenstein", author: "Mary Wollstonecraft Shelley" },
  jekyll: { title: "The Strange Case of Dr. Jekyll and Mr. Hyde", author: "Robert Louis Stevenson" },
  dorian: { title: "The Picture of Dorian Gray", author: "Oscar Wilde" },
  earnest: { title: "The Importance of Being Earnest", author: "Oscar Wilde" },
  yellow: { title: "The King in Yellow", author: "Robert W. Chambers" },
  usher: { title: "The Fall of the House of Usher", author: "Edgar Allan Poe" },
  whitewoman: { title: "The Woman in White", author: "Wilkie Collins" },
  moonstone: { title: "The Moonstone", author: "Wilkie Collins" },
  invisible: { title: "The Invisible Man", author: "H. G. Wells" },
  timemachine: { title: "The Time Machine", author: "H. G. Wells" },
  worlds: { title: "The War of the Worlds", author: "H. G. Wells" },
  moreau: { title: "The Island of Doctor Moreau", author: "H. G. Wells" },
  leagues: { title: "Twenty Thousand Leagues under the Sea", author: "Jules Verne" },
  journey: { title: "Journey to the Center of the Earth", author: "Jules Verne" },
  eighty: { title: "Around the World in Eighty Days", author: "Jules Verne" },
  treasure: { title: "Treasure Island", author: "Robert Louis Stevenson" },
  kidnapped: { title: "Kidnapped", author: "Robert Louis Stevenson" },
  crusoe: { title: "Robinson Crusoe", author: "Daniel Defoe" },
  gulliver: { title: "Gulliver's Travels", author: "Jonathan Swift" },
  proposal: { title: "A Modest Proposal", author: "Jonathan Swift" },
  candide: { title: "Candide", author: "Voltaire" },
  quixote: { title: "Don Quixote", author: "Miguel de Cervantes Saavedra" },
  moby: { title: "Moby Dick", author: "Herman Melville" },
  bartleby: { title: "Bartleby, the Scrivener", author: "Herman Melville" },
  scarlet: { title: "The Scarlet Letter", author: "Nathaniel Hawthorne" },
  darkness: { title: "Heart of Darkness", author: "Joseph Conrad" },
  lordjim: { title: "Lord Jim", author: "Joseph Conrad" },
  huck: { title: "Adventures of Huckleberry Finn", author: "Mark Twain" },
  sawyer: { title: "The Adventures of Tom Sawyer", author: "Mark Twain" },
  crime: { title: "Crime and Punishment", author: "Fyodor Dostoyevsky" },
  karamazov: { title: "The Brothers Karamazov", author: "Fyodor Dostoyevsky" },
  underground: { title: "Notes from the Underground", author: "Fyodor Dostoyevsky" },
  metamorphosis: { title: "Metamorphosis", author: "Franz Kafka" },
  trial: { title: "The Trial", author: "Franz Kafka" },
  anna: { title: "Anna Karenina", author: "Leo Tolstoy" },
  warpeace: { title: "War and Peace", author: "Leo Tolstoy" },
  bovary: { title: "Madame Bovary", author: "Gustave Flaubert" },
  expectations: { title: "Great Expectations", author: "Charles Dickens" },
  twocities: { title: "A Tale of Two Cities", author: "Charles Dickens" },
  oliver: { title: "Oliver Twist", author: "Charles Dickens" },
  carol: { title: "A Christmas Carol", author: "Charles Dickens" },
  miserables: { title: "Les Misérables", author: "Victor Hugo" },
  hunchback: { title: "The Hunchback of Notre-Dame", author: "Victor Hugo" },
  cristo: { title: "The Count of Monte Cristo", author: "Alexandre Dumas" },
  musketeers: { title: "The Three Musketeers", author: "Alexandre Dumas" },
  holmes: { title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle" },
  hound: { title: "The Hound of the Baskervilles", author: "Arthur Conan Doyle" },
  alice: { title: "Alice's Adventures in Wonderland", author: "Lewis Carroll" },
  glass: { title: "Through the Looking-Glass", author: "Lewis Carroll" },
  peter: { title: "Peter Pan", author: "J. M. Barrie" },
  oz: { title: "The Wonderful Wizard of Oz", author: "L. Frank Baum" },
  garden: { title: "The Secret Garden", author: "Frances Hodgson Burnett" },
  willows: { title: "The Wind in the Willows", author: "Kenneth Grahame" },
  odyssey: { title: "The Odyssey", author: "Homer" },
  iliad: { title: "The Iliad", author: "Homer" },
  meditations: { title: "Meditations", author: "Marcus Aurelius" },
  walden: { title: "Walden", author: "Henry David Thoreau" },
};

/** Pairs that belong together, with the reason, read both ways. */
const PAIRS: Array<[string, string, string]> = [
  ["jane", "wuthering", "The Brontë sisters, published the same year, both out on the moors"],
  ["jane", "tenant", "Another Brontë heroine who won't be owned"],
  ["jane", "villette", "Charlotte Brontë again, quieter and stranger"],
  ["jane", "northsouth", "A plain-spoken heroine and a proud man"],
  ["jane", "screw", "A governess, a lonely house, something not right"],
  ["jane", "expectations", "An orphan growing up in Victorian England"],
  ["wuthering", "floss", "Passion, family and a landscape that matters"],
  ["pride", "persuasion", "Austen's last novel, and her most tender"],
  ["pride", "emma", "Austen, with a heroine who gets everything wrong"],
  ["pride", "sense", "Austen's sisters, sense against feeling"],
  ["pride", "northsouth", "Pride and prejudice, among the cotton mills"],
  ["pride", "cranford", "Small-town manners, gently funny"],
  ["pride", "littlewomen", "Sisters, suitors and money worries"],
  ["pride", "innocence", "A society's rules, and what they cost"],
  ["emma", "northanger", "Austen laughing at her heroine"],
  ["northanger", "usher", "The gothic Catherine was reading about"],
  ["middlemarch", "northsouth", "Victorian England in full, through a woman's eyes"],
  ["middlemarch", "floss", "George Eliot again"],
  ["middlemarch", "portrait", "A bright young woman and a disastrous marriage"],
  ["middlemarch", "anna", "A whole society around an unhappy marriage"],
  ["portrait", "mirth", "A heroine on the marriage market"],
  ["mirth", "innocence", "Wharton's New York"],
  ["innocence", "gatsby", "Old money and new, in New York"],
  ["gatsby", "paradise", "Fitzgerald's first, as the jazz age arrives"],
  ["gatsby", "sunrises", "The lost generation, drinking through Europe"],
  ["gatsby", "dalloway", "A party, the war's shadow, and a life looked back on"],
  ["gatsby", "mirth", "Money, beauty and a fall"],
  ["dalloway", "lighthouse", "Woolf again, time passing in a summer house"],
  ["dracula", "carmilla", "The vampire story Stoker read first"],
  ["dracula", "frankenstein", "The two great monsters of English fiction"],
  ["dracula", "jekyll", "Victorian horror, told in letters and confessions"],
  ["dracula", "whitewoman", "Diaries and letters, and a mystery that closes in"],
  ["dracula", "yellow", "Weird horror from the same decade"],
  ["frankenstein", "jekyll", "Science that goes too far"],
  ["frankenstein", "moreau", "A maker and the creatures he makes"],
  ["frankenstein", "invisible", "A scientist undone by his own discovery"],
  ["jekyll", "dorian", "A respectable face and a hidden self"],
  ["jekyll", "holmes", "Fog, London and a mystery"],
  ["jekyll", "treasure", "Stevenson, in daylight"],
  ["dorian", "yellow", "Decadent, beautiful and dangerous"],
  ["dorian", "earnest", "Wilde at his funniest"],
  ["yellow", "usher", "Dread that creeps up through a story"],
  ["usher", "screw", "A house that seems to want you"],
  ["treasure", "kidnapped", "Stevenson's other great adventure"],
  ["treasure", "crusoe", "Islands, castaways and buried things"],
  ["treasure", "cristo", "Treasure, and a long revenge"],
  ["crusoe", "gulliver", "Shipwrecked, and the world looks different"],
  ["gulliver", "proposal", "Swift at his most savage"],
  ["gulliver", "candide", "A satire sent round the world"],
  ["proposal", "candide", "Satire with a straight face"],
  ["quixote", "candide", "A dreamer let loose on the world"],
  ["quixote", "gulliver", "A traveller who sees what no one else does"],
  ["moby", "darkness", "A voyage into obsession"],
  ["moby", "leagues", "A captain at war with the sea"],
  ["moby", "bartleby", "Melville, in a law office instead of a whaler"],
  ["moby", "scarlet", "Melville dedicated Moby-Dick to Hawthorne"],
  ["darkness", "lordjim", "Conrad again, with Marlow telling it"],
  ["leagues", "journey", "Verne underground instead of underwater"],
  ["leagues", "eighty", "Verne against the clock"],
  ["timemachine", "worlds", "Wells, inventing science fiction"],
  ["timemachine", "moreau", "Wells' darker scientific romances"],
  ["worlds", "invisible", "Wells again"],
  ["alice", "glass", "Alice, on the other side"],
  ["alice", "peter", "A child in a world with its own rules"],
  ["alice", "oz", "Fall into another world, find your way home"],
  ["peter", "garden", "Children and a hidden place of their own"],
  ["peter", "willows", "Edwardian childhood, golden and a little wild"],
  ["garden", "anne", "An orphan who changes everyone around her"],
  ["anne", "littlewomen", "Growing up, with books and big plans"],
  ["huck", "sawyer", "Twain, where Huck began"],
  ["huck", "kidnapped", "A boy on the run with an unlikely friend"],
  ["scarlet", "floss", "A woman judged by her town"],
  ["crime", "karamazov", "Dostoyevsky, guilt and God"],
  ["crime", "underground", "Where Raskolnikov's mind came from"],
  ["crime", "trial", "Guilt, and a city that closes in"],
  ["metamorphosis", "trial", "Kafka again"],
  ["underground", "metamorphosis", "A man alone in his room, against the world"],
  ["anna", "bovary", "Two wives who want more than they're allowed"],
  ["anna", "warpeace", "Tolstoy, on a larger canvas"],
  ["expectations", "twocities", "Dickens again"],
  ["expectations", "oliver", "Dickens' orphans"],
  ["oliver", "carol", "Dickens' London"],
  ["twocities", "miserables", "Revolution, sacrifice and love in France"],
  ["twocities", "cristo", "Prison, revolution and a man reborn"],
  ["cristo", "musketeers", "Dumas, swords drawn"],
  ["miserables", "hunchback", "Hugo's Paris"],
  ["holmes", "hound", "Holmes on the moor"],
  ["holmes", "moonstone", "The first great detective novel"],
  ["moonstone", "whitewoman", "Wilkie Collins again"],
  ["odyssey", "iliad", "Homer, the war before the voyage"],
  ["meditations", "walden", "How to live, written for oneself"],
];

const KIN = new Map<string, Array<{ key: string; why: string }>>();
for (const [a, b, why] of PAIRS) {
  KIN.set(a, [...(KIN.get(a) ?? []), { key: b, why }]);
  KIN.set(b, [...(KIN.get(b) ?? []), { key: a, why }]);
}

/** A title without its subtitle, ready to compare. */
const main = (title: string) => norm(title.split(/[:;]|,\s*or\b|\(/i)[0]);
const surname = (author: string) => norm(author).split(" ").pop() ?? "";

function classicOf(book: { title: string; authors: string[] }) {
  const t = main(book.title);
  const names = norm(book.authors.join(" "));
  // Long titles are unique enough on their own; short ones need the author too, so Emma stays Austen's.
  return Object.keys(C).find((key) => main(C[key].title) === t && (t.length >= 14 || names.includes(surname(C[key].author))));
}

/** The book in the library a classic is, if it's there. */
function ownedCopy(books: Book[], key: string) {
  return books.find((b) => classicOf(b) === key);
}

/** Subjects as single words, so "Love stories" and "Love -- Fiction" meet. */
const STOP = new Set(["fiction", "and", "the", "of", "in", "a", "stories", "tales", "novels", "literature", "english", "american", "century", "th", "19th", "20th"]);
const words = (book: Book) => new Set(book.tags.flatMap((t) => norm(t).split(" ")).filter((w) => w.length > 2 && !STOP.has(w)));

/** The book's subjects that share a word with these, as the tags write them, without "Fiction" and asides. */
function sharedSubjects(book: Book, shared: string[]) {
  const names = book.tags
    .filter((tag) => norm(tag).split(" ").some((w) => shared.includes(w)))
    .map((tag) => tag.replace(/\s*\([^)]*\)/g, "").split(/\s*--\s*|,\s*/)[0].trim())
    .filter(Boolean);
  return [...new Set(names)].slice(0, 2);
}

export type Suggestion =
  | { kind: "owned"; book: Book; why: string; score: number }
  | { kind: "free"; title: string; author: string; why: string; score: number };

/** Books to read after this one, from the library first, then free classics. */
export function suggestionsFor(seed: Book, books: Book[], limit = 4): Suggestion[] {
  const out = new Map<string, Suggestion>();
  const key = classicOf(seed);
  const seedWords = words(seed);
  const seedYear = parseInt(seed.published ?? "", 10);

  for (const kin of (key && KIN.get(key)) || []) {
    const copy = ownedCopy(books, kin.key);
    if (copy) {
      if (copy.id !== seed.id) out.set(copy.id, { kind: "owned", book: copy, why: kin.why, score: 10 });
    } else out.set(kin.key, { kind: "free", ...C[kin.key], why: kin.why, score: 9 });
  }

  for (const book of books) {
    if (book.id === seed.id || out.has(book.id)) continue;
    let score = 0;
    let why = "";
    if (seed.series && book.series === seed.series && (book.seriesIndex ?? 0) === (seed.seriesIndex ?? 0) + 1) {
      score += 8;
      why = `Next in ${seed.series}`;
    }
    if (book.authors[0] && book.authors[0] === seed.authors[0]) {
      score += 4;
      why ||= `More from ${book.authors[0]}`;
    }
    const theirs = words(book);
    const shared = [...seedWords].filter((w) => theirs.has(w));
    if (shared.length) {
      score += (6 * shared.length) / new Set([...seedWords, ...theirs]).size + shared.length * 0.5;
      why ||= `Shared subjects: ${sharedSubjects(book, shared).join(", ")}`;
    }
    const year = parseInt(book.published ?? "", 10);
    if (score && seedYear && year && Math.abs(seedYear - year) < 30) score += 0.5;
    if (score >= 1.5) out.set(book.id, { kind: "owned", book, why, score });
  }

  return [...out.values()]
    // Books already read count for less, but still show when nothing else does.
    .map((s) => (s.kind === "owned" && s.book.status === "finished" ? { ...s, score: s.score - 6 } : s))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** The books that say most about your taste: finished, well into, or loved. */
export function seedsOf(books: Book[], limit = 3) {
  return books
    .filter((b) => b.status === "finished" || (b.progress ?? 0) >= 0.25 || b.rating >= 4 || b.favorite)
    .sort((a, b) => (b.finishedAt ?? b.opened ?? 0) - (a.finishedAt ?? a.opened ?? 0))
    .slice(0, limit);
}

