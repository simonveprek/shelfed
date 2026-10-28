import { useState } from "react";
import { useTheme } from "next-themes";
import { ArrowDataTransferHorizontalIcon, BookOpen01Icon, Settings01Icon, Tablet01Icon } from "@hugeicons/core-free-icons";
import {
  Alert, Badge, Button, Dialog, DialogHeader, Field, Input, Segmented, Select, SwitchRow, Tabs, TabsContent, TabsList, TabsTrigger, TextLink, toast,
} from "@/components/ui";
import { api, isMac } from "@/lib/api";
import { hydrate, setSetting, useStore } from "@/lib/store";
import { useKindlePort } from "@/lib/kindle";
import { FINISHES, KINDLES, kindleById } from "../../../shared/kindles";
import { ColourPicker } from "./Colours";
import { Kindle3D } from "./Kindle3D";

function Line({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border py-4 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-label font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-caption break-all text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function General() {
  const settings = useStore((s) => s.settings);
  const version = useStore((s) => s.version);
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <Line label="Library folder" hint={settings.libraryPath}>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => api.revealLibrary()}>Open</Button>
          <Button
            size="sm"
            onClick={async () => {
              const state = await api.moveLibrary();
              if (state) {
                hydrate(state);
                toast.success("Switched to the new library folder");
              }
            }}
          >
            Change
          </Button>
        </div>
      </Line>
      <Line label="Appearance">
        <Segmented
          label="Appearance"
          size="sm"
          value={(theme as "system" | "light" | "dark") ?? "system"}
          onChange={setTheme}
          options={[{ id: "system", label: "Auto" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }]}
        />
      </Line>
      <Line label="Welcome" hint="The short story Shelf opens with the first time.">
        <Button size="sm" onClick={() => useStore.setState({ dialog: null, onboarding: true })}>Show again</Button>
      </Line>
      <p className="pt-4 text-caption text-muted">Shelf {version}, built on Fragms Personal.</p>
    </div>
  );
}

/** Your Kindle, recognised when it's plugged in or picked from the list, in 3D. */
function YourKindle() {
  const kindle = useStore((s) => s.settings.kindle);
  const books = useStore((s) => s.books);
  const found = useKindlePort()?.usb ?? null;
  const model = kindleById(kindle.model);
  const finish = model && kindle.finish && model.finishes.includes(kindle.finish) ? kindle.finish : model?.finishes[0];
  const reading = books.filter((b) => b.status === "reading").sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0))[0];
  const plugged = found?.find((k) => k.model === model?.id);
  const stranger = Boolean(found?.length) && !found?.some((k) => k.model);
  const set = (patch: Partial<typeof kindle>) => setSetting({ kindle: { ...useStore.getState().settings.kindle, ...patch } });

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-[18px] border border-border bg-well px-6 py-6">
      <div className="flex w-[200px] shrink-0 justify-center">
        {model ? (
          <Kindle3D model={model} finish={finish} book={reading} height={model.size[1] > 200 ? 230 : 210} />
        ) : (
          <div className="flex h-[210px] w-[150px] items-center justify-center rounded-[14px] border border-dashed border-line-strong p-4 text-center text-caption text-muted">
            Plug it in, or pick it from the list
          </div>
        )}
      </div>
      <div className="flex min-w-[220px] flex-1 flex-col gap-4">
        <div>
          <p className="text-caption text-muted">Your Kindle</p>
          <p className="mt-0.5 text-heading">{model?.name ?? "Not known yet"}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted">
            {model && <span>{model.year}, {model.screen}″ {model.colour ? "colour " : ""}screen</span>}
            {plugged && <Badge tone="success">Plugged in</Badge>}
            {stranger && <Badge>A Kindle Shelf doesn't know is plugged in</Badge>}
          </p>
        </div>
        <Select
          label="Model"
          size="sm"
          value={kindle.model ?? ""}
          onChange={(id) => {
            const picked = kindleById(id);
            set({ model: picked?.id, finish: picked?.finishes[0], picked: Boolean(picked) });
          }}
          options={[{ id: "", label: "Recognise it when plugged in" }, ...[...KINDLES].reverse().map((k) => ({ id: k.id, label: `${k.name}, ${k.year}` }))]}
        />
        {model && model.finishes.length > 1 && (
          <ColourPicker
            any={false}
            value={FINISHES[finish!].hex}
            options={model.finishes.map((f) => [FINISHES[f].hex, FINISHES[f].label])}
            onChange={(hex) => set({ finish: model.finishes.find((f) => FINISHES[f].hex === hex) })}
          />
        )}
      </div>
    </div>
  );
}

