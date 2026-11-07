import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { isPackaged: false } }));
const { connectWpd, Helper, pickDevice, startHelper, WpdBackend } = await import("../src/main/mtp/wpd");
const { NoMtp } = await import("../src/main/mtp/kindle");

/** A pretend helper program, answering what's written to it. */
function fake(answer: (message: { id: number; cmd: string; args: Record<string, unknown> }, say: (line: object) => void) => void) {
  let listener: (line: string) => void = () => {};
  let ended: (reason: string) => void = () => {};
  const link = {
    stopped: false,
    write: (line: string) => answer(JSON.parse(line), (out) => queueMicrotask(() => listener(JSON.stringify(out)))),
    onLine: (l: (line: string) => void) => void (listener = l),
    onEnd: (l: (reason: string) => void) => void (ended = l),
    stop() {
      link.stopped = true;
    },
  };
  return { link, end: (reason: string) => ended(reason), raw: (line: string) => listener(line) };
}

describe("the Windows helper", () => {
  it("matches each answer to its question, and passes progress along", async () => {
    const { link } = fake(({ id, cmd }, say) => {
      if (cmd === "send") say({ id, done: 100 });
      say({ id, ok: true, result: `${cmd}-answer` });
    });
    const helper = new Helper(link);
    const seen: number[] = [];
    await expect(helper.ask("send", {}, (done) => seen.push(done))).resolves.toBe("send-answer");
    await expect(helper.ask("other")).resolves.toBe("other-answer");
    expect(seen).toEqual([100]);
  });

  it("turns a helper's error into a rejection", async () => {
    const helper = new Helper(fake(({ id }, say) => say({ id, ok: false, error: "Open failed: 0x80070005" })).link);
    await expect(helper.ask("open")).rejects.toThrow("0x80070005");
  });

  it("doesn't leave a question hanging when the helper dies, or ask a dead one", async () => {
    const { link, end } = fake(() => {});
    const helper = new Helper(link);
    const asked = helper.ask("children");
    end("The helper stopped (1)");
    await expect(asked).rejects.toThrow("stopped");
    await expect(helper.ask("children")).rejects.toThrow("stopped");
  });

  it.each(["not json", "null", "5", '"text"', "[]", "{}", '{"id":"1"}', '{"id":99,"ok":true}'])("ignores the line %s", async (line) => {
    const f = fake(({ id }, say) => {
      f.raw(line);
      say({ id, ok: true, result: 1 });
    });
    await expect(new Helper(f.link).ask("x")).resolves.toBe(1);
  });

  it("ignores a line that isn't JSON", async () => {
    const f = fake(({ id }, say) => {
      f.raw("not json");
      say({ id, ok: true, result: 1 });
    });
    await expect(new Helper(f.link).ask("x")).resolves.toBe(1);
  });

  it("gives a Windows backend's answers in the same shape as any other", async () => {
    const asked: Array<[string, Record<string, unknown>]> = [];
    const helper = new Helper(
      fake(({ id, cmd, args }, say) => {
        asked.push([cmd, args]);
        say({ id, ok: true, result: cmd === "read" ? Buffer.from("hello").toString("base64") : [] });
      }).link,
    );
    const backend = new WpdBackend(helper);
    await backend.children("s1", null);
    await backend.children("s1", "o9");
    expect(asked.map(([, args]) => args.parent)).toEqual(["s1", "o9"]);
    expect((await backend.read("o9", 0, 5))?.toString()).toBe("hello");
  });
});

describe("a helper that gets stuck", () => {
  beforeEach(() => void vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => void vi.useRealTimers());

  it("is stopped after a long silence, and what's waiting is told", async () => {
    const { link } = fake(() => {});
    const asked = new Helper(link).ask("children").catch((error) => error);
    await vi.advanceTimersByTimeAsync(121_000);
    expect(((await asked) as Error).message).toContain("stopped answering");
    expect(link.stopped).toBe(true);
  });

  it("won't take more questions after that", async () => {
    const helper = new Helper(fake(() => {}).link);
    const asked = helper.ask("children").catch(() => {});
    await vi.advanceTimersByTimeAsync(121_000);
    await asked;
    await expect(helper.ask("again")).rejects.toThrow("stopped answering");
  });

  it("gets as long as it needs while it keeps reporting", async () => {
    let id = 0;
    const f = fake((message) => void (id = message.id));
    const helper = new Helper(f.link);
    const asked = helper.ask("send");
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(100_000);
      f.raw(JSON.stringify({ id, done: i }));
    }
    expect(f.link.stopped).toBe(false);
    f.raw(JSON.stringify({ id, ok: true, result: "sent" }));
    await expect(asked).resolves.toBe("sent");
  });

  it("isn't stopped for being quiet with nothing to do", async () => {
    const f = fake(({ id }, say) => say({ id, ok: true, result: 1 }));
    await new Helper(f.link).ask("x");
    await vi.advanceTimersByTimeAsync(500_000);
    expect(f.link.stopped).toBe(false);
  });
});

