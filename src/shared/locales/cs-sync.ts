/** Czech for e-readers on Wi-Fi and for Hardcover. English text as it is in the code, then its Czech. Counts: "{n} book|{n} books" → "{n} kniha|{n} knihy|{n} knih". */
const words: Record<string, string> = {
  // CrossPoint readers on Wi-Fi. Like every other e-reader, a čtečka.
  "E-readers on Wi-Fi": "Čtečky na Wi-Fi",
  "Look for CrossPoint readers": "Hledat čtečky s CrossPointem",
  "Xteink readers running CrossPoint take books over Wi-Fi while their File Transfer screen is open. Shelfed asks your own network only, and only while this is on.":
    "Čtečky Xteink s CrossPointem přijímají knihy přes Wi-Fi, dokud mají otevřenou obrazovku File Transfer. Shelfed se ptá jen ve vaší vlastní síti a jen když je tohle zapnuté.",
  Found: "Nalezena",
  "Its address": "Její adresa",
  "Drop books on it in the side panel, as on a Kindle.": "Přetahujte na ni knihy v postranním panelu, stejně jako na Kindle.",
  "Only if it isn't found by itself: the address on its File Transfer screen, like 192.168.1.40.":
    "Jen pokud se nenajde sama: adresa z její obrazovky File Transfer, třeba 192.168.1.40.",
  "On Wi-Fi": "Na Wi-Fi",
  "On Wi-Fi.": "Na Wi-Fi.",
  "On Wi-Fi, {n} of your books on it|On Wi-Fi, {n} of your books on it":
    "Na Wi-Fi, je v ní {n} vaše kniha|Na Wi-Fi, jsou v ní {n} vaše knihy|Na Wi-Fi, je v ní {n} vašich knih",
  "Your CrossPoint reader stopped answering. Check its File Transfer screen is still open.":
    "Čtečka s CrossPointem přestala odpovídat. Zkontrolujte, že má pořád otevřenou obrazovku File Transfer.",
  "Books it can't read as they are get an EPUB made first, then go over Wi-Fi into its Books folder.":
    "Knihám, které čtečka nepřečte tak, jak jsou, se nejdřív vytvoří EPUB. Pak půjdou přes Wi-Fi do její složky Books.",
  "Sends the books as they are, over Wi-Fi, into its Books folder.": "Pošle knihy tak, jak jsou, přes Wi-Fi do její složky Books.",

  // Hardcover. Its name stays as it is.
  "Keep what you're reading, what you've finished and your ratings the same here and on Hardcover, both ways. It stays off until you connect, and only ever talks to your own account.":
    "Ať je to, co čtete, co máte dočtené, i vaše hodnocení stejné tady i na Hardcoveru, oběma směry. Dokud se nepřipojíte, je to vypnuté, a mluví to jen s vaším vlastním účtem.",
  "Not in this copy of Shelfed yet": "V téhle verzi Shelfed zatím není",
  "Connecting to Hardcover comes in a later version.": "Připojení k Hardcoveru přijde v některé z dalších verzí.",
  "Connected as {name}": "Připojeno jako {name}",
  "Disconnecting tells Hardcover to forget Shelfed. Your books keep their status and ratings.":
    "Po odpojení Hardcover Shelfed zapomene. Vaše knihy si stav i hodnocení nechají.",
  Disconnect: "Odpojit",
  "Keep in step": "Udržovat v souladu",
  "A book you start, finish or rate here is marked the same there, with how far in you are. One marked there is marked the same here.":
    "Kniha, kterou tady začnete číst, dočtete nebo ohodnotíte, se tam označí stejně, i s tím, kde v ní jste. A co označíte tam, se stejně označí tady.",
  "In step": "V souladu",
  "Not in step yet": "Zatím nesladěno",
  "Shelfed looks every half hour while it's open, and soon after you change a book.":
    "Shelfed se podívá každou půlhodinu, dokud je otevřený, a chvíli poté, co knihu změníte.",
  "Bring into step now": "Sladit teď",
  "Bringing into step…": "Slaďuji…",
  "Hardcover keeps pages read, not your place in a book, so a book still opens where you stopped in Shelfed. Books only on Hardcover stay there; ones you mark here are added there.":
    "Hardcover si pamatuje přečtené stránky, ne přesné místo v knize, takže kniha se dál otevře tam, kde jste v Shelfed skončili. Knihy, které jsou jen na Hardcoveru, tam zůstanou; ty, které označíte tady, se tam přidají.",
  "Connect your account": "Připojit váš účet",
  "Your browser opens Hardcover to say yes. Shelfed never sees your password.": "V prohlížeči se otevře Hardcover, kde to potvrdíte. Shelfed vaše heslo nikdy neuvidí.",
  "Waiting for Hardcover…": "Čekám na Hardcover…",
  "Connect Hardcover": "Připojit Hardcover",
  "Connected to Hardcover": "Připojeno k Hardcoveru",
  "Your reading here and there is now kept in step.": "Vaše čtení tady i tam se teď udržuje v souladu.",
  "Not connected": "Nepřipojeno",
  "In step with Hardcover": "V souladu s Hardcoverem",
  "Not in step": "Nesladěno",
  "{n} book wasn't found there.|{n} books weren't found there.": "{n} kniha se tam nenašla.|{n} knihy se tam nenašly.|{n} knih se tam nenašlo.",
  "{n} book brought up to date here|{n} books brought up to date here": "{n} kniha tady aktualizována|{n} knihy tady aktualizovány|{n} knih tady aktualizováno",
  "{n} sent to Hardcover|{n} sent to Hardcover": "{n} posláno na Hardcover|{n} posláno na Hardcover|{n} posláno na Hardcover",
  "Everything was already in step": "Všechno už bylo v souladu",
  "Couldn't reach Hardcover: {reason}": "Hardcover nejde zastihnout: {reason}",
  "Connecting to Hardcover isn't set up in this copy of Shelfed.": "Připojení k Hardcoveru není v téhle verzi Shelfed nastavené.",
  "Hardcover didn't answer in time. Try connecting again.": "Hardcover neodpověděl včas. Zkuste se připojit znovu.",
  "That answer wasn't from Hardcover. Try connecting again.": "Ta odpověď nepřišla od Hardcoveru. Zkuste se připojit znovu.",
  "Hardcover wasn't allowed. Nothing was connected.": "Hardcover jste nepovolili. Nic se nepřipojilo.",
  "Hardcover said no.": "Hardcover odmítl.",
  "Not connected to Hardcover.": "Hardcover není připojený.",
  "Hardcover has forgotten this connection. Connect again to carry on.": "Hardcover tohle připojení zapomněl. Připojte se znovu a pokračujte.",
  "Hardcover didn't say who you are.": "Hardcover neřekl, kdo jste.",
  "Hardcover didn't add it.": "Hardcover ji nepřidal.",
  Hardcover: "Hardcover",
};

export default words;