function Kindle() {
  const kindle = useStore((s) => s.settings.kindle);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [server, setServer] = useState(Boolean(kindle.host) && !kindle.from);
  const set = (patch: Partial<typeof kindle>) => setSetting({ kindle: { ...useStore.getState().settings.kindle, ...patch } });

  const verify = async () => {
    setChecking(true);
    try {
      if (password) {
        await api.setPassword(password);
        set({ hasPassword: true });
        setPassword("");
      }
      await new Promise((r) => setTimeout(r, 350));
      await api.verifyMail();
      toast.success("Signed in to your mail. Ready to send");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <YourKindle />
      <Alert title="How it works">
        Amazon gives every Kindle an email address. Shelf mails books there from your own account. First add the address you send from to the approved list in Amazon’s{" "}
        <TextLink href="https://www.amazon.com/mycd">Content and Devices</TextLink> settings.
      </Alert>
      <Line label="Highlights from your Kindle" hint="Brings the highlights and notes you made on a Kindle into the books here.">
        <Button size="sm" onClick={() => import("./Clippings").then((m) => m.importClippings())}>Import</Button>
      </Line>
      <Field label="Your Kindle’s address" hint="Find it in Amazon under Preferences, Personal Document Settings.">
        <Input placeholder="you_abc123@kindle.com" value={kindle.to} onChange={(e) => set({ to: e.target.value.trim() })} />
      </Field>
      <Field label="Send from">
        <Input
          placeholder="you@gmail.com"
          value={kindle.from}
          onChange={async (e) => {
            const from = e.target.value.trim();
            set({ from, user: kindle.user && kindle.user !== kindle.from ? kindle.user : from });
            const preset = await api.smtpPreset(from);
            if (preset) set(preset);
          }}
        />
      </Field>
      <Field
        label={<span className="flex items-center gap-2">Mail password {kindle.hasPassword && <Badge tone="success">Saved in the {isMac ? "Keychain" : "system vault"}</Badge>}</span>}
        hint="Gmail, iCloud, Outlook and Yahoo want an app password, made in your account’s security settings."
      >
        <Input type="password" placeholder={kindle.hasPassword ? "Saved" : "App password"} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {server ? (
        <div className="grid grid-cols-6 gap-3">
          <Field label="Mail server" className="col-span-4">
            <Input placeholder="smtp.example.com" value={kindle.host} onChange={(e) => set({ host: e.target.value.trim() })} />
          </Field>
          <Field label="Port" className="col-span-2">
            <Input inputMode="numeric" value={kindle.port} onChange={(e) => set({ port: Number(e.target.value) || 0, secure: Number(e.target.value) === 465 })} />
          </Field>
          <Field label="User name" className="col-span-6">
            <Input placeholder={kindle.from} value={kindle.user} onChange={(e) => set({ user: e.target.value.trim() })} />
          </Field>
        </div>
      ) : (
        <p className="text-label text-muted">
          {kindle.host ? `Sends through ${kindle.host}. ` : "The mail server is filled in for common services. "}
          <button className="font-medium text-foreground underline decoration-underline underline-offset-4" onClick={() => setServer(true)}>Change it</button>
        </p>
      )}
      <Line label="Send as" hint="EPUB looks best on Kindle. Other books are made into EPUB before sending.">
        <Segmented
          label="Send as"
          size="sm"
          value={kindle.format}
          onChange={(format) => set({ format })}
          options={[{ id: "epub", label: "EPUB" }, { id: "pdf", label: "PDF" }, { id: "original", label: "As is" }]}
        />
      </Line>
      <div className="flex justify-end">
        <Button variant="primary" disabled={checking || !kindle.from || !kindle.host || (!password && !kindle.hasPassword)} onClick={verify}>
          {checking ? "Checking" : password ? "Save and check" : "Check connection"}
        </Button>
      </div>
    </div>
  );
}

function Converting() {
  const calibre = useStore((s) => s.calibre);
  const pdfPage = useStore((s) => s.settings.pdfPage);
  return (
    <div>
      <Line label="Calibre" hint={calibre ?? "Optional. With it Shelf also makes AZW3, MOBI and Word files, and Kindle formats for the cable."}>
        {calibre ? (
          <Badge tone="success" size="md">Found</Badge>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => api.openExternal("https://calibre-ebook.com/download")}>Get Calibre</Button>
            <Button
              size="sm"
              onClick={async () => {
                const found = await api.pickCalibre();
                useStore.setState({ calibre: found });
                if (!found) toast.error("That is not Calibre's converter");
              }}
            >
              Locate
            </Button>
          </div>
        )}
      </Line>
      <Line label="PDF page size" hint="Kindle makes pages the size of a Paperwhite screen.">
        <Segmented
          label="PDF page size"
          size="sm"
          value={pdfPage}
          onChange={(pdfPage) => setSetting({ pdfPage })}
          options={[{ id: "A5", label: "A5" }, { id: "A4", label: "A4" }, { id: "Letter", label: "Letter" }, { id: "Kindle", label: "Kindle" }]}
        />
      </Line>
      <p className="pt-4 text-label text-muted">
        Built in, with nothing else to install. EPUB, MOBI, AZW3, FB2, comics, PDF, Word, Markdown, web pages and text become EPUB, PDF, plain text or a web page.
      </p>
    </div>
  );
}