describe("which Windows device is the Kindle", () => {
  const kindle = "\\\\?\\usb#vid_1949&pid_9981#g0901234567890ab#{6ac27878}";
  const phone = "\\\\?\\usb#vid_18d1&pid_4ee1#abc#{6ac27878}";
  const other = "\\\\?\\usb#vid_1949&pid_9981#g09zzzzzzzzzzzz#{6ac27878}";

  it("goes by the serial, whatever its case", () => {
    expect(pickDevice([{ id: phone }, { id: other }, { id: kindle }], "G0901234567890AB")?.id).toBe(kindle);
  });

  it("takes the only Kindle when the serial isn't in its id", () => {
    expect(pickDevice([{ id: phone }, { id: kindle }], "SOMETHINGELSE")?.id).toBe(kindle);
  });

  it("never takes a phone, or guesses between two Kindles", () => {
    expect(pickDevice([{ id: phone }], "abc")).toBeUndefined();
    expect(pickDevice([{ id: kindle }, { id: other }], "SOMETHINGELSE")).toBeUndefined();
  });
});

describe("connecting through the helper", () => {
  const kindleId = "\\\\?\\usb#vid_1949&pid_9981#g0901#{x}";
  const helperWith = (answers: Record<string, unknown>) => {
    const asked: Array<[string, Record<string, unknown>]> = [];
    const { link } = fake(({ id, cmd, args }, say) => {
      asked.push([cmd, args]);
      const answer = answers[cmd];
      say(answer instanceof Error ? { id, ok: false, error: answer.message } : { id, ok: true, result: answer ?? true });
    });
    return { helper: new Helper(link), link, asked };
  };

  it("opens the Kindle it finds", async () => {
    const { helper, asked } = helperWith({ devices: [{ id: kindleId, name: "Kindle" }] });
    const { backend } = await connectWpd("G0901", helper);
    expect(asked[1]).toEqual(["open", { id: kindleId }]);
    expect(backend).toBeInstanceOf(WpdBackend);
  });

  it("keeps the serial out of what it says about the device", async () => {
    const { helper } = helperWith({ devices: [{ id: kindleId, name: "Kindle" }] });
    const { about } = await connectWpd("G0901", helper);
    expect(about).toContain("vid_1949");
    expect(about?.toLowerCase()).not.toContain("g0901");
  });

  it("tells the helper how big a file should be, so it can stop if there's more", async () => {
    const { helper, asked } = helperWith({ fetch: true });
    await new WpdBackend(helper).fetch("o1", "/tmp/x", 123);
    expect(asked[0]).toEqual(["fetch", { id: "o1", path: "/tmp/x", size: 123 }]);
  });

  it("says there's no MTP when Windows doesn't list it, and stops the helper", async () => {
    const { helper, link } = helperWith({ devices: [] });
    await expect(connectWpd("G0901", helper)).rejects.toBeInstanceOf(NoMtp);
    expect(link.stopped).toBe(true);
  });

  it("stops the helper when the Kindle won't open", async () => {
    const { helper, link } = helperWith({ devices: [{ id: kindleId, name: "Kindle" }], open: new Error("Open failed: 0x80070005") });
    await expect(connectWpd("G0901", helper)).rejects.toThrow("0x80070005");
    expect(link.stopped).toBe(true);
  });

  it("stops the helper on closing, even when it can't say goodbye", async () => {
    const { helper, link } = helperWith({ close: new Error("gone") });
    await new WpdBackend(helper).close();
    expect(link.stopped).toBe(true);
  });
});

describe("the helper as a real running program", () => {
  /** A stand-in helper, run by Node: echoes each request, in lines broken up on purpose. */
  const script = (body: string) => ["-e", `require("readline").createInterface({input:process.stdin}).on("line",(line)=>{const m=JSON.parse(line);${body}})`];

  it("reads answers however the output is chopped up, with non-English names intact", async () => {
    const helper = startHelper(process.execPath, script(`const out=JSON.stringify({id:m.id,ok:true,result:"Žluťoučký 😀"})+"\\n";process.stdout.write(out.slice(0,5));setTimeout(()=>process.stdout.write(out.slice(5)),20);`));
    try {
      await expect(helper.ask("x")).resolves.toBe("Žluťoučký 😀");
    } finally {
      helper.stop();
    }
  });

  it("reads two answers that arrive together", async () => {
    const helper = startHelper(process.execPath, script(`process.stdout.write(JSON.stringify({id:m.id,done:7})+"\\n"+JSON.stringify({id:m.id,ok:true,result:1})+"\\n");`));
    try {
      const seen: number[] = [];
      await expect(helper.ask("x", {}, (done) => seen.push(done))).resolves.toBe(1);
      expect(seen).toEqual([7]);
    } finally {
      helper.stop();
    }
  });

  it("fails what's waiting when the program dies, and doesn't crash writing to it after", async () => {
    const helper = startHelper(process.execPath, script(`process.exit(3);`));
    await expect(helper.ask("x")).rejects.toThrow("stopped (3)");
    await expect(helper.ask("y")).rejects.toThrow("stopped (3)");
  });

  it("doesn't crash writing to a helper that has stopped listening", async () => {
    // It closes its input and lives on a moment, so the write hits a closed pipe. Node reports
    // that as an error event, which would bring the whole app down with no one listening.
    const helper = startHelper(process.execPath, ["-e", "process.stdin.destroy();setTimeout(()=>process.exit(0),400)"]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(helper.ask("x", { pad: "x".repeat(1 << 20) })).rejects.toThrow("stopped");
  });

  it("fails what's waiting when it's stopped", async () => {
    const helper = startHelper(process.execPath, script(""));
    const asked = helper.ask("x");
    helper.stop();
    await expect(asked).rejects.toThrow("stopped");
  });

  it("says so when the program can't be found", () => {
    expect(() => startHelper("/nowhere/kindle-wpd.exe")).toThrow("No helper");
  });
});