function Reading() {
  const reader = useStore((s) => s.settings.reader);
  const set = (patch: Partial<typeof reader>) => setSetting({ reader: { ...reader, ...patch } });
  return (
    <div>
      <Line label="Page turns">
        <Segmented label="Page turns" size="sm" value={reader.flow} onChange={(flow) => set({ flow })} options={[{ id: "paginated", label: "Pages" }, { id: "scrolled", label: "Scroll" }]} />
      </Line>
      <Line label="Typeface">
        <Segmented label="Typeface" size="sm" value={reader.font} onChange={(font) => set({ font })} options={[{ id: "publisher", label: "The book’s" }, { id: "serif", label: "Serif" }, { id: "sans", label: "Sans" }]} />
      </Line>
      <div className="py-2">
        <SwitchRow label="Justify text" hint="Even edges on both sides, with hyphens." checked={reader.justify} onChange={(justify) => set({ justify })} />
      </div>
      <p className="pt-2 text-label text-muted">Size, spacing and page colour change from the Aa button while reading.</p>
    </div>
  );
}

export function SettingsDialog({ tab }: { tab?: "general" | "kindle" | "convert" | "reading" }) {
  return (
    <Dialog open onClose={() => useStore.setState({ dialog: null })} label="Settings" className="sm:max-w-[620px]">
      <DialogHeader title="Settings" />
      <Tabs defaultValue={tab ?? "general"} className="px-6 pt-5 pb-6">
        <TabsList label="Settings" block>
          <TabsTrigger value="general" icon={Settings01Icon}>General</TabsTrigger>
          <TabsTrigger value="kindle" icon={Tablet01Icon}>Kindle</TabsTrigger>
          <TabsTrigger value="convert" icon={ArrowDataTransferHorizontalIcon}>Converting</TabsTrigger>
          <TabsTrigger value="reading" icon={BookOpen01Icon}>Reading</TabsTrigger>
        </TabsList>
        <div className="scroll mt-5 max-h-[58vh] min-h-[340px]">
          <TabsContent value="general"><General /></TabsContent>
          <TabsContent value="kindle"><Kindle /></TabsContent>
          <TabsContent value="convert"><Converting /></TabsContent>
          <TabsContent value="reading"><Reading /></TabsContent>
        </div>
      </Tabs>
    </Dialog>
  );
}
